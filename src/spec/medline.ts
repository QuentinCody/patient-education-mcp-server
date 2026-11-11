import type { ApiEndpoint } from "@bio-mcp/shared/codemode/catalog";

const parameters: NonNullable<ApiEndpoint["queryParams"]> = [
  { name: "mainSearchCriteria.v.cs", type: "string", required: true, description: "Code-system OID; e.g. 2.16.840.1.113883.6.90 (ICD-10-CM) or 2.16.840.1.113883.6.88 (RxNorm)." },
  { name: "mainSearchCriteria.v.c", type: "string", required: false, description: "One exact code, preserving leading zeros. Required except English medication name-only queries. No arrays or repeated codes." },
  { name: "mainSearchCriteria.v.dn", type: "string", required: false, description: "Display name. Used as a fallback for English medication requests, not a diagnosis/lab/procedure text search or a Spanish drug-name search." },
  { name: "informationRecipient.languageCode.c", type: "string", required: false, description: "English en (default) or Spanish es; provider also accepts sp/spa for Spanish. Spanish medication requests require a code." },
  { name: "knowledgeResponseType", type: "string", required: false, description: "Response format: application/json (adapter default), or text/xml for unmodified Atom XML." },
];

export const medlineEndpoints: ApiEndpoint[] = [
  { method: "GET", path: "/medline/service", category: "medline", summary: "Retrieve MedlinePlus Connect information with standard Infobutton parameters; one code or an English medication name per request.", queryParams: parameters },
  {
    method: "POST", path: "/medline/service", category: "medline", featured: true,
    summary: "MedlinePlus Connect form-encoded POST retrieval, announced August 27, 2026. Same parameters and single-code semantics as GET; no batch JSON/XML payloads.",
    body: { contentType: "application/x-www-form-urlencoded", description: parameters.map(p => `${p.name}: ${p.description}`).join("\n") },
    example: 'return await api.post("/medline/service", { "mainSearchCriteria.v.cs": "2.16.840.1.113883.6.90", "mainSearchCriteria.v.c": "E11.9", "informationRecipient.languageCode.c": "es" });',
    usageHint: "Pass a field object to api.post; the adapter encodes it as a form, not JSON. URL-encoded strings also work, but repeated keys fail. Existing /medline/topic/{system}/{code} paths also accept POST with optional form fields. Single request, no automatic retries; respect provider rate limits.",
    response: { description: "JSON: existing code_system/code/total/topics plus full raw_response, request_parameters and fetched_at. XML: raw_response text and request context. Source links, author attribution and HTML summaries are preserved in raw_response." },
  },
];
