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
 */

import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { medlineFetch, dailymedFetch } from "./http";

/** Code system OID mapping for MedlinePlus Connect */
const CODE_SYSTEM_OIDS: Record<string, string> = {
    "icd10": "2.16.840.1.113883.6.90",
    "ndc": "2.16.840.1.113883.6.69",
    "loinc": "2.16.840.1.113883.6.1",
    "snomed": "2.16.840.1.113883.6.96",
    "icd9": "2.16.840.1.113883.6.103",
    "cpt": "2.16.840.1.113883.6.12",
    "rxnorm": "2.16.840.1.113883.6.88",
};

/**
 * Parse a MedlinePlus virtual path and return the real query parameters.
 *
 * Virtual paths:
 *   /topic/icd10/{code}   → code system lookup
 *   /topic/ndc/{code}     → code system lookup
 *   /topic/loinc/{code}   → code system lookup
 *   /topic/snomed/{code}  → code system lookup
 *   /topic/icd9/{code}    → code system lookup
 *   /topic/cpt/{code}     → code system lookup
 *   /topic/rxnorm/{code}  → code system lookup
 */
function buildMedlinePlusParams(
    virtualPath: string,
    requestParams?: Record<string, unknown>,
): { path: string; params: Record<string, unknown> } {
    // Match /topic/{codeSystem}/{code}
    const topicMatch = virtualPath.match(/^\/topic\/(\w+)\/(.+)$/);
    if (topicMatch) {
        const codeSystem = topicMatch[1].toLowerCase();
        const code = topicMatch[2];
        const oid = CODE_SYSTEM_OIDS[codeSystem];

        if (!oid) {
            throw new Error(
                `Unknown code system: ${codeSystem}. Supported: ${Object.keys(CODE_SYSTEM_OIDS).join(", ")}`,
            );
        }

        return {
            path: "/service",
            params: {
                "mainSearchCriteria.v.cs": oid,
                "mainSearchCriteria.v.c": code,
                "knowledgeResponseType": "application/json",
                ...requestParams,
            },
        };
    }

    // Fallback: pass through to /service with any provided params
    return {
        path: virtualPath === "/" ? "/service" : virtualPath,
        params: {
            knowledgeResponseType: "application/json",
            ...requestParams,
        },
    };
}

/**
 * Create an ApiFetchFn that routes through medlineFetch/dailymedFetch.
 * No auth needed — both APIs are public.
 */
export function createPatedApiFetch(): ApiFetchFn {
    return async (request) => {
        let response: Response;
        const path = request.path;

        if (path.startsWith("/medline/") || path === "/medline") {
            // Strip /medline prefix and route to MedlinePlus Connect
            const medlinePath = path.replace(/^\/medline/, "") || "/";
            const { path: realPath, params: realParams } = buildMedlinePlusParams(
                medlinePath,
                request.params,
            );
            response = await medlineFetch(realPath, realParams);
        } else if (path.startsWith("/dailymed/") || path === "/dailymed") {
            // Strip /dailymed prefix and route to DailyMed Services
            const dailymedPath = path.replace(/^\/dailymed/, "") || "/";
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
