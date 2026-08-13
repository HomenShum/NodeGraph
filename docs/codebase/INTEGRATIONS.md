# Integrations

Everything this repository talks to, and what happens when it is unavailable.

## There are no secrets and no credentials anywhere

No API keys, no tokens, no database passwords, no `.env` file, and nothing to
configure before `npm test` passes. The model layer is storage-neutral: it emits
Cypher **text and parameters** and never opens a connection. Search the tree for
`process.env` and you will find three variables, all optional and all listed
below.

## Outbound network

| Who | What | When | If it is unavailable |
|---|---|---|---|
| `esm.sh` | React 19, Sigma 3, Graphology 0.26 + forceatlas2, `@sigma/node-border`, via an import map | first load of `render/demo/index.html` and `examples/compose/index.html` | the demo page renders its heading and then nothing. **This is the most likely reason a fresh clone "does not work".** The library itself has no such dependency; only the bundler-free demo pages do. |
| `reactome.org` | nothing is fetched | never | the demo's receipt URLs point there so a reader can click through; they are data, not requests |

Unit tests, typecheck and build are fully offline. `verify:demo` and
`proof:edge-grammar` need only localhost plus whatever the demo page pulls.

## Local processes

| Process | Started by | Port | Notes |
|---|---|---|---|
| static demo server | `render/scripts/serve-demo.mjs` | 4173, override with `NODEGRAPH_DEMO_PORT` | refuses any path resolving outside the served root |
| headless Chrome | `render/scripts/browser-demo-gate.mjs`, `promotion/scripts/prove-edge-grammar.mjs` | ephemeral CDP port | found via `NODEGRAPH_CHROME` or the usual install paths; each gate spawns and kills its own |
| MCP stdio server | `render/mcp/server.mjs` | none, stdio | appends accepted events to `.nodegraph/events.jsonl` (git-ignored) |
| NodeAgent bridge | `examples/streamlit/nodeagent_server.mjs` | 8787 | the Streamlit app calls `NODEGRAPH_NODEAGENT_URL`, defaulting to `http://127.0.0.1:8787/agent` |

## Environment variables

All three are optional and none is required for tests or build.

- `NODEGRAPH_DEMO_PORT` — port for the static demo server (default 4173).
- `NODEGRAPH_CHROME` — absolute path to a Chrome/Chromium binary for the
  browser gates.
- `NODEGRAPH_NODEAGENT_URL` — where the Streamlit example sends chat turns.

## Model Context Protocol

`render/mcp/server.mjs` is a handwritten stdio MCP server (JSON-RPC 2.0,
newline-delimited) with no SDK dependency. It exposes two tools, `observe` and
`assert_edge`, and validates them with the real `GraphSession`, so the trust
grammar is enforced at the protocol boundary rather than restated there. A call
the session refuses returns `isError: true` with the session's own message and
**writes nothing** to the event log.

Drive it end to end without an agent:

```sh
cd render && node mcp/client-demo.mjs      # -> "MCP SESSION COMPLETE - boundary held"
```

`render/mcp/viewer/` tails `.nodegraph/events.jsonl` into a live rail.

## Neo4j

`src/neo4jAdapter.ts` builds parameterized, APOC-free Cypher batches that run on
a standard driver session. Two shapes: `buildNeo4jUpsertPlan` for a
non-destructive full upsert, `buildNeo4jSyncPlan` for an incremental change
derived from two versioned documents, with host-controlled stale pruning.
`executeNeo4jUpsertPlan` / `executeNeo4jSyncPlan` take a `Neo4jSessionLike` —
an interface with a single `run` method — so the tests exercise the real plans
against a fake session and the package never depends on a driver.

## Downstream consumers

`NodeRoom` is the origin product and the main consumer of the model layer.
`TrialScope` is where the view layer's trust grammar came from. Cross-repo
planning notes live in `docs/internal/`, `docs/integrations.md` and
`docs/nodeagent-integration.md`. Those are notes about other repositories; do
not treat them as descriptions of this one.
