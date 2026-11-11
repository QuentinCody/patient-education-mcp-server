/**
 * The commercial license profile for MedlinePlus Connect results.
 *
 * License audit 2026-11-10: "Return links only for A.D.A.M. and ASHP content."
 * The terms (https://medlineplus.gov/about/using/usingcontent/) name two
 * classes of content. In the public domain: "Summaries on health topic pages",
 * "Medical test information" and "Summaries on Genetics pages". Licensed to
 * NLM for MedlinePlus only: "Any content from the A.D.A.M. Medical
 * Encyclopedia" and "Drug monographs from the American Society of
 * Health-System Pharmacists". For the licensed class: "You may not ingest
 * and/or brand the copyrighted content found on MedlinePlus in an EHR, patient
 * portal, or other health IT system", but "It is allowable to make single
 * direct links to the materials listed above."
 *
 * A reselling caller (`licenseProfile: "commercial"`) thus gets the title and
 * the link of each entry. The text stays only for an entry that this module
 * identifies as public-domain MedlinePlus content. Each other entry fails
 * closed: `summary` is null and `summary_withheld` gives the reason.
 *
 * Facts from the live service on 2026-11-10 that set the rule:
 * - A medication request (RxNorm, NDC) returns the first paragraph of the ASHP
 *   monograph as `summary`, and the entry has no ASHP attribution. The code
 *   system and the `/druginfo/` path identify it; a marker does not.
 * - A medication request can also return a health topic. The documentation of
 *   the provider does not describe that entry, so it is a link only too.
 * - No request returned an A.D.A.M. entry. The `/ency/` path and the marker
 *   check are the guard for a response that does.
 */

import { type ApiFetchFn, commercialUseRefusal } from "@bio-mcp/shared/codemode/catalog";
import { medlineApiFetch, medlineRequest } from "./medline";

type MedlineRequest = Parameters<ApiFetchFn>[0];
type MedlineJson = Extract<Awaited<ReturnType<typeof medlineApiFetch>>["data"], { topics: unknown }>;

export const MEDLINEPLUS_TERMS_URL = "https://medlineplus.gov/about/using/usingcontent/";

/**
 * Code systems whose results are public-domain text: diagnosis codes (health
 * topic and genetics summaries), lab test codes and procedure codes (medical
 * test information). A code system that is not in this list is links only:
 * RxNorm and NDC because their result is ASHP drug information, each other
 * value because its content type is not confirmed. The comparison is exact, so
 * a different spelling of an identifier is links only too.
 */
export const OPEN_TEXT_CODE_SYSTEMS: ReadonlySet<string> = new Set([
	"2.16.840.1.113883.6.90", // ICD-10-CM
	"2.16.840.1.113883.6.103", // ICD-9-CM
	"2.16.840.1.113883.6.96", // SNOMED CT
	"2.16.840.1.113883.6.1", // LOINC
	"2.16.840.1.113883.11.79", // LOINC, the second identifier that the service accepts
	"2.16.840.1.113883.6.12", // CPT
]);
const MEDICATION_CODE_SYSTEMS: ReadonlySet<string> = new Set([
	"2.16.840.1.113883.6.88", // RxNorm
	"2.16.840.1.113883.6.69", // NDC
]);

const DRUG_LABELS = "FDA drug labels are available on the /dailymed/* routes.";

/** The value of `summary_withheld`: why an entry gives its title and its link only. */
export const WITHHELD = {
	drugPage: `Licensed MedlinePlus drug information (AHFS Consumer Medication Information, American Society of Health-System Pharmacists). Use the link. ${DRUG_LABELS}`,
	encyclopedia: "Licensed A.D.A.M. Medical Encyclopedia content. Use the link.",
	ashpMarker: `The response carries an ASHP attribution, so its text is licensed content. Use the link. ${DRUG_LABELS}`,
	adamMarker: "The response carries an A.D.A.M. attribution, so its text is licensed content. Use the link.",
	medicationRequest: `A medication code request (RxNorm, NDC) returns licensed ASHP drug information, so each of its entries is a link only. ${DRUG_LABELS}`,
	unknownCodeSystem: "The content type of this code system is not confirmed as public domain. Use the link.",
	unknownSource: "The entry is not a MedlinePlus page, so its terms are not confirmed. Use the link.",
} as const;

const ASHP_MARKER = /Health[- ]System Pharmacists|\bASHP\b|\bAHFS\b|\bashp\.org/i;
const ADAM_MARKER = /A\.D\.A\.M|\bADAM,? Inc|\badam\.com|adamimages|\bEbix\b/i;

