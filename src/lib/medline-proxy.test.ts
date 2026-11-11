import { afterEach, expect, it, vi } from "vitest";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { createPatedApiFetch } from "./api-adapter";
import { patedCatalog } from "../spec/catalog";

afterEach(() => vi.unstubAllGlobals());
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
const args = { method: "POST" as const, path: "/medline/service", body: { "mainSearchCriteria.v.cs": "2.16.840.1.113883.6.90", "mainSearchCriteria.v.c": "E11.9" } };

it("stages full provider attribution, every link and request context through the real Code Mode proxy", async () => {
  const raw = { feed: { entry: [{ title: { _value: "Topic" }, summary: { _value: "α".repeat(17_000) }, link: [{ href: "https://medlineplus.gov/fixture" }, { href: "https://nih.gov/related" }], author: [{ name: { _value: "Fixture agency" } }] }] } };
  const stored: unknown[] = [];
  const ns = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as { data: unknown }).data);
      return json({ success: true, tables_created: ["topics"], total_rows: 1, input_rows: 1, table_row_counts: { topics: 1 } });
    }
    return json({ success: true, schema: { tables: { topics: { columns: [{ name: "title" }] } } } });
  } }) } as unknown as DurableObjectNamespace;
  vi.stubGlobal("fetch", vi.fn(async () => json(raw)));
  const proxy = createApiProxyTool({ apiFetch: createPatedApiFetch(), catalog: patedCatalog, doNamespace: ns, stagingPrefix: "pated", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler(args, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, data_access_id: expect.any(String) });
  const canonical = JSON.parse(stored[0] as string);
  expect(canonical).toMatchObject({ raw_response: raw, code: "E11.9", method: "POST", request_parameters: args.body });
  expect(stored[1]).toEqual(canonical);
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30_000);
});

it("keeps retry guidance visible through Code Mode without retrying the lookup", async () => {
  const fetcher = vi.fn(async () => new Response("limited", { status: 429, headers: { "retry-after": "300" } }));
  vi.stubGlobal("fetch", fetcher);
  const proxy = createApiProxyTool({ apiFetch: createPatedApiFetch(), catalog: patedCatalog, stagingPrefix: "pated" });
  expect(await proxy.handler(args, { sql: () => [] })).toMatchObject({ __api_error: true, status: 429, data: { retry_after: "300", response_body: "limited" } });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("uses actual catalog interpolation for existing GET routes", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json({ feed: { entry: [] } })); vi.stubGlobal("fetch", fetcher);
  const proxy = createApiProxyTool({ apiFetch: createPatedApiFetch(), catalog: patedCatalog, stagingPrefix: "pated" });
  const result = await proxy.handler({ method: "GET", path: "/medline/topic/ndc/{code}", params: { code: "0069-0150-01" } }, { sql: () => [] });
  expect(result).toMatchObject({ code: "0069-0150-01", total: 0 });
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("mainSearchCriteria.v.c")).toBe("0069-0150-01");
});
