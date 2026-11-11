/**
 * Patient Education Code Mode — registers search + execute tools for full API access.
 *
 * search: In-process catalog query, returns matching endpoints with docs.
 * execute: V8 isolate with api.get/api.post + searchSpec/listCategories.
 *
 * Routes two APIs through a single adapter:
 *   /medline/*   → MedlinePlus Connect
 *   /dailymed/*  → DailyMed Services
 */

import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { patedCatalog } from "../spec/catalog";
import { createPatedApiFetch } from "../lib/api-adapter";
import { patedResponse } from "../lib/tool-result";

interface CodeModeEnv {
    PATED_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

/**
 * Register pated_search and pated_execute tools.
 */
export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createPatedApiFetch();
    const register = server.tool.bind(server) as (...args: unknown[]) => void;
    const dualHost = { tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const handler = rest.pop() as (args: unknown, extra: unknown) => ReturnType<Parameters<typeof patedResponse>[0]>;
        const respond = (args: unknown, extra: unknown) => patedResponse(() => handler(args, extra), env, String(name), extra);
        register(name, ...rest, respond);
        register(`mcp_${String(name)}`, ...rest, respond);
    } };

    // Register the search tool (in-process, no isolate)
    const searchTool = createSearchTool({
        prefix: "pated",
        catalog: patedCatalog,
    });
    searchTool.register(dualHost);

    // Register the execute tool (V8 isolate via DynamicWorkerExecutor)
    const executeTool = createExecuteTool({
        prefix: "pated",
        // Verifiable provenance: pated_execute results carry a _meta.citation.
        // Scripts can combine both providers; retain provider attribution in their payloads.
        source: { id: "pated", name: "Patient Education (MedlinePlus + DailyMed)", url: "https://patient-education-mcp-server.quentincody.workers.dev" },
        catalog: patedCatalog,
        apiFetch,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        doNamespace: env.PATED_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(dualHost);
}
