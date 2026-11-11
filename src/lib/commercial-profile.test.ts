import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { patedCatalog } from "../spec/catalog";
import { createPatedApiFetch } from "./api-adapter";
import { MEDLINEPLUS_TERMS_URL, OPEN_TEXT_CODE_SYSTEMS, WITHHELD, withheldReason } from "./commercial-profile";

// License audit 2026-11-10: "Return links only for A.D.A.M. and ASHP content."
// MedlinePlus licenses the A.D.A.M. Medical Encyclopedia and the ASHP drug
// monographs for its own site only; the health topic summaries, the genetics
// summaries and the medical test information are in the public domain
// (https://medlineplus.gov/about/using/usingcontent/). A reselling caller gets
// the title and the link of a licensed entry, not its text.
//
// The fixtures have the structure that connect.medlineplus.gov returned on
// 2026-11-10 (the keys, the links, the `_value` boxes). The text of each
// summary is a marker string, so that this file contains no licensed text.

const OID = {
	icd10: "2.16.840.1.113883.6.90",
	rxnorm: "2.16.840.1.113883.6.88",
	ndc: "2.16.840.1.113883.6.69",
	loinc: "2.16.840.1.113883.6.1",
};
const SYSTEM = "mainSearchCriteria.v.cs";
const CODE = "mainSearchCriteria.v.c";

const ASHP_TEXT = "FIXTURE-ASHP-MONOGRAPH why this medication is prescribed.";
const ADAM_TEXT = "FIXTURE-ADAM-ARTICLE the text of an encyclopedia article.";
// A public-domain summary can link to a licensed page. A link is not licensed text.
const TOPIC_TEXT =
	'<h3>What is type 2 diabetes?</h3><p>FIXTURE-NLM-TOPIC a health topic summary. See <a href="https://medlineplus.gov/druginfo/meds/a696005.html?utm_source=mplusconnect">metformin</a>.</p><p class="NLMattribution">NIH: National Institute of Diabetes and Digestive and Kidney Diseases</p>';
const GENETICS_TEXT = "<p>FIXTURE-NLM-GENETICS a genetics condition summary.</p>";
const LAB_TEXT = "<h2>What are coagulation factor tests?</h2><p>FIXTURE-NLM-LABTEST medical test information.</p>";
const STATINS_TEXT = "<h3>What is cholesterol?</h3><p>FIXTURE-NLM-STATINS a health topic in a medication response.</p>";
const NIDDK_TEXT = "FIXTURE-NIDDK the description of a page of another NIH institute.";

function entry(title: string, href: string, summary: string, extra: Record<string, unknown> = {}) {
	const page = new URL(href);
	return {
		title: { _value: title, type: "text" },
		link: [{ href, rel: "alternate" }],
		id: { _value: `tag: ${page.hostname}, 2026-10-11:${page.pathname}` },
		summary: { type: "html", _value: summary },
		updated: { _value: "2026-11-10T18:22:52Z" },
		...extra,
	};
}

function feed(system: string, code: string, entries: unknown[], extra: Record<string, unknown> = {}) {
	return {
		feed: {
			base: "https://medlineplus.gov/",
			lang: "en",
			xsi: "http://www.w3.org/2001/XMLSchema-instance",
			title: { type: "text", _value: "MedlinePlus Connect" },
			updated: { _value: "2026-11-10T18:22:52Z" },
			id: { _value: "" },
			author: { name: { _value: "U.S. National Library of Medicine" }, uri: { _value: "https://www.nlm.nih.gov" } },
			subtitle: { type: "text", _value: `MedlinePlus Connect results for ${system} ${code}` },
			category: [
				{ scheme: CODE, term: code },
				{ scheme: SYSTEM, term: system },
				{ scheme: "mainSearchCriteria.v.dn", term: "" },
				{ scheme: "informationRecipient", term: "PAT" },
			],
			entry: entries,
			...extra,
		},
	};
}

