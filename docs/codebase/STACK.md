# Stack

Two npm packages in one repository. Neither imports the other.

| | Model layer | View layer |
|---|---|---|
| Directory | repo root, source in `src/` | `render/` |
| Package | `@homenshum/nodegraph` 0.3.1 | `@homenshum/nodegraph-live` 0.1.0 |
| Language | TypeScript 5.8, strict, ES2022 target | TypeScript 5.6, strict, ES2020 target |
| Module system | ESM only (`"type": "module"`) | ESM only |
| Build | `tsc -p tsconfig.json` | `tsc -p tsconfig.build.json` |
| Test runner | vitest 4 | `node --test` (Node's built-in runner) |
| Published on npm | not yet | not yet |

Neither package is on npm yet. Consume either by vendoring its `src/` or with a
`file:` dependency.

## Runtime dependencies

**Model layer** (2): `zod` for the agent-tool schemas in `src/nodeAgentBridge.ts`,
`lucide-react` for the icons in the two optional React panels. React is a peer
dependency, so a host that only wants the pure graph functions never installs it.

**View layer** (4): `sigma` (WebGL graph renderer), `graphology` (the graph data
structure), `graphology-layout-forceatlas2` (the force layout, run in a worker),
`@sigma/node-border` (the official Sigma program that draws ringed nodes).
React is again a peer dependency.

There is no CSS framework, no state library, no test framework in the view
layer, no static-server package, and no MCP SDK. Each of those is either a
handful of lines here or a platform feature:

| What a project this shape usually installs | What this repo uses instead |
|---|---|
| a static dev server | `render/scripts/serve-demo.mjs`, 50 lines of `node:http` |
| an MCP server SDK | `render/mcp/server.mjs`, newline-delimited JSON-RPC over stdin |
| a test framework in `render/` | `node --test`, in the standard library since Node 18 |
| a CSS-in-JS or utility framework | inline style objects, so the component carries no CSS dependency |
| a JSON-serialising helper API | `JSON.stringify(value, null, 2)` |

## Toolchain expected on PATH

- **Node 22+**. `render/scripts/browser-demo-gate.mjs` uses the global
  `WebSocket`, which lands in Node 22.
- **Chrome or Chromium** for `cd render && npm run verify:demo`. It probes the
  usual install paths and honours `NODEGRAPH_CHROME`.
- **`ffmpeg`** only for the README capture scripts (`npm run showcase:capture`).
- **Python 3 + Streamlit** only for `examples/streamlit`.

## Browser-side surprises worth knowing before you debug

- `render/demo/index.html` and `examples/compose/index.html` load React, Sigma
  and Graphology from `esm.sh` through an **import map**. There is no bundler in
  the demo path, which is the point, but first load needs network: 42 resources
  from two hosts.
- Sigma **reserves the `type` attribute** on node and edge display data to name
  the rendering program. An edge carrying `type: "evidence"` makes the renderer
  look for a program by that name and throw before anything paints. So the
  semantic kind is stored under `edgeType` in the graph
  (`render/src/graph-model.ts:234`) while the payload field callers write stays
  `type`.
