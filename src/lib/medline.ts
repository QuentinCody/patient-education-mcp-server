import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";

const CODE_SYSTEM_OIDS: Record<string, string> = {
  icd10: "2.16.840.1.113883.6.90", ndc: "2.16.840.1.113883.6.69",
  loinc: "2.16.840.1.113883.6.1", snomed: "2.16.840.1.113883.6.96",
  icd9: "2.16.840.1.113883.6.103", cpt: "2.16.840.1.113883.6.12", rxnorm: "2.16.840.1.113883.6.88",
};
const ENDPOINT = "https://connect.medlineplus.gov/service";
const CODE = "mainSearchCriteria.v.c";
const SYSTEM = "mainSearchCriteria.v.cs";

function formFields(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  if (typeof body === "string") {
    if (/^\s*[\[{<]/.test(body)) throw new Error("MedlinePlus POST requires form fields, not JSON/XML text or a batch");
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, value] of new URLSearchParams(body)) {
      if (Object.prototype.hasOwnProperty.call(result, key)) throw new Error(`Repeated form field ${key}; only one code per request`);
      result[key] = value;
    }
    return result;
  }
  if (typeof body !== "object" || Array.isArray(body)) throw new Error("MedlinePlus body must be a field object or URL-encoded form string; no batches");
  return body as Record<string, unknown>;
}

export function medlineRequest(request: Parameters<ApiFetchFn>[0]) {
  if (request.method !== "GET" && request.method !== "POST") throw new Error("MedlinePlus supports GET and POST retrieval only");
  if (request.method === "GET" && request.body !== undefined) throw new Error("GET requests cannot contain a body; use POST for form fields");
  const fields = new URLSearchParams();
  for (const source of [request.params ?? {}, formFields(request.body)]) {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null) continue;
      if (!["string", "number", "boolean"].includes(typeof value)) throw new Error(`${key} must be a scalar form field; only one code per request`);
      if ((key === CODE || key === SYSTEM) && typeof value !== "string") throw new Error(`${key} must be a string to preserve the exact identifier`);
      const text = String(value);
      if (fields.has(key) && fields.get(key) !== text) throw new Error(`Conflicting query/body field: ${key}`);
      fields.set(key, text);
    }
  }
  const path = request.path.replace(/^\/medline(?=\/|$)/, "") || "/";
  const { format, encoded } = prepareMedlineFields(path, fields);
  const init: RequestInit = {
    method: request.method, redirect: "manual", signal: AbortSignal.timeout(30_000),
    headers: { Accept: format, "User-Agent": "patient-education-mcp-server/1.0", ...(request.method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    ...(request.method === "POST" ? { body: encoded } : {}),
  };
  return { url: request.method === "GET" ? `${ENDPOINT}?${encoded}` : ENDPOINT, init, fields };
}

function prepareMedlineFields(path: string, fields: URLSearchParams) {
  const match = path.match(/^\/topic\/(\w+)\/([^/]+)$/);
  if (match) {
    const system = CODE_SYSTEM_OIDS[match[1].toLowerCase()];
    if (!system) throw new Error(`Unknown MedlinePlus code system: ${match[1]}`);
    const code = decodeURIComponent(match[2]);
    for (const [key, value] of [[SYSTEM, system], [CODE, code]]) {
      if (fields.has(key) && fields.get(key) !== value) throw new Error(`Path and form disagree about ${key}`);
      fields.set(key, value);
    }
  } else if (path !== "/service" && path !== "/") throw new Error("Use /medline/service or /medline/topic/{system}/{code}");
  if (!fields.get(SYSTEM)) throw new Error("A code system is required");
  const isDrug = [CODE_SYSTEM_OIDS.ndc, CODE_SYSTEM_OIDS.rxnorm].includes(fields.get(SYSTEM) ?? "");
  const language = fields.get("informationRecipient.languageCode.c") ?? "en";
  const english = language === "en";
  if (!fields.get(CODE) && !(isDrug && english && fields.get("mainSearchCriteria.v.dn"))) throw new Error("One code is required; English medication queries may use a drug name instead");
  if (fields.get(CODE) && /[,;\s]/.test(fields.get(CODE) ?? "")) throw new Error("Submit one code per request, without a list or whitespace");
  if (!fields.has("knowledgeResponseType")) fields.set("knowledgeResponseType", "application/json");
  const format = fields.get("knowledgeResponseType");
  if (format !== "application/json" && format !== "text/xml") throw new Error("This adapter supports application/json or text/xml responses");
  const encoded = fields.toString();
  if (new TextEncoder().encode(encoded).byteLength > 32000) throw new Error("MedlinePlus request exceeds 32KB");
  return { format, encoded };
}

async function readBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8_000_000) throw new Error("MedlinePlus response exceeds 8MB");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); }
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const unbox = (value: unknown) => object(value) && "_value" in value ? value._value : value ?? "";

/** Retain the exact provider object; compatibility topics are a convenience projection. */
export async function medlineApiFetch(request: Parameters<ApiFetchFn>[0], fetcher: typeof fetch = fetch) {
  const { url, init, fields } = medlineRequest(request);
  const response = await fetcher(url, init);
  const text = await readBody(response);
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    throw Object.assign(new Error(`MedlinePlus HTTP ${response.status}: ${text.slice(0, 200)}`), { status: response.status, data: { response_body: text, retry_after: retryAfter }, retryAfter });
  }
  const context = { code_system: fields.get(SYSTEM), code: fields.get(CODE), request_parameters: Object.fromEntries(fields), method: request.method, source: ENDPOINT, fetched_at: new Date().toISOString() };
  if (fields.get("knowledgeResponseType") === "text/xml") {
    if (!/<(?:\w+:)?feed(?:\s|>)/.test(text)) throw new Error("MedlinePlus returned an unexpected XML response");
    return { status: response.status, data: { ...context, format: "text/xml", raw_response: text } };
  }
  const raw: unknown = JSON.parse(text);
  if (raw !== null && (!object(raw) || !("feed" in raw))) throw new Error("MedlinePlus returned an unexpected JSON response");
  const feed = object(raw) ? raw.feed : null;
  if (feed !== null && !object(feed)) throw new Error("Invalid MedlinePlus feed");
  const entries = feed?.entry ?? [];
  if (!Array.isArray(entries) || entries.some(entry => !object(entry))) throw new Error("Invalid MedlinePlus entries");
  const topics = entries.map(entry => ({
    title: unbox(entry.title), url: Array.isArray(entry.link) ? entry.link[0]?.href ?? "" : "",
    summary: unbox(entry.summary), updated: unbox(entry.updated),
  }));
  return { status: response.status, data: { ...context, total: topics.length, topics, raw_response: raw } };
}
