# Architecture

## The one invariant

**Three classes of relationship must never be confusable, and absence must never
be drawn as zero.**

Everything below is a consequence of that sentence.

| Class | Means | Weight is | Visual channel it owns |
|---|---|---|---|
| `evidence` | somebody counted it, in an external system of record | a measurement | **width** |
| `assertion` | somebody published it, with a release you can replay | curation, not measurement | a **violet hue** and a release **badge**; constant width |
| `traversal` | we walked this pair together | telemetry about us | nothing; constant width, faintest ink |

And the absence rule: a node `count` of `undefined` means **nobody measured
this**; a `count` of `0` means **somebody measured it and the answer was zero**.
The selection readout spells the first one out in words.

## The flow

```
   a user clicks a chip          an agent calls a tool over MCP
   render/demo/demo.js           render/mcp/server.mjs
            \                             /
             \                           /
              v                         v
        ┌──────────────────────────────────────────┐
        │  GraphSession   render/src/session.ts    │   THE TRUST BOUNDARY
        │  - validates every field                 │   nothing below here
        │  - decides evidence vs traversal         │   may invent a number
        │  - refuses receipts that cannot replay   │
        │  - dedupes retries, bounded FIFO memory  │
        └──────────────────────────────────────────┘
                            │ snapshot {nodes, edges, turns}
                            v
        ┌──────────────────────────────────────────┐
        │  patchGraph     render/src/graph-model.ts│   IN-PLACE DIFF
        │  - typed, canonically ordered edge keys  │   never a rebuild
        │  - width from evidence weights only      │
        │  - returns WHICH elements were born      │
        └──────────────────────────────────────────┘
                            │ Graphology mutations
                            v
        ┌──────────────────────────────────────────┐
        │  Sigma          render/src/NodeGraph.tsx │   PAINT
        │  + a bounded Canvas2D overlay for the    │
        │    live window only                      │
        └──────────────────────────────────────────┘
```

The model layer sits beside this, not inside it:

```
   host artifacts (sheets, traces, proposals, decks, sessions)
            │
            v  src/semanticGraph.ts  buildSemanticGraph
   SemanticGraphViewModel {nodes, edges, clusters, stats}
            │
            ├──> src/graphContract.ts   -> nodegraph.document v1 (portable, diffable)
            ├──> src/neo4jAdapter.ts    -> parameterized Cypher batches
            ├──> src/semanticGraph*.ts  -> pure selection / filter / layout / paths
            └──> src/nodeAgentBridge.ts -> five read-only agent tools
```

`examples/compose` is the join, and it is deliberately conservative: the model's
`weight` is a derived relevance score, not a measured count, and its refs carry
a source URL but no release. So every relationship crosses as `traversal`.
**The refusal is the demo.** Nothing is allowed to claim the evidence width
channel or an assertion badge just because it arrived from a sibling package.

## Boundaries you must not cross

1. **Nothing below `GraphSession` may invent a number.** If you find yourself
   summing, averaging or interpolating a count, you are about to break the only
   property this library promises. Two contradictory rows for one (a, b, type)
   resolve by first-occurrence-wins, because picking deterministically is honest
   and averaging would invent a value.
2. **Positions are layout, never meaning.** Dragging a node changes nothing the
   system believes. The force layout runs with `getEdgeWeight: null` on purpose:
   with the default, a traversal count would pull the geometry exactly as hard
   as a measured evidence weight, turning interaction frequency into a spatial
   claim.
3. **Motion means "this just arrived", never "this is large" and never "the
   system is thinking".** The overlay runs only inside the live window an
   ingestion opens, and `prefers-reduced-motion` skips it entirely. Flare radius
   follows the size channel that already encodes count; comet brightness is
   constant.
4. **`visits` is text.** Interaction frequency is carried as an attribute and
   rendered as a labelled number. Never size, colour or opacity, because a node
   visited fifty times is not more true than one visited twice.
5. **Hue is not the only separator.** A reader with no colour vision must still
   separate all three classes, so the three inks also hold three distinct
   luminances. Changing `EDGE_COLOR` without re-running
   `render/tests/edge-grammar.test.mjs` is how the collision came back last time.

## Two decisions that look odd until you know why

**One graph per mount, patched not rebuilt.** Sigma builds five canvases and a
layout worker per instance. Keying a remount on every ingestion replays that
whole lifecycle per update, which reads as flicker. Graphology mutations do not
change the graph's object identity, so identity-keyed memos would go stale; a
`rev` counter is the invalidation the mutation cannot provide.

**Bounded memory with disclosed limits.** An analyst leaves this panel open all
day. Nodes, edges and dedup receipts each have a cap and FIFO eviction, and
`stats()` reports both the limits and the current sizes. An invalid limit throws
at construction rather than degrading into "unbounded", because the forgiving
version of that bug is the dangerous one.