const VARENICLINE = entry("Varenicline", "https://medlineplus.gov/druginfo/meds/a606024.html?utm_source=mplusconnect&utm_medium=service", ASHP_TEXT);
const ROSUVASTATIN = entry("Rosuvastatin", "https://medlineplus.gov/druginfo/meds/a603033.html?utm_source=mplusconnect&utm_medium=service", ASHP_TEXT);
const STATINS = entry("Statins", "https://medlineplus.gov/statins.html?utm_source=mplusconnect&utm_medium=service", STATINS_TEXT);
const DIABETES = entry("Diabetes Type 2", "https://medlineplus.gov/diabetestype2.html?utm_source=mplusconnect&utm_medium=service", TOPIC_TEXT);
const DIABETES_GENETICS = entry("Type 2 diabetes", "https://medlineplus.gov/genetics/condition/type-2-diabetes?utm_source=mplusconnect&utm_medium=service", GENETICS_TEXT);
const NIDDK = entry("Type 2 Diabetes", "https://www.niddk.nih.gov/health-information/diabetes/overview/what-is-diabetes/type-2-diabetes?utm_medium=ehr+service", NIDDK_TEXT);
const LAB_TEST = entry("Coagulation Factor Tests", "https://medlineplus.gov/lab-tests/coagulation-factor-tests?utm_source=mplusconnect&utm_medium=service", LAB_TEXT);

