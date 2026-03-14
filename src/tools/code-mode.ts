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

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { patedCatalog } from "../spec/catalog";
import { createPatedApiFetch } from "../lib/api-adapter";

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
) {
    const apiFetch = createPatedApiFetch();

    // Register the search tool (in-process, no isolate)
    const searchTool = createSearchTool({
        prefix: "pated",
        catalog: patedCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    // Register the execute tool (V8 isolate via DynamicWorkerExecutor)
    const executeTool = createExecuteTool({
        prefix: "pated",
        catalog: patedCatalog,
        apiFetch,
        doNamespace: env.PATED_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
