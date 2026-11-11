/**
 * Patient Education API adapter — multi-API routing for Code Mode.
 *
 * Routes virtual paths to the correct upstream API:
 *   /medline/*   → MedlinePlus Connect (with OID code system translation)
 *   /dailymed/*  → DailyMed Services
 *
 * MedlinePlus Connect uses unusual query parameters with OID-based code systems.
 * The adapter translates clean virtual paths into the actual API parameters:
 *   /medline/topic/icd10/{code}   → /service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.90&...
 *   /medline/topic/ndc/{code}     → /service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.69&...
 *   /medline/topic/loinc/{code}   → /service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.1&...
 *   /medline/topic/snomed/{code}  → /service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.96&...
 *
 * NOTE: DailyMed's /v2/spls/{setid}.json endpoint returns HTTP 415 because the
 * API only serves individual SPL documents as XML. The adapter transparently
 * fetches the .xml variant and converts it to a structured JSON object.
 */

import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { commercialMedlineFetch } from "./commercial-profile";
import { dailymedFetch } from "./http";
import { medlineApiFetch } from "./medline";

// ---------------------------------------------------------------------------
// DailyMed SPL detail: XML → JSON conversion
// ---------------------------------------------------------------------------

/**
 * Regex to detect the SPL single-item detail path.
 * Matches /v2/spls/{uuid}.json but NOT /v2/spls/{uuid}/media.json etc.
 */
const SPL_DETAIL_RE = /^\/v2\/spls\/([0-9a-f-]{36})\.json$/i;

/** Strip XML/HTML tags and decode common entities. */
function stripTags(text: string): string {
    if (!text) return "";
    return text
        .replace(/<[^>]*>/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Known SPL section LOINC codes → human-readable labels. */
const SECTION_LABELS: Record<string, string> = {
    "34066-1": "boxed_warning",
    "34067-9": "indications_and_usage",
    "34068-7": "dosage_and_administration",
    "43678-2": "dosage_forms_and_strengths",
    "34070-3": "contraindications",
    "43685-7": "warnings_and_precautions",
    "34084-4": "adverse_reactions",
    "34073-7": "drug_interactions",
    "43684-0": "use_in_specific_populations",
    "42228-7": "pregnancy",
    "34074-5": "description",
    "34090-1": "clinical_pharmacology",
    "34092-7": "clinical_studies",
    "34069-5": "how_supplied",
    "34071-1": "warnings",
    "42229-5": "spl_unclassified_section",
    "34076-0": "patient_information",
    "34075-2": "laboratory_tests",
    "34083-6": "carcinogenesis_and_mutagenesis",
    "43680-8": "nonclinical_toxicology",
    "34088-5": "overdosage",
    "49489-8": "pharmacogenomics",
    "34093-5": "references",
    "48780-1": "spl_product_data",
    "51945-4": "package_label",
};

interface SplSection {
    code: string;
    label: string;
    title: string;
    text: string;
}

/**
 * Extract all text content from a section block, including nested
 * subsections. Recursively collects <text> content and subsection titles.
 */
function extractAllText(block: string): string {
    const parts: string[] = [];

    // Collect all <text>...</text> blocks (including nested subsection text)
    const textRegex = /<text>([\s\S]*?)<\/text>/g;
    for (let tm = textRegex.exec(block); tm !== null; tm = textRegex.exec(block)) {
        const stripped = stripTags(tm[1]);
        if (stripped) parts.push(stripped);
    }

    return parts.join("\n\n");
}

/**
 * Find top-level <component><section>...</section></component> blocks
 * within the structuredBody. Uses a simple depth-counting approach
 * rather than non-greedy regex to handle nested sections correctly.
 */
function extractTopLevelSections(xml: string): string[] {
    const results: string[] = [];
    // Find <structuredBody> content
    const bodyStart = xml.indexOf("<structuredBody>");
    if (bodyStart === -1) return results;

    // Look for top-level <component><section blocks within structuredBody
    const bodyEnd = xml.indexOf("</structuredBody>", bodyStart);
    const body = xml.substring(bodyStart, bodyEnd === -1 ? undefined : bodyEnd);

    // Split on top-level <component> boundaries within structuredBody.
    // We find each <component> that directly contains a <section>.
    const componentRegex = /<component>\s*<section[\s>]/g;
    const starts: number[] = [];

    for (let cm = componentRegex.exec(body); cm !== null; cm = componentRegex.exec(body)) {
        starts.push(cm.index);
    }

    for (let i = 0; i < starts.length; i++) {
        // Find the matching </component> by counting depth
        const start = starts[i];
        let depth = 0;
        let pos = start;
        let endPos = -1;

        while (pos < body.length) {
            const nextOpen = body.indexOf("<component>", pos);
            const nextClose = body.indexOf("</component>", pos);

            if (nextClose === -1) break;

            if (nextOpen !== -1 && nextOpen < nextClose) {
                depth++;
                pos = nextOpen + 11;
            } else {
                depth--;
                if (depth === 0) {
                    endPos = nextClose + 12;
                    break;
                }
                pos = nextClose + 12;
            }
        }

        if (endPos > start) {
            results.push(body.substring(start, endPos));
        }
    }

    return results;
}

/**
 * Parse DailyMed SPL XML into a structured JSON object.
 *
 * Extracts drug name, setid, version, effective date, and all labeled
 * sections (indications, dosage, warnings, etc.) with plain-text content.
 * Handles nested <component><section> structures correctly.
 */
function parseSplXml(xml: string): Record<string, unknown> {
    // Extract document-level metadata
    const setidMatch = xml.match(/<setId[^>]*root="([^"]+)"/);
    const versionMatch = xml.match(/<versionNumber[^>]*value="([^"]+)"/);
    const effectiveMatch = xml.match(/<effectiveTime[^>]*value="([^"]+)"/);
    const titleMatch = xml.match(/<title>([\s\S]*?)<\/title>/);

    // Extract drug name from manufacturedProduct
    const drugNameMatch = xml.match(
        /<manufacturedProduct[\s\S]*?<name>([^<]+)<\/name>/,
    );

    // Extract top-level section blocks (handles nesting properly)
    const sectionBlocks = extractTopLevelSections(xml);
    const sections: SplSection[] = [];

    for (const block of sectionBlocks) {
        // Extract LOINC code from the top-level section
        const codeMatch = block.match(/<section[\s\S]*?<code[^>]*code="([^"]+)"/);
        const code = codeMatch ? codeMatch[1] : "unknown";
        const label = SECTION_LABELS[code] || code;

        // Extract title from the top-level section (first <title> only)
        const secTitleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
        const title = secTitleMatch ? stripTags(secTitleMatch[1]) : "";

        // Extract ALL text content including from nested subsections
        const text = extractAllText(block);

        // Skip empty sections and the product data section (structured, not text)
        if (!text && !title) continue;
        if (code === "48780-1") continue;

        sections.push({ code, label, title, text });
    }

    // Return sections as a flat array so the staging pipeline can materialize
    // them into a queryable SQLite table for large SPLs.
    return {
        setid: setidMatch ? setidMatch[1] : null,
        version: versionMatch ? versionMatch[1] : null,
        effective_date: effectiveMatch ? effectiveMatch[1] : null,
        title: titleMatch ? stripTags(titleMatch[1]) : null,
        drug_name: drugNameMatch ? drugNameMatch[1] : null,
        sections,
        _note: "Converted from DailyMed SPL XML. The DailyMed API does not serve individual SPL detail as JSON.",
    };
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

