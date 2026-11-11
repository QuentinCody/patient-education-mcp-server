import { expect, it } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";
import { patedCatalog } from "../spec/catalog";

it("registers both aliases and exposes form POST in the searchable catalog", async () => {
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  for (const name of ["pated_search", "pated_execute", "pated_query_data", "pated_get_schema"]) {
    expect(tools[name]).toBeDefined(); expect(tools[`mcp_${name}`]).toBeDefined();
  }
  for (const name of ["pated_search", "mcp_pated_search"]) {
    const result = await tools[name].handler({ query: "form-encoded POST", category: "medline", max_results: 5 }, {});
    expect(result).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
    expect(JSON.stringify(result)).toContain("/medline/service");
  }
  expect(patedCatalog.endpointCount).toBe(patedCatalog.endpoints.length);
  expect(await tools.mcp_pated_query_data.handler({ data_access_id: "pated_fixture", sql: "SELECT 1" }, {})).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: expect.any(Object) });
});