interface EntryFacts {
	codeSystem: string;
	/** The page of the entry: its first link. */
	url: string;
	/** Every link of the entry and its id. Links inside the summary are not locators. */
	locators: string;
	/** The entry and the feed fields as text, for the attribution markers. */
	text: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

function isMedlinePlusPage(url: string): boolean {
	try {
		return /^(?:www\.)?medlineplus\.gov$/i.test(new URL(url).hostname);
	} catch {
		return false;
	}
}

function entryFacts(entry: unknown, codeSystem: string, feedText: string): EntryFacts {
	const record = isRecord(entry) ? entry : {};
	const links: unknown[] = Array.isArray(record.link) ? record.link : [];
	const hrefs = links.map((link) => (isRecord(link) && typeof link.href === "string" ? link.href : ""));
	return {
		codeSystem,
		url: hrefs[0] ?? "",
		locators: [...hrefs, JSON.stringify(record.id ?? "")].join(" "),
		text: `${JSON.stringify(entry)} ${feedText}`,
	};
}

/** The first rule that applies gives the reason. No rule: the text is public domain. */
const RULES: ReadonlyArray<{ reason: string; applies: (facts: EntryFacts) => boolean }> = [
	{ reason: WITHHELD.drugPage, applies: (facts) => /\/druginfo\//i.test(facts.locators) },
	{ reason: WITHHELD.encyclopedia, applies: (facts) => /\/ency\//i.test(facts.locators) },
	{ reason: WITHHELD.ashpMarker, applies: (facts) => ASHP_MARKER.test(facts.text) },
	{ reason: WITHHELD.adamMarker, applies: (facts) => ADAM_MARKER.test(facts.text) },
	{ reason: WITHHELD.medicationRequest, applies: (facts) => MEDICATION_CODE_SYSTEMS.has(facts.codeSystem) },
	{ reason: WITHHELD.unknownCodeSystem, applies: (facts) => !OPEN_TEXT_CODE_SYSTEMS.has(facts.codeSystem) },
	{ reason: WITHHELD.unknownSource, applies: (facts) => !isMedlinePlusPage(facts.url) },
];

/**
 * Why a commercial product may not receive the text of this entry, or
 * undefined for public-domain MedlinePlus text. `feedText` is the feed without
 * its entries: an attribution marker there applies to each entry.
 */
export function withheldReason(entry: unknown, codeSystem: string, feedText = ""): string | undefined {
	const facts = entryFacts(entry, codeSystem, feedText);
	return RULES.find((rule) => rule.applies(facts))?.reason;
}

/** The fields of a provider entry that are not body text. Each other field is removed. */
const LINK_ONLY_FIELDS = ["title", "link", "id", "updated", "author", "rights"];

function linkOnlyEntry(entry: unknown, reason: string): Record<string, unknown> {
	const record = isRecord(entry) ? entry : {};
	const kept = LINK_ONLY_FIELDS.filter((key) => key in record).map((key) => [key, record[key]]);
	return { ...Object.fromEntries(kept), summary_withheld: reason };
}

/**
 * Apply the commercial profile to a MedlinePlus JSON result: in `topics` and
 * in `raw_response`, an entry with a reason keeps its title and its link only.
 */
export function linksOnlyForLicensedText(data: MedlineJson): Record<string, unknown> {
	const raw = data.raw_response;
	const feed = isRecord(raw) && isRecord(raw.feed) ? raw.feed : undefined;
	const entries: unknown[] = feed && Array.isArray(feed.entry) ? feed.entry : [];
	// `topics` is a projection of the entries. If the two disagree, no text is safe.
	if (entries.length !== data.topics.length) throw new Error("MedlinePlus entries and topics disagree; the commercial profile returns no text");
	const feedText = JSON.stringify({ ...(isRecord(raw) ? raw : {}), feed: { ...feed, entry: undefined } });
	const reasons = entries.map((entry) => withheldReason(entry, data.code_system ?? "", feedText));
	const withheld = reasons.filter((reason) => reason !== undefined).length;
	const topics = data.topics.map((topic, index) => {
		const reason = reasons[index];
		return reason ? { title: topic.title, url: topic.url, summary: null, updated: topic.updated, summary_withheld: reason } : topic;
	});
	const entry = entries.map((item, index) => {
		const reason = reasons[index];
		return reason ? linkOnlyEntry(item, reason) : item;
	});
	return {
		...data,
		topics,
		raw_response: withheld > 0 && isRecord(raw) ? { ...raw, feed: { ...feed, entry } } : raw,
		license_profile: {
			profile: "commercial",
			rule: "Text stays only for public-domain MedlinePlus content (health topic, genetics and medical test pages). Each other entry gives its title and its link only; summary_withheld gives the reason.",
			withheld_entries: withheld,
			terms: MEDLINEPLUS_TERMS_URL,
		},
	};
}

const xmlRefusal = () =>
	commercialUseRefusal(
		"The unmodified MedlinePlus Connect Atom XML (knowledgeResponseType=text/xml)",
		"it can contain licensed text of A.D.A.M. or ASHP, and this server removes that text from the JSON form only. Use application/json (the default): each entry gives its title and its link, and public-domain text stays",
	);

/**
 * MedlinePlus Connect for a reselling caller. The request rules and the input
 * errors are those of `medlineApiFetch`; the XML form is refused before the
 * upstream request, and the JSON form loses its licensed text.
 */
export async function commercialMedlineFetch(request: MedlineRequest): Promise<{ status: number; data: unknown }> {
	if (medlineRequest(request).fields.get("knowledgeResponseType") === "text/xml") return xmlRefusal();
	const result = await medlineApiFetch(request);
	if (!("topics" in result.data)) return xmlRefusal();
	return { status: result.status, data: linksOnlyForLicensedText(result.data) };
}