/**
 * Create an ApiFetchFn routing through medlineApiFetch/dailymedFetch.
 * No auth needed — both APIs are public.
 */
export function createPatedApiFetch(): ApiFetchFn {
    return async (request) => {
        let response: Response;
        const path = request.path;

        if (path.startsWith("/medline/") || path === "/medline") {
            // License audit 2026-11-10: a reselling caller gets links only for
            // A.D.A.M. and ASHP content (see ./commercial-profile). DailyMed
            // drug labels (FDA SPL) are public and are not changed.
            return request.licenseProfile === "commercial" ? commercialMedlineFetch(request) : medlineApiFetch(request);
        }if (path.startsWith("/dailymed/") || path === "/dailymed") {
            if (request.method !== "GET" || request.body !== undefined) throw new Error("DailyMed routes support GET without a body; form POST is available for /medline/* only");
            // Strip /dailymed prefix and route to DailyMed Services
            const dailymedPath = path.replace(/^\/dailymed/, "") || "/";

            // Check if this is a single SPL detail request (XML-only endpoint)
            const splDetailMatch = dailymedPath.match(SPL_DETAIL_RE);
            if (splDetailMatch) {
                // DailyMed returns 415 for /v2/spls/{setid}.json — fetch XML instead.
                // The .xml extension determines the response format; we set Accept
                // to */* so the server doesn't reject based on content negotiation.
                const setid = splDetailMatch[1];
                const xmlPath = `/v2/spls/${setid}.xml`;
                const xmlResponse = await dailymedFetch(xmlPath, undefined, {
                    headers: { Accept: "*/*" },
                });

                if (!xmlResponse.ok) {
                    let errorBody: string;
                    try {
                        errorBody = await xmlResponse.text();
                    } catch {
                        errorBody = xmlResponse.statusText;
                    }
                    const error = new Error(
                        `HTTP ${xmlResponse.status}: ${errorBody.slice(0, 200)}`,
                    ) as Error & { status: number; data: unknown };
                    error.status = xmlResponse.status;
                    error.data = errorBody;
                    throw error;
                }

                const xml = await xmlResponse.text();
                const data = parseSplXml(xml);
                return { status: 200, data };
            }

            response = await dailymedFetch(dailymedPath, request.params);
        } else {
            throw new Error(
                `Unknown API route: ${path}. Use /medline/* for MedlinePlus Connect or /dailymed/* for DailyMed.`,
            );
        }

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(
                `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
            ) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
