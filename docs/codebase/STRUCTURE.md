# Structure

What lives where, and what you can safely ignore on day one.

```
.
├── src/                    MODEL LAYER: artifacts -> semantic graph
├── render/                 VIEW LAYER: the live drawing surface (its own package)
├── examples/               three runnable examples, one per audience
├── tests/                  model-layer tests (vitest)
├── scripts/                repo-level build and capture scripts
├── promotion/              the product-readiness loop: goal, journeys, log, evidence
├── docs/                   this packet, plus integration notes
└── .tours/                 the same walks as clickable CodeTours
```

## `render/` — the view layer, and where to start reading

| File | Lines | What it owns |
|---|---:|---|
| `render/src/session.ts` | 394 | **The trust boundary.** Bounded session memory, the evidence/traversal decision, receipt validation, idempotent retries. |
| `render/src/graph-model.ts` | 518 | The Graphology graph: typed edge keys, the three inks, the width channel, and `patchGraph`, the in-place diff. |
| `render/src/NodeGraph.tsx` | 786 | The React + Sigma renderer: filters, hover isolation, drag, the selection readout, and the bounded cinematic overlay. |
| `render/src/index.ts` | 31 | Core entry (`@homenshum/nodegraph-live`). |
| `render/src/react.ts` | 6 | React entry (`.../react`). Named export only. |
| `render/demo/` | 265 + html | The ten-scenario gallery. Each scenario is one object in `SCENARIOS`. |
| `render/mcp/` | 265 | Stdio MCP server, a client demo that drives it, and a viewer that tails the event log. |
| `render/scripts/` | 405 | Serve the demo, probe it, drive it in headless Chrome, capture the gallery. |
| `render/tests/` | 462 | Four scenario suites on `node --test`. |

## `src/` — the model layer

Reading order: `types.ts` (the host's domain: artifacts, cells, traces,
proposals) → `semanticGraphTypes.ts` (the graph's own vocabulary) →
`semanticGraph.ts` (the derivation) → everything else, which are consumers of a
built graph.

| File | Lines | What it owns |
|---|---:|---|
| `src/semanticGraph.ts` | 1071 | `buildSemanticGraph`: one `derive*` function per source of relationships (sheets, text artifacts, traces, proposals, deck storyboards, sessions). The biggest file in the repo. |
| `src/semanticGraphTypes.ts` | 239 | Node kinds, edge kinds, statuses, the view model, the input shape. |
| `src/types.ts` | 181 | The host domain types the model reads. |
| `src/neo4jAdapter.ts` | 219 | Parameterized, APOC-free Cypher batches. Full upsert and incremental sync. |
| `src/graphContract.ts` | 186 | The `nodegraph.document` v1 portable contract: export, parse, diff. |
| `src/relationshipReview.ts` | 186 | Classifies edges as source-backed or needing reviewer confirmation. |
| `src/nodeAgentBridge.ts` | 305 | Five read-only zod-typed tools over a built graph, plus a context builder. |
| `src/semanticGraph{Selectors,Filters,Clusters,Paths,Layout}.ts` | 78-162 each | Pure functions over a built graph: neighborhoods, filters, cluster ranking, ranked multi-hop paths, three deterministic layouts. |
| `src/inMemoryAdapter.ts` | 73 | Document store with sync receipts, for hosts without a database. |
| `src/EntityGraphDetailPanel.tsx`, `src/NodeGraphAgentPanel.tsx` | 105, 129 | Optional React panels. The only files that pull `lucide-react`. |

## `examples/` — pick the one matching your question

| Example | Answers | Run |
|---|---|---|
| `examples/compose` | "Do the two layers actually work together?" | `npm run example:compose` |
| `examples/showcase` | "What does the model layer look like in a real React app?" | `npm run example:dev` |
| `examples/streamlit` | "Can a Python host use this?" | see the root README |

## `promotion/` — the product loop, not the code

`PRODUCT_GOAL.md` states who this is for and holds the current twelve-condition
scorecard. `PROMOTION_LOG.md` is the append-only defect ledger with
reproductions. `promotion/evidence/` holds the screenshots and JSON that back
every claim. Read `PRODUCT_GOAL.md` if you want to know what "done" means for
this product; read `PROMOTION_LOG.md` before you re-report a defect somebody
already found.

## What you can ignore on day one

`docs/internal/`, `docs/ENHANCEMENT_LOOP.md` and
`docs/PRODUCT_AUDIT_2026-08-12.md` are cross-repo planning notes. `render/media/`
and `docs/media/` are committed capture artifacts (GIFs, MP4s, PNGs), all
regenerable by the scripts named beside them in `render/README.md`.
