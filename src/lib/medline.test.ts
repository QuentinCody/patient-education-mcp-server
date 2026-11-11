import { afterEach, expect, it, vi } from "vitest";
import { medlineApiFetch, medlineRequest } from "./medline";
import { createPatedApiFetch } from "./api-adapter";
import { medlineEndpoints } from "../spec/medline";

const code = "mainSearchCriteria.v.c";
const system = "mainSearchCriteria.v.cs";
const fields = { [system]: "2.16.840.1.113883.6.90", [code]: "E11.9" };
const feed = { feed: { updated: { _value: "2026-08-27" }, entry: [{
  title: { _value: "Topic" }, summary: { _value: '<p class="NLMattribution">Source &amp; summary</p>' },
  link: [{ href: "https://medlineplus.gov/fixture.html" }, { href: "https://nih.gov/related" }],
  author: [{ name: { _value: "Source agency" } }], updated: { _value: "2026-01-01" }, unknown: { keep: true },
}] } };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

it("uses form POST to the service without placing fields in the URL", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json(feed));
  vi.stubGlobal("fetch", fetcher);
  const body = { ...fields, "mainSearchCriteria.v.dn": "A & B + café #/?=\n", "informationRecipient.languageCode.c": "es" };
  const result = await createPatedApiFetch()({ method: "POST", path: "/medline/service", body });
  expect(fetcher.mock.calls[0][0]).toBe("https://connect.medlineplus.gov/service");
  const init = fetcher.mock.calls[0][1];
  expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, redirect: "manual", signal: expect.any(AbortSignal) });
  expect(Object.fromEntries(new URLSearchParams(init?.body as string))).toEqual({ ...body, knowledgeResponseType: "application/json" });
  expect(result.data).toMatchObject({ method: "POST", code: "E11.9", raw_response: feed, total: 1, topics: [{ title: "Topic", summary: feed.feed.entry[0].summary._value }] });
});

it("encodes GET values without turning ampersands, plus signs or Unicode into parameters", () => {
  const request = medlineRequest({ method: "GET", path: "/medline/topic/ndc/0069-0150-01", params: { "mainSearchCriteria.v.dn": "A+B & C # café" } });
  const url = new URL(request.url);
  expect(url.searchParams.get("mainSearchCriteria.v.dn")).toBe("A+B & C # café");
  expect(url.searchParams.get(code)).toBe("0069-0150-01");
  expect(url.hash).toBe(""); expect(request.init.body).toBeUndefined();
});

it.each(["icd10", "icd9", "snomed", "loinc", "cpt", "rxnorm", "ndc"])("keeps GET/POST virtual %s parameters equivalent", name => {
  const path = `/medline/topic/${name}/0001A`;
  const get = medlineRequest({ method: "GET", path, params: { "informationRecipient.languageCode.c": "es" } });
  const post = medlineRequest({ method: "POST", path, body: { "informationRecipient.languageCode.c": "es" } });
  expect(post.fields.toString()).toBe(get.fields.toString());
  expect(post.fields.get(code)).toBe("0001A");
});

it("accepts an encoded form string and merges identical query/body values", () => {
  const result = medlineRequest({ method: "POST", path: "/medline", body: new URLSearchParams(fields).toString(), params: fields });
  expect(result.fields.get(code)).toBe("E11.9");
  expect(result.fields.getAll(code)).toHaveLength(1);
});

it("uses the catalog POST example through the actual adapter", async () => {
  const fetcher = vi.fn(async () => json(feed)); vi.stubGlobal("fetch", fetcher);
  const example = medlineEndpoints.find(endpoint => endpoint.method === "POST")?.example ?? "";
  const execute = new Function("api", `return (async () => { ${example} })();`);
  const api = createPatedApiFetch();
  const result = await execute({ post: (path: string, body: unknown) => api({ method: "POST", path, body }) });
  expect(result.data.request_parameters["informationRecipient.languageCode.c"]).toBe("es");
  expect(result.data.code).toBe("E11.9");
});

