import { beforeEach, expect, it, vi } from "vitest";
import { patedResponse } from "./tool-result";

const stage = vi.hoisted(() => vi.fn());
vi.mock("@bio-mcp/shared/staging/utils", () => ({ shouldStage: (bytes: number) => bytes > 30 * 1024, stageToDoAndRespond: stage }));
beforeEach(() => { stage.mockReset().mockResolvedValue({ dataAccessId: "fixture", _staging: { data_access_id: "fixture", tables_created: ["payloads"], total_rows: 1 } }); });
const response = (text: string, failed = false) => ({ content: [{ type: "text" as const, text }], structuredContent: { success: !failed, data: { text }, _meta: { citation: { result_hash: "original" } } } });
const env = { PATED_DATA_DO: {} as DurableObjectNamespace };

it("keeps small results and marks structured failures as tool errors", async () => {
  expect(await patedResponse(async () => response("small"), {}, "sql", {})).toEqual(response("small"));
  expect(await patedResponse(async () => response("failure", true), {}, "sql", {})).toEqual({ ...response("failure", true), isError: true });
  expect(stage).not.toHaveBeenCalled();
});

it.each([false, true])("stages complete multibyte envelopes, retaining error status %s and provenance", async failed => {
  // Each field is below 30 KiB; together the response exceeds the staging limit.
  const original = response("α".repeat(9000), failed);
  const scope = { sessionId: "test" };
  const result = await patedResponse(async () => original, env, "sql", scope);
  expect(stage.mock.calls[0][0]).toEqual({ ...original, ...(failed ? { isError: true } : {}) });
  expect(stage.mock.calls[0][6]).toBe(scope);
  expect(result.structuredContent).toEqual({ success: !failed, staged: true, data: undefined, data_access_id: "fixture",
    _staging: { data_access_id: "fixture", tables_created: ["payloads"], total_rows: 1 }, _meta: original.structuredContent._meta });
  expect(result.isError === true).toBe(failed);
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30000);
});

it("returns both bounded error fields on execution, storage and oversized-metadata failures", async () => {
  const failed = await patedResponse(async () => { throw new Error("private detail"); }, {}, "sql", {});
  expect(failed).toEqual({ content: [{ type: "text", text: "Patient Education response could not be returned." }],
    structuredContent: { success: false, error: { code: "RESPONSE_ERROR", message: "Patient Education response could not be returned." } }, isError: true });
  const large = () => Promise.resolve(response("x".repeat(40000)));
  expect(await patedResponse(large, {}, "sql", {})).toEqual(failed);
  stage.mockRejectedValueOnce(new Error("private staging detail"));
  expect(await patedResponse(large, env, "sql", {})).toEqual(failed);
  stage.mockResolvedValue({ dataAccessId: "fixture", _staging: { huge: "x".repeat(100000) } });
  expect(await patedResponse(large, env, "sql", {})).toEqual(failed);
});
