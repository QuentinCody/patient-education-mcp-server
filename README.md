# Patient Education MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream Patient Education API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

The server is deployed and ready at:

```
https://patient-education-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "patient-education": {
      "command": "npx",
      "args": ["mcp-remote", "https://patient-education-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8832/mcp` (start it with `./scripts/dev-servers.sh patient-education`):

```json
{
  "mcpServers": {
    "patient-education-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8832/mcp"]
    }
  }
}
```

## Tools

- `pated_search` — discover MedlinePlus Connect and DailyMed operations, including form POST
- `pated_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `pated_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `pated_get_schema` — inspect the inferred schema of a staged dataset

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL.
This also applies to complete composed, SQL and schema responses. For a top-level
`staged: true` response, `payloads.root_json` retains the complete original tool
response. For `data.__staged`, it retains the full provider-adapter payload.
Use bounded `substr(root_json, offset, length)` queries to recover large text;
follow `__CHUNKED__` references through `content_chunks` when present. Queries
whose complete output exceeds the database response ceiling fail explicitly;
they do not return partial rows. The canonical citation hash identifies the
original result data, and `_staging.payload_hash` identifies the staged payload.

Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.
All four tools also register their `mcp_`-prefixed aliases.

## MedlinePlus Connect GET and POST

NLM [announced POST support on August 27, 2026](https://medlineplus.gov/medlineplus-connect/news/). It accepts the same parameters as GET, encoded as `application/x-www-form-urlencoded`, with **one code per request**. The web-service adapter targets `https://connect.medlineplus.gov/service`.

In `pated_execute`, pass a field object; the adapter encodes the upstream form:

```js
return await api.post("/medline/service", {
  "mainSearchCriteria.v.cs": "2.16.840.1.113883.6.90",
  "mainSearchCriteria.v.c": "E11.9",
  "informationRecipient.languageCode.c": "es"
});
```

Existing virtual paths remain available with either method:

```js
return await api.post("/medline/topic/loinc/3187-2", {
  "informationRecipient.languageCode.c": "en"
});
```

Use string identifiers to preserve leading zeros. A URL-encoded form string is also accepted; arrays, repeated form keys, conflicting body/query/path codes, and serialized JSON/XML request text are rejected. `GET /medline/service` accepts the same fields as query parameters. Display names, plus signs, ampersands and Unicode are encoded safely. DailyMed routes remain GET-only.

The [provider documentation](https://medlineplus.gov/medlineplus-connect/web-service/) distinguishes English medication-name fallback from code lookups: English RxNorm/NDC requests may use `mainSearchCriteria.v.dn` without a code; Spanish medication requests require a code. Display names do not turn diagnosis, lab or procedure lookups into free-text searches. The prior catalog claim that `informationRecipient=PROV` selects a different reading level was unsupported and has been removed.

JSON responses retain the existing `code_system`, `code`, `total`, and `topics` fields, plus the full `raw_response`, `request_parameters`, HTTP method, source and fetch time. Use `raw_response` for every provider link, attribution and source field. HTML summaries are retained as provider content, not fetched pages. Explicit `knowledgeResponseType: "text/xml"` returns the original Atom XML text instead. JSONP is not supported by this adapter. Valid empty feeds remain successful no-match responses.

Requests have a 30-second deadline and responses an 8MB decoded-byte bound. Large responses stage canonically above 30KB; retrieve the full response through the returned handle. MedlinePlus requests are not automatically retried. HTTP errors preserve status and `data.retry_after` when supplied. NLM documents a limit of 100 requests/minute/IP and recommends caching results for 12–24 hours; this adapter does not implement a shared fleet-wide cache or rate limiter.

## Development

```bash
./scripts/dev-servers.sh patient-education            # run locally (port 8832)
pnpm --filter patient-education-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

---

Provider contracts rechecked on 2026-10-03. GET/form POST parity for all seven
code systems, Spanish data, XML, full staged recovery and existing DailyMed
listing were checked against native provider responses through the local Worker.
Cross-request comparisons exclude only the service's regenerated `updated`
timestamps; the unmodified values remain in the returned payloads. See the
[implementation tracker](../../docs/plans/2026-09-26-upstream-api-implementation.md)
for acceptance evidence and deployment status.

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from MedlinePlus Connect + DailyMed and stays under the terms of that source: DailyMed public domain; MedlinePlus has licensed A.D.A.M. and ASHP content.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