it.each([
  { body: [{ ...fields }] },
  { body: { ...fields, [code]: ["E11.9", "I10"] } },
  { body: { ...fields, [code]: "E11.9,I10" } },
  { body: { ...fields, [code]: 123 } },
  { body: { ...fields, options: {} } },
  { body: new URLSearchParams(fields).toString() + `&${code}=I10` },
  { body: JSON.stringify(fields) },
  { body: "<xml/>" },
  { body: fields, params: { [code]: "I10" } },
])("rejects batches, non-form bodies and conflicting fields (%#)", partial => {
  expect(() => medlineRequest({ method: "POST", path: "/medline/service", ...partial })).toThrow();
});

it("rejects path overrides and unsupported methods before any network request", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(medlineApiFetch({ method: "POST", path: "/medline/topic/icd10/E11.9", body: { [code]: "I10" } }, fetcher)).rejects.toThrow(/disagree/);
  await expect(medlineApiFetch({ method: "PUT", path: "/medline/service", body: fields }, fetcher)).rejects.toThrow(/GET and POST/);
  expect(fetcher).not.toHaveBeenCalled();
  await expect(createPatedApiFetch()({ method: "POST", path: "/dailymed/v2/spls.json", body: {} })).rejects.toThrow(/DailyMed/);
});

it("permits English drug-name fallback but requires codes for Spanish drugs and diagnoses", () => {
  const body = { [system]: "2.16.840.1.113883.6.88", "mainSearchCriteria.v.dn": "Chantix 0.5 MG Oral Tablet" };
  expect(medlineRequest({ method: "POST", path: "/medline/service", body }).fields.has(code)).toBe(false);
  expect(() => medlineRequest({ method: "POST", path: "/medline/service", body: { ...body, "informationRecipient.languageCode.c": "es" } })).toThrow(/One code/);
  expect(() => medlineRequest({ method: "POST", path: "/medline/service", body: { ...body, [system]: fields[system] } })).toThrow(/One code/);
});

it.each([null, { feed: null }, { feed: { entry: [] } }])("preserves a valid no-match response (%#)", async raw => {
  const result = await medlineApiFetch({ method: "GET", path: "/medline/service", params: fields }, async () => json(raw));
  expect(result.data).toMatchObject({ total: 0, topics: [], raw_response: raw });
});

it("preserves exact XML text when explicitly requested", async () => {
  const xml = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><author>source</author></entry></feed>';
  const result = await medlineApiFetch({ method: "POST", path: "/medline/service", body: { ...fields, knowledgeResponseType: "text/xml" } }, async () => new Response(xml));
  expect(result.data).toMatchObject({ format: "text/xml", raw_response: xml });
});

it("preserves 429 and Retry-After without retrying or accepting malformed success responses", async () => {
  const fetcher = vi.fn(async () => new Response("rate limited", { status: 429, headers: { "retry-after": "300" } }));
  await expect(medlineApiFetch({ method: "POST", path: "/medline/service", body: fields }, fetcher)).rejects.toMatchObject({ status: 429, retryAfter: "300" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  for (const raw of [{ error: "bad" }, { feed: [] }, { feed: { entry: "bad" } }]) {
    await expect(medlineApiFetch({ method: "GET", path: "/medline/service", params: fields }, async () => json(raw))).rejects.toThrow();
  }
});

it("bounds streamed bytes and rejects invalid UTF-8", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8_000_001)); }, cancel });
  await expect(medlineApiFetch({ method: "GET", path: "/medline/service", params: fields }, async () => new Response(body))).rejects.toThrow(/8MB/);
  expect(cancel).toHaveBeenCalled();
  await expect(medlineApiFetch({ method: "GET", path: "/medline/service", params: fields }, async () => new Response(new Uint8Array([0xff])))).rejects.toThrow();
});
