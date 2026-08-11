# NodeGraph

A typed-edge live graph for agent sessions: Sigma.js + Graphology, React.
Built for interfaces where a graph accumulates while an agent works, and where
the reader has to stay able to tell what is evidence and what is not.

## The three trust rules

Chart libraries treat all edges alike. This one refuses to, and that refusal
is the product:

1. **Edge types are visually distinct because their epistemics are distinct.**
   `evidence` edges carry measured weights (an API count, a database
   aggregate) and own the width channel. `traversal` edges are interaction
   history — telemetry about *us*, not evidence about the world — and get a
   constant width, labelled "local" next to their toggle. `assertion` edges
   are curated claims, badged with the release that introduced them
   (`releaseTag`), never widened. Measured evidence, curated assertions, and
   interaction history must never look alike.

2. **Motion only during ingestion windows, and never encoding magnitude.**
   The cinematic layer (birth flares, comets on newborn edges, breath halos)
   runs only inside the live window a real ingestion opens, then the rAF loop
   exits and the canvas is still. Animation means "the system did this just
   now" — it is never "the system is thinking", and no animated property
   encodes a value. `prefers-reduced-motion` skips it entirely.

3. **Positions are layout, never meaning.** Seed positions are deterministic
   (circle seeds; new nodes seed at a neighbour or the centroid with
   deterministic jitter — never at the origin). Nodes are draggable, and a
   drag has no semantic effect: the layout pauses so physics does not fight
   the hand, and it stays paused after release.

## Install

```sh
npm install nodegraph sigma graphology graphology-layout-forceatlas2 @sigma/node-border
```

React >= 18 is a peer dependency. This package currently ships TypeScript
source (`src/`) — consume it through a bundler that compiles TS (Next.js,
Vite, etc.).

## Usage

```tsx
import { useSyncExternalStore } from "react";
import { GraphSession, NodeGraph } from "nodegraph";

const session = new GraphSession();

// Two participants + a measured conjunction -> `evidence` edge (weight 362).
session.observe(
  [{ kind: "condition", label: "melanoma" }, { kind: "intervention", label: "ipilimumab" }],
  362,
);

// Three or more participants -> pairwise `traversal` edges only: a measured
// count belongs to the whole conjunction, and drawing it on any single pair
// would claim a pair count nothing measured.
session.observe([
  { kind: "condition", label: "melanoma" },
  { kind: "intervention", label: "ipilimumab" },
  { kind: "sponsor", label: "BMS" },
]);

// A curated claim, badged with the release that introduced it.
session.assertEdge(
  { kind: "intervention", label: "ipilimumab" },
  { kind: "intervention", label: "nivolumab" },
  { releaseTag: "v1.2" },
);

function Panel() {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return <NodeGraph nodes={snap.nodes} edges={snap.edges} visits={session.visitsById()} />;
}
```

You can also bypass the session store and feed `NodeGraph` (or `buildGraph` /
`patchGraph` directly) with your own `{ nodes, edges }`, or ingest a whole
subgraph payload with `session.ingest({ entities, relationships })`.

## The patchGraph no-remount contract

`<NodeGraph>` builds its Graphology graph **once per mount** and patches
growth into it in place. `patchGraph` diffs incoming `{nodes, edges}` against
the live graph, returns exactly which node ids and edge keys were born (so
the cinematic layer flares precisely the newcomers), and never rebuilds the
Sigma instance. Rebuilding on every update tears down five canvases and the
layout per ingestion — the whole panel flashes. Internally a `rev` counter
invalidates memos, because mutations do not change the graph's object
identity.

Two model invariants back this up:

- The edge key is `(min(a,b), max(a,b), type)` on a multigraph, so a
  traversal count can never silently overwrite a measured evidence weight.
- The width scale is computed over evidence edges only, so a 900-visit
  traversal edge cannot stretch the scale measured weights are read against.

## Provenance

Extracted from **TrialScope** (a clinical-trials count-probe explorer),
where this stack rendered the session's accumulated entity graph next to the
chat. TrialScope-specific wire-format parsing (capability manifests, trace
step parsing) stayed behind; the participant-count ingestion rule, the typed
edge model, the patch contract, the drag behaviour, and the cinematic layer
are ported intact. Edge types were renamed for the general case:
`co-occurrence` → `evidence`, `agent-traversal` → `traversal`, and
`assertion` (with `releaseTag`) is new.

One measured note from the source repo (its `MEASUREMENTS.md` #62, produced
by its `web/scripts/bench-graph.mjs`, not re-run here): the Sigma/Cytoscape
interaction crossover sits between N=300 and N=600 — at N=300 Cytoscape still
clicked faster (1.3 ms vs 1.6 ms), at N=600 Sigma led for the first time —
but Cytoscape's blocking `cose` layout (1.4 s at N=300, 122 s at N=2500) is
what actually makes it unusable at scale; Sigma dropped no frames up to
N=2500 in that benchmark.

## License

MIT © 2026 Homen Shum
