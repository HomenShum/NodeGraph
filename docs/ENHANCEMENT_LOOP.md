# The enhancement loop, and how the graph joins every agent workflow

Written 2026-08-12, the day the gallery shipped and its first dense capture
found a real geometry bug (collinear seeding, measured at 1.6e-15 spread).
That sequence — demand more of the visual, capture it, let the density
expose the defect, fix it with a regression test — IS the loop. This page
makes it standing policy instead of a good day.

## Part 1 — how the renderer keeps getting better

1. **The visual gate is permanent.** Every visual change re-runs
   `render/scripts/capture-gallery.mjs` and (for motion changes) the
   model-judge comparison against the morpho reference — three runs, only
   the across-run signal counts, verdicts appended to a ledger. A dimension
   that stays below par across runs becomes a work item; a single-run flap
   does not. Judge noise is real and measured; treat the judge like any
   instrument.
2. **Scenarios grow like a curriculum.** Every new capability lands WITH a
   gallery scenario whose caption states the trust rule it demonstrates.
   Every visual bug lands as a geometry regression test in the
   `seed-geometry.test.mjs` pattern: measure the degenerate quantity
   (collinearity, overlap, drift), pin the pre-fix number in the test text,
   assert the healthy range.
3. **Density is a measured budget.** The Sigma-vs-Cytoscape crossover
   (N≈600) and the repulsion-at-density behavior get re-benchmarked per
   release, not remembered. The gallery's dense scenario is the standing
   probe: if 142 entities ever stop reading as structure, the capture says
   so before a user does.
4. **The one structural rung left: real bloom.** The judged gap that
   parameter tweaks cannot close (motion depth at sidebar scale) needs a
   WebGL post-process pass. That lands as a PROPOSAL with cost, trust-rule
   analysis, and a re-judge plan — never as a quiet patch.
5. **The stranger test on release.** Clone → `cd render` → `npm install`
   → `npm run demo`: measured at 11–12 seconds. A release that regresses
   TTFW is a failed release regardless of what it adds.

The constraint that makes all of this safe to automate: the trust grammar is
frozen. Evidence, assertion, and traversal must never look alike; motion
runs only during ingestion windows and never encodes magnitude; positions
are layout, never meaning. Enhancement means MORE craft inside those rules,
never a loosened rule.

## Part 2 — one graph, every agent surface

The renderer's job in the agent era: **the right rail that shows what the
system actually did** — measured facts, curated claims, and interaction
history, visibly distinct, streaming as work happens. Each integration
below wires a real event stream into `GraphSession` and inherits the
grammar for free.

**Status stamps, verified 2026-08-12 — because an integration without a
capture is a plan, not a feature.** SHOWN: the origin product (TrialScope,
vendored renderer — session growth probes, gate videos, assertion captures)
and this repo's own gallery + compose bridge. PLANNED, zero wiring and zero
captures today: NodeAgent, NodeBench, NodeRoom,
LangGraph. NodeMem: SHOWN 2026-08-12 — its own demo pipeline noticed
entities as unmeasured dim nodes with zero edges until a human confirmed one
suggestion, before/after captures committed in the host (see item 4).
NodeTrace: SHOWN 2026-08-12 — real SQLite trace events ingest as
traversal-only interaction history, capture committed in the host (see item
3). MCP: SHOWN 2026-08-12 — a bundled client drives a real JSON-RPC
session, the unreceipted assertion is refused at the boundary, and the
viewer capture is committed (render/mcp/viewer/mcp-rail.png). Each integration below graduates from PLANNED to SHOWN only with
a committed capture of the graph ingesting that host's real events — the
same gate EVIDENCE.md enforces in the origin repo. No capture, no claim.

1. **TrialScope (the origin) consumes the package.** The product still runs
   a vendored copy of this renderer; it should depend on
   `@homenshum/nodegraph-live` and delete the duplicate. Queued as an item
   in its self-run loop: the package is canonical now, and a fix like
   golden-angle seeding must never need porting twice.
