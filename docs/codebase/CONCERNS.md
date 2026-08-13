# Concerns

Honest list. Everything here has a reproduction; hunches are not listed. The
canonical ledger with full reproductions is
[`promotion/PROMOTION_LOG.md`](../../promotion/PROMOTION_LOG.md); this file says
what a new engineer needs to know before touching the code.

## Open defects, most impactful first

### D7 (major) — the graph is unreachable by keyboard

A keyboard-only reader can Tab to every scenario chip, see a focus ring, and
press Enter. They can never open a node. The node readout is where "measured 0"
versus "unknown", and the Reactome receipt, are actually disclosed, so the one
thing this product exists to say is mouse-only.

Measured on the rendered page: 8 `<canvas>` elements, none with a `role` or
`aria-label`; `[data-testid="nodegraph-canvas"]` has no `tabindex`; zero
`aria-live` regions on a surface whose content streams in while the reader
watches.

Where a fix goes: `render/src/NodeGraph.tsx`, the stage wrapper and the
`selected` readout. A roving-tabindex list of node buttons rendered beside the
canvas, plus `aria-live="polite"` on the stats line, would cover it without
touching the renderer.

### D5 (major) — the graph camera never fits to a small viewport

At 390x844 the page itself is fine: chips wrap and horizontal overflow is 0.
But the camera keeps its desktop framing, so labels clip at the canvas edge and
roughly half the constellation sits outside the visible stage.
`render/demo/index.html` also pins `#root { min-height: 620px }`, taller than
most of a phone screen. A `fit` control exists but the reader has to know to
press it. The graph surface is shrunk, not adapted.

### D6 (minor) — one contrast failure

The live counter under the stage (`#stats`) is `rgb(85,96,106)` on `#0b0e12`:
3.01:1, below the 4.5:1 AA minimum for body text. It is the only failing text
element of the 20 measured. One hex value in `render/demo/index.html`.

### No error state exists anywhere in the demo

Zero matches for `error` or `catch` in `render/src/NodeGraph.tsx` and
`render/demo/demo.js`. `GraphSession` throws precisely and the MCP server
surfaces the refusal correctly, but a rejected batch in the browser has nowhere
to appear. Before the first ingestion the stage is a blank dotted grid reading
"0 entities · 0 edges" with no copy, so loading and empty are undesigned too.

### Two conditions were never verified, and UNVERIFIED is not PASS

No Web Interface Guidelines review and no axe or Lighthouse audit has been run
against this surface. No input-latency or frame measurement was taken during the
142-entity dense constellation, which is the case that condition exists to test.

## Structural concerns, no reproduction needed

**Two packages, two test runners, two tsconfig styles.** vitest at the root,
`node --test` in `render/`. `npm run test:all` now runs both plus
`docs:check`, so a newcomer has one green light instead of half of one — but the
two runners themselves remain, and root `npm test` still passes without
executing a line of `render/`. Converging the runners is a real system change
(the root's tests are `.ts` and need transpilation), so it stays open.

**`src/semanticGraph.ts` is 1071 lines.** It is well sectioned — one `derive*`
function per source of relationships — and jscpd finds no duplication in it, so
splitting it would move code without removing a concept. It is still the file
where a newcomer will get lost first.

**The model layer's public API is 33 runtime exports** (count it:
`node -e "import('./dist/index.js').then(m=>console.log(Object.keys(m).length))"`,
after `npm run build`). For a library that is not yet on
npm and has one known consumer, that is a wide surface to keep compatible.
Two of them, `selectSemanticEdge` and `semanticGraphIndexes`, are used only
inside this repository — `selectSemanticEdge` is the only producer of
`selection.selectedEdge`, which `EntityGraphDetailPanel` and `nodeAgentBridge`
both render. Deleting it would delete the edge-selection capability, not dead
code, so it stayed.

**The demo needs network.** `render/demo/index.html` and
`examples/compose/index.html` load React, Sigma and Graphology from `esm.sh`
through an import map. Offline, the page renders its heading and then nothing.
The library has no such dependency; only the bundler-free demo pages do.

**`docs/internal/`, `docs/ENHANCEMENT_LOOP.md` and
`docs/PRODUCT_AUDIT_2026-08-12.md` describe other repositories** and plans that
may not have happened. They are planning notes, not descriptions of this tree.

## Things that look like bugs and are not

- **Every relationship in `examples/compose` renders as `traversal`.** That is
  the demo. The model's `weight` is a relevance score, not a measured count, and
  its refs carry no release, so nothing may claim the evidence width channel or
  an assertion badge. The refusal is the feature.
- **The graph stops moving and stays stopped after you drag a node.** A reader
  who placed a node has expressed an opinion the next settle should not overrule.
- **An isolated node stays visible when you filter its edge type away.** A node
  that was never joined to anything is hidden by nothing; hiding it would be an
  unrelated claim about the data.
