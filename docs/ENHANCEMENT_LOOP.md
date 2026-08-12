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
captures today: NodeAgent, NodeBench, NodeRoom, NodeTrace, NodeMem, MCP,
LangGraph. Each integration below graduates from PLANNED to SHOWN only with
a committed capture of the graph ingesting that host's real events — the
same gate EVIDENCE.md enforces in the origin repo. No capture, no claim.

1. **TrialScope (the origin) consumes the package.** The product still runs
   a vendored copy of this renderer; it should depend on
   `@homenshum/nodegraph-live` and delete the duplicate. Queued as an item
   in its self-run loop: the package is canonical now, and a fix like
   golden-angle seeding must never need porting twice.
2. **Agent chat hosts (NodeAgent, NodeBench, NodeRoom).** Every tool call
   that returns entities feeds `session.observe(entities, measuredCount?)`;
   every curated source feeds `session.assertEdge(a, b, receipt)`. The
   participant-count rule does the honesty automatically: two entities with
   a measured count draw evidence; three or more draw traversal history.
   The rail becomes the live answer to "what did the agent just use?" —
   the tool-trace test from the ten-workflow eval table, as a component.
3. **NodeTrace.** Trace events are literally the traversal class: each
   step lands as interaction history, and clicking a node deep-links to the
   Trace Lens step that produced it. One recorder, two views.
4. **NodeMem.** Passive noticing emits entities with `countState:
   "unknown"` — present, dim, honest. A suggestion becomes an edge only
   when the human confirms it; NodeMem's notice-don't-act contract and this
   graph's evidence rules are the same rule wearing two names.
5. **The change-inquiry review workspace.** The evidence map beside the
   proposal: verified citations as evidence edges, policy clauses as
   assertion edges badged with their policy revision, the reviewer's own
   navigation as traversal. The decision packet gets a frozen snapshot.
6. **MCP.** A thin `nodegraph` MCP server exposing `observe` and
   `assert_edge` as tools turns ANY MCP-speaking agent into a graph
   author — the host renders one `<NodeGraph>`, agents stream into it, and
   the receipts requirement on `assert_edge` refuses unreceipted claims at
   the protocol boundary.
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