2. **Agent chat hosts (NodeAgent, NodeBench, NodeRoom).** NodeAgent:
   SHOWN 2026-08-12 — every step of its real loop feeds the session
   (HomenShum/NodeAgent@631be93, docs/media/live-graph-rail.png: 12
   entities, 5 evidence / 21 traversal, with measured counts only from
   actual artifacts — context items selected, cells changed, citations
   written — and the missing citation `release` field recorded as the API
   gap blocking assertions). NodeBench: SHOWN-with-caveat 2026-08-12 —
   its Convex/key walls cannot be honestly bypassed, so a committed real
   eval transcript (24 persona-episode runs) replays through the rail
   (HomenShum/NodeBenchAI@76c7de98, demo/graph-rail/graph-rail.png: 34
   entities, 28 traversal edges, every label verified verbatim against the
   fixture; no assertEdge because no fixture carries a complete receipt).
   NodeRoom: in flight. The
   pattern: every tool call
   that returns entities feeds `session.observe(entities, measuredCount?)`;
   every curated source feeds `session.assertEdge(a, b, receipt)`. The
   participant-count rule does the honesty automatically: two entities with
   a measured count draw evidence; three or more draw traversal history.
   The rail becomes the live answer to "what did the agent just use?" —
   the tool-trace test from the ten-workflow eval table, as a component.
3. **NodeTrace.** (SHOWN 2026-08-12, capture committed) Trace events are
   literally the traversal class: each step lands as interaction history —
   `observe()` with no measured count, `assertEdge` never called — and
   clicking a node lists the trace event ids that produced it. One recorder,
   two views. Wired in
   [NodeTrace@cdf3cb5](https://github.com/HomenShum/NodeTrace/commit/cdf3cb5)
   with the vendored build under `vendor/nodegraph-live/`; the committed
   capture is NodeTrace's `docs/screenshots/live-graph-rail.png`, regenerated
   by `npm run capture:live-graph`, which exits nonzero on an empty rail.
4. **NodeMem.** Passive noticing emits entities with `countState:
   "unknown"` — present, dim, honest. A suggestion becomes an edge only
   when the human confirms it; NodeMem's notice-don't-act contract and this
   graph's evidence rules are the same rule wearing two names. Wired in
   [NodeMem@6a7c10a](https://github.com/HomenShum/NodeMem/commit/6a7c10a)
   with the vendored build under `vendor/nodegraph-live/`: the browser rail
   (`demo/graph-rail/`) imports the CLI demo's own classifier and store, a
   confirmed suggestion draws only a traversal edge, `assertEdge` is never
   called (no versioned curated source), and the committed before/after
   captures under `assets/graph-rail/` are regenerated by
   `scripts/capture-graph-rail.mjs`, which exits nonzero if any edge exists
   before a confirmation.
5. **The change-inquiry review workspace.** The evidence map beside the
   proposal: verified citations as evidence edges, policy clauses as
   assertion edges badged with their policy revision, the reviewer's own
   navigation as traversal. The decision packet gets a frozen snapshot.
6. **MCP (SHOWN 2026-08-12).** `render/mcp/`: a dependency-free stdio
   server exposing `observe` and `assert_edge`, validated by the real
   GraphSession — the bundled client's unreceipted assertion is refused at
   the protocol boundary (exit-nonzero test), accepted events tail into the
   viewer rail, capture committed. Caveat stated: the driving client is
   bundled; the first EXTERNAL MCP host wiring upgrades the caveat away.
7. **LangGraph, when a workflow adopts it.** Checkpointed state maps to a
   snapshot per step with `thread_id` as the session key; disconnect and
   rejoin replays the graph from durable state instead of losing it.
8. **The model layer, composed.** `examples/compose/` (SHIPPED 2026-08-12, capture committed) bridges the
   semantic layer at this repo's root into the renderer: the model
   classifies which relationships are source-backed; the renderer refuses
   to draw them like the rest. One repo, two layers, one demo that proves
   they're one product.

Every integration ships with the same three tests, transposed: the three
refusals (no fuzzy identity, no unreceipted assertion, no telemetry styled
as evidence) — because a graph that is everywhere is only worth having if
it cannot lie anywhere.