const FEEDS: Record<string, unknown> = {
	[OID.rxnorm]: feed("RXCUI", "637188", [VARENICLINE]),
	[OID.ndc]: feed("NDC", "00310-0751-39", [ROSUVASTATIN, STATINS]),
	[OID.icd10]: feed("ICD-10-CM", "E11.9", [DIABETES, DIABETES_GENETICS, NIDDK]),
	[OID.loinc]: feed("LOINC", "3187-2", [LAB_TEST]),
};
const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?><feed xml:base="https://medlineplus.gov/" xml:lang="en" xmlns="http://www.w3.org/2005/Atom"><title type="text">MedlinePlus Connect</title><entry><title>Varenicline</title><link href="https://medlineplus.gov/druginfo/meds/a606024.html" rel="alternate"/><summary type="html">${ASHP_TEXT}</summary></entry></feed>`;

const SETID = "bb0f3b5e-4bc6-41c9-66b9-6257e2513512";
const SPL_LIST = { data: [{ setid: SETID, title: "ROSUVASTATIN CALCIUM tablet, film coated", spl_version: 3, published_date: "Nov 03, 2026" }], metadata: { total_elements: 1, current_page: 1 } };
const SPL_XML = `<document><setId root="${SETID}"/><versionNumber value="3"/><effectiveTime value="20261103"/><title>ROSUVASTATIN CALCIUM tablet</title><component><structuredBody><component><section><code code="34067-9"/><title>1 INDICATIONS AND USAGE</title><text>FIXTURE-FDA-LABEL the text of an FDA drug label.</text></section></component></structuredBody></component></document>`;

const commercial = { licenseProfile: "commercial" as const };
const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json;charset=UTF-8" } });

/** Stub the two upstream hosts. `feeds` gives the Connect response for each code system. */
function stubUpstream(feeds: Record<string, unknown> = FEEDS) {
	const calls: string[] = [];
	vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		calls.push(`${init?.method ?? "GET"} ${url.origin}${url.pathname}`);
		if (url.hostname === "dailymed.nlm.nih.gov") {
			return url.pathname.endsWith(".xml") ? new Response(SPL_XML, { headers: { "content-type": "application/xml" } }) : jsonResponse(SPL_LIST);
		}
		const fields = init?.method === "POST" ? new URLSearchParams(String(init.body)) : url.searchParams;
		if (fields.get("knowledgeResponseType") === "text/xml") return new Response(ATOM_XML, { headers: { "content-type": "application/atom+xml; charset=utf-8" } });
		return jsonResponse(feeds[fields.get(SYSTEM) ?? ""] ?? null);
	});
	return calls;
}

type Topic = { title: unknown; url: unknown; summary: unknown; updated: unknown; summary_withheld?: string };
type Result = { topics: Topic[]; total: number; raw_response: { feed: { entry: Array<Record<string, unknown>> } }; license_profile?: Record<string, unknown> };
const body = (result: { data: unknown }) => result.data as Result;

describe("Patient Education adapter under the commercial license profile", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("gives the title and the link only for each entry of a medication request", async () => {
		const calls = stubUpstream();
		const api = createPatedApiFetch();
		const requests = [
			{ method: "GET", path: "/medline/topic/rxnorm/637188" },
			{ method: "POST", path: "/medline/topic/rxnorm/637188" },
			{ method: "GET", path: "/medline/service", params: { [SYSTEM]: OID.rxnorm, [CODE]: "637188" } },
			{ method: "POST", path: "/medline/service", body: { [SYSTEM]: OID.rxnorm, "mainSearchCriteria.v.dn": "Chantix 0.5 MG Oral Tablet" } },
		];
		for (const request of requests) {
			const result = await api({ ...request, ...commercial });
			expect(result.status, JSON.stringify(request)).toBe(200);
			expect(JSON.stringify(result.data)).not.toContain("FIXTURE-ASHP-MONOGRAPH");
			const data = body(result);
			expect(data.topics).toEqual([{ title: "Varenicline", url: VARENICLINE.link[0].href, summary: null, updated: VARENICLINE.updated._value, summary_withheld: WITHHELD.drugPage }]);
			expect(data.raw_response.feed.entry).toEqual([{ title: VARENICLINE.title, link: VARENICLINE.link, id: VARENICLINE.id, updated: VARENICLINE.updated, summary_withheld: WITHHELD.drugPage }]);
			expect(data.license_profile).toMatchObject({ profile: "commercial", withheld_entries: 1, terms: MEDLINEPLUS_TERMS_URL });
		}
		expect(calls).toHaveLength(requests.length);
	});

	it("withholds the health topic of a medication response too, because the provider does not document it", async () => {
		stubUpstream();
		const result = await createPatedApiFetch()({ method: "GET", path: "/medline/topic/ndc/00310-0751-39", ...commercial });
		const text = JSON.stringify(result.data);
		expect(text).not.toContain("FIXTURE-ASHP-MONOGRAPH");
		expect(text).not.toContain("FIXTURE-NLM-STATINS");
		expect(body(result).topics).toMatchObject([
			{ title: "Rosuvastatin", url: ROSUVASTATIN.link[0].href, summary: null, summary_withheld: WITHHELD.drugPage },
			{ title: "Statins", url: STATINS.link[0].href, summary: null, summary_withheld: WITHHELD.medicationRequest },
		]);
		expect(body(result).total).toBe(2);
	});

	it("keeps the public-domain health topic, genetics and medical test text", async () => {
		stubUpstream();
		const api = createPatedApiFetch();
		const diagnosis = body(await api({ method: "GET", path: "/medline/topic/icd10/E11.9", ...commercial }));
		// The embedded link to a drug page stays: a link is not licensed text.
		expect(diagnosis.topics[0]).toEqual({ title: "Diabetes Type 2", url: DIABETES.link[0].href, summary: TOPIC_TEXT, updated: DIABETES.updated._value });
		expect(diagnosis.topics[1]).toMatchObject({ title: "Type 2 diabetes", summary: GENETICS_TEXT });
		expect(diagnosis.raw_response.feed.entry.slice(0, 2)).toEqual([DIABETES, DIABETES_GENETICS]);
		// A page of another NIH institute: its terms are not on the MedlinePlus pages, so it is a link only.
		expect(diagnosis.topics[2]).toEqual({ title: "Type 2 Diabetes", url: NIDDK.link[0].href, summary: null, updated: NIDDK.updated._value, summary_withheld: WITHHELD.unknownSource });
		expect(JSON.stringify(diagnosis)).not.toContain("FIXTURE-NIDDK");
		expect(diagnosis.license_profile).toMatchObject({ withheld_entries: 1 });

		const lab = body(await api({ method: "GET", path: "/medline/topic/loinc/3187-2", ...commercial }));
		expect(lab.topics).toEqual([{ title: "Coagulation Factor Tests", url: LAB_TEST.link[0].href, summary: LAB_TEXT, updated: LAB_TEST.updated._value }]);
		expect(lab.raw_response).toEqual(FEEDS[OID.loinc]);
		expect(lab.license_profile).toMatchObject({ withheld_entries: 0 });
	});

	it("withholds an A.D.A.M. or ASHP entry on a diagnosis route and keeps the other entries (fail closed)", async () => {
		const licensed = [
			entry("Type 2 diabetes", "https://medlineplus.gov/ency/article/000313.htm", ADAM_TEXT),
			entry("Diabetes tipo 2", "https://medlineplus.gov/spanish/ency/article/000313.htm", ADAM_TEXT),
			entry("Metformina", "https://medlineplus.gov/spanish/druginfo/meds/a696005-es.html", ASHP_TEXT),
			entry("Diabetes", "https://medlineplus.gov/diabetes.html", `${ADAM_TEXT} Copyright 1997-2026, A.D.A.M., Inc.`),
			entry("Insulin", "https://medlineplus.gov/insulin.html", ASHP_TEXT, { author: [{ name: { _value: "American Society of Health-System Pharmacists" } }] }),
			entry("Metformin", "https://medlineplus.gov/metformin.html", `${ASHP_TEXT} AHFS Patient Medication Information.`),
			{ title: { _value: "No link" }, summary: { _value: ADAM_TEXT }, content: { _value: ADAM_TEXT } },
		];
		stubUpstream({ [OID.icd10]: feed("ICD-10-CM", "E11.9", [DIABETES, ...licensed]) });
		const result = await createPatedApiFetch()({ method: "GET", path: "/medline/topic/icd10/E11.9", ...commercial });
		const text = JSON.stringify(result.data);
		expect(text).not.toContain("FIXTURE-ADAM-ARTICLE");
		expect(text).not.toContain("FIXTURE-ASHP-MONOGRAPH");
		const data = body(result);
		expect(data.topics[0].summary).toBe(TOPIC_TEXT);
		expect(data.topics.slice(1).map((topic) => topic.summary_withheld)).toEqual([
			WITHHELD.encyclopedia,
			WITHHELD.encyclopedia,
			WITHHELD.drugPage,
			WITHHELD.adamMarker,
			WITHHELD.ashpMarker,
			WITHHELD.ashpMarker,
			WITHHELD.unknownSource,
		]);
		for (const [index, topic] of data.topics.slice(1, 7).entries()) {
			expect(topic).toMatchObject({ title: licensed[index].title._value, url: (licensed[index] as typeof DIABETES).link[0].href, summary: null });
		}
		// The attribution of the provider stays; the body fields do not.
		expect(data.raw_response.feed.entry[5]).toMatchObject({ author: [{ name: { _value: "American Society of Health-System Pharmacists" } }] });
		expect(data.raw_response.feed.entry[7]).toEqual({ title: { _value: "No link" }, summary_withheld: WITHHELD.unknownSource });
		expect(data.license_profile).toMatchObject({ withheld_entries: 7 });
	});

	it("withholds each entry when the feed carries an A.D.A.M. or ASHP attribution", async () => {
		for (const [rights, reason] of [["Copyright A.D.A.M., Inc.", WITHHELD.adamMarker], ["© ASHP", WITHHELD.ashpMarker]]) {
			stubUpstream({ [OID.icd10]: feed("ICD-10-CM", "E11.9", [DIABETES, DIABETES_GENETICS], { rights: { _value: rights } }) });
			const result = await createPatedApiFetch()({ method: "GET", path: "/medline/topic/icd10/E11.9", ...commercial });
			expect(JSON.stringify(result.data)).not.toContain("FIXTURE-NLM");
			expect(body(result).topics.map((topic) => topic.summary_withheld)).toEqual([reason, reason]);
		}
	});

	it("withholds the text for a code system that is not confirmed as public domain", async () => {
		const unknown = "2.16.840.1.113883.6.999";
		stubUpstream({ [unknown]: feed("OTHER", "X1", [DIABETES]), [` ${OID.icd10}`]: feed("ICD-10-CM", "E11.9", [DIABETES]) });
		const api = createPatedApiFetch();
		for (const system of [unknown, ` ${OID.icd10}`]) {
			const result = await api({ method: "POST", path: "/medline/service", body: { [SYSTEM]: system, [CODE]: "X1" }, ...commercial });
			expect(JSON.stringify(result.data)).not.toContain("FIXTURE-NLM-TOPIC");
			expect(body(result).topics).toMatchObject([{ title: "Diabetes Type 2", url: DIABETES.link[0].href, summary: null, summary_withheld: WITHHELD.unknownCodeSystem }]);
		}
	});

	it("refuses the unmodified Atom XML with HTTP 451 and makes no upstream request", async () => {
		const calls = stubUpstream();
		const api = createPatedApiFetch();
		const requests = [
			{ method: "GET", path: "/medline/topic/rxnorm/637188", params: { knowledgeResponseType: "text/xml" } },
			{ method: "POST", path: "/medline/topic/icd10/E11.9", body: { knowledgeResponseType: "text/xml" } },
			{ method: "POST", path: "/medline/service", body: `${SYSTEM}=${OID.rxnorm}&${CODE}=637188&knowledgeResponseType=text%2Fxml` },
		];
		for (const request of requests) {
			const result = await api({ ...request, ...commercial });
			expect(result.status, JSON.stringify(request)).toBe(451);
			expect(result.data).toMatchObject({ error: "NOT_LICENSED_FOR_COMMERCIAL_USE", message: expect.stringContaining("application/json") });
		}
		expect(calls).toEqual([]);
	});

	it("keeps a no-match response and the input errors of the adapter", async () => {
		const calls = stubUpstream({});
		const api = createPatedApiFetch();
		const result = await api({ method: "GET", path: "/medline/topic/rxnorm/0", ...commercial });
		expect(result.data).toMatchObject({ total: 0, topics: [], raw_response: null, license_profile: { withheld_entries: 0 } });
		await expect(api({ method: "PUT", path: "/medline/service", body: { [SYSTEM]: OID.rxnorm, [CODE]: "1" }, ...commercial })).rejects.toThrow(/GET and POST/);
		await expect(api({ method: "GET", path: "/medline/topic/unknown/1", ...commercial })).rejects.toThrow(/Unknown MedlinePlus code system/);
		expect(calls).toHaveLength(1);
	});

	it("does not change DailyMed", async () => {
		const calls = stubUpstream();
		const api = createPatedApiFetch();
		const requests = [
			{ method: "GET", path: "/dailymed/v2/spls.json", params: { drug_name: "rosuvastatin" } },
			{ method: "GET", path: `/dailymed/v2/spls/${SETID}.json` },
		];
		for (const request of requests) {
			const plain = await api(request);
			const profile = await api({ ...request, ...commercial });
			expect(profile).toEqual(plain);
			expect(profile.status).toBe(200);
		}
		expect(JSON.stringify(await api({ ...requests[1], ...commercial }))).toContain("FIXTURE-FDA-LABEL");
		expect(calls[0]).toBe(calls[1]);
		expect(calls[2]).toBe(calls[3]);
		expect(calls[2]).toBe(`GET https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${SETID}.xml`);
	});

	it("does not change a caller without the commercial profile", async () => {
		const calls = stubUpstream();
		const api = createPatedApiFetch();
		const cases: Array<[string, string, string, Array<ReturnType<typeof entry>>]> = [
			["/medline/topic/rxnorm/637188", OID.rxnorm, "637188", [VARENICLINE]],
			["/medline/topic/ndc/00310-0751-39", OID.ndc, "00310-0751-39", [ROSUVASTATIN, STATINS]],
			["/medline/topic/icd10/E11.9", OID.icd10, "E11.9", [DIABETES, DIABETES_GENETICS, NIDDK]],
		];
		for (const [path, system, code, entries] of cases) {
			const result = await api({ method: "GET", path });
			// The exact result of the adapter before the profile: each summary, the full provider object, no added field.
			expect(result).toEqual({
				status: 200,
				data: {
					code_system: system,
					code,
					request_parameters: { [SYSTEM]: system, [CODE]: code, knowledgeResponseType: "application/json" },
					method: "GET",
					source: "https://connect.medlineplus.gov/service",
					fetched_at: expect.any(String),
					total: entries.length,
					topics: entries.map((item) => ({ title: item.title._value, url: item.link[0].href, summary: item.summary._value, updated: item.updated._value })),
					raw_response: FEEDS[system],
				},
			});
		}
		const xml = await api({ method: "GET", path: "/medline/topic/rxnorm/637188", params: { knowledgeResponseType: "text/xml" } });
		expect(xml).toMatchObject({ status: 200, data: { format: "text/xml", raw_response: ATOM_XML } });
		expect(calls).toHaveLength(4);
	});

	it("applies through the Code Mode proxy, which passes the profile of the caller", async () => {
		const calls = stubUpstream();
		const proxy = createApiProxyTool({ apiFetch: createPatedApiFetch(), catalog: patedCatalog, stagingPrefix: "pated" });
		const reselling = { sql: () => [], requestContext: commercial };
		const args = { method: "GET" as const, path: "/medline/topic/rxnorm/{code}", params: { code: "637188" } };

		const withheld = await proxy.handler(args, reselling);
		expect(JSON.stringify(withheld)).not.toContain("FIXTURE-ASHP-MONOGRAPH");
		expect(withheld).toMatchObject({ topics: [{ title: "Varenicline", url: VARENICLINE.link[0].href, summary: null, summary_withheld: WITHHELD.drugPage }] });

		const refused = await proxy.handler({ ...args, params: { ...args.params, knowledgeResponseType: "text/xml" } }, reselling);
		expect(refused).toMatchObject({ __api_error: true, status: 451, message: expect.stringContaining("NOT_LICENSED_FOR_COMMERCIAL_USE") });

		const plain = await proxy.handler(args, { sql: () => [] });
		expect(plain).toMatchObject({ topics: [{ title: "Varenicline", summary: ASHP_TEXT }] });
		expect(calls).toHaveLength(2);
	});
});

describe("withheldReason", () => {
	const page = (href: string, summary = "text", extra: Record<string, unknown> = {}) => entry("Title", href, summary, extra);

	it("permits the text of a MedlinePlus page for each diagnosis, lab test and procedure code system", () => {
		expect([...OPEN_TEXT_CODE_SYSTEMS]).toEqual([OID.icd10, "2.16.840.1.113883.6.103", "2.16.840.1.113883.6.96", OID.loinc, "2.16.840.1.113883.11.79", "2.16.840.1.113883.6.12"]);
		for (const system of OPEN_TEXT_CODE_SYSTEMS) {
			expect(withheldReason(page("https://medlineplus.gov/asthma.html"), system)).toBeUndefined();
			expect(withheldReason(page("https://medlineplus.gov/spanish/pruebas-de-laboratorio/pruebas-de-los-factores-de-la-coagulacion"), system)).toBeUndefined();
			expect(withheldReason(page("https://www.medlineplus.gov/genetics/gene/adamts13/", "The ADAMTS13 gene and an Adam's apple."), system)).toBeUndefined();
		}
	});

	it("names the reason for each class of entry", () => {
		const topic = page("https://medlineplus.gov/asthma.html");
		expect(withheldReason(topic, OID.rxnorm)).toBe(WITHHELD.medicationRequest);
		expect(withheldReason(topic, OID.ndc)).toBe(WITHHELD.medicationRequest);
		expect(withheldReason(topic, "")).toBe(WITHHELD.unknownCodeSystem);
		expect(withheldReason(page("https://medlineplus.gov/druginfo/natural/333.html"), OID.icd10)).toBe(WITHHELD.drugPage);
		expect(withheldReason(page("https://medlineplus.gov/ency/patientinstructions/000086.htm"), OID.loinc)).toBe(WITHHELD.encyclopedia);
		expect(withheldReason({ ...topic, id: { _value: "tag: medlineplus.gov, 2026-10-11:/ency/article/003647.htm" } }, OID.loinc)).toBe(WITHHELD.encyclopedia);
		expect(withheldReason({ ...topic, link: [...topic.link, { href: "https://medlineplus.gov/druginfo/meds/a682878.html", rel: "related" }] }, OID.icd10)).toBe(WITHHELD.drugPage);
		expect(withheldReason(page("https://medlineplus.gov/asthma.html", "Reviewed by the A.D.A.M. editorial team."), OID.icd10)).toBe(WITHHELD.adamMarker);
		expect(withheldReason(page("https://medlineplus.gov/asthma.html", "See www.adam.com."), OID.icd10)).toBe(WITHHELD.adamMarker);
		expect(withheldReason(topic, OID.icd10, JSON.stringify({ rights: "American Society of Health-System Pharmacists" }))).toBe(WITHHELD.ashpMarker);
		expect(withheldReason(page("https://example.org/asthma.html"), OID.icd10)).toBe(WITHHELD.unknownSource);
		expect(withheldReason(page("https://medlineplus.gov.example.org/asthma.html"), OID.icd10)).toBe(WITHHELD.unknownSource);
		expect(withheldReason({ ...topic, link: [{ href: "not a url" }] }, OID.icd10)).toBe(WITHHELD.unknownSource);
		expect(withheldReason("not an entry", OID.icd10)).toBe(WITHHELD.unknownSource);
	});
});
