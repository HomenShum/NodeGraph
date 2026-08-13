# Promotion log — NodeGraph

Loop state lives here, in git, so any agent can resume cold. One entry per
iteration. Append; never rewrite history, because the list of things that turned
out to be wrong is more useful to the next reader than the current values alone.

Iteration cap: **10** (default). On reaching the cap without a gate pass, stop
and leave the remaining defect ledger below — a documented stop is a valid
outcome; a silent one is not.

## Entry shape

```
### Iteration N — YYYY-MM-DD
- Journey exercised: J<k> <name>
- Observed: <the defect, with its reproduction — inputs, width, state>
- Fixed: <the change, using existing components; file paths>
- Re-proved: <evidence path showing the defect gone in the rendered app>
- Tests: <command and result>
- Conditions newly PASS: <numbers, or "none">
```

---

## Baseline — 2026-08-13

Wave 1. Measurement only: **nothing in this repo was fixed, and nothing outside
`promotion/` was touched.** A baseline that quietly repairs things is a baseline
nobody can compare against.

- **Clone:** fresh `git clone --depth 50`, commit `75876ea`.
- **App started:** yes. `cd render && npm install` (11 packages, 8s, exit 0) then
  `node scripts/serve-demo.mjs` → <http://127.0.0.1:4173> serves
  `render/demo/index.html`. `npm install` took 8s and the server answered
  immediately after; the README's "~11s from a fresh clone" was not timed
  end-to-end here, so treat it as unmeasured rather than confirmed. Note the demo
  pulls React, Sigma and Graphology from `esm.sh` at runtime through an import
  map, so the "no configuration" quickstart still needs network — 42 resources
  load, from two hosts.
- **Journeys drivable:** 3 of 5 fully (J1, J2, J3). J4 renders but only via a
  static server that does not exist in this repo. J5's CLI half passes (exit 0);
  its browser half was not driven.
- **Scorecard at baseline:** 2/12 PASS — see [PRODUCT_GOAL.md](PRODUCT_GOAL.md).
- **Deferred:** no. This repo was not marked DEFERRED in the wave note; it was
  installed, run, and driven.

### Commands run, with real exit codes

| Command | Exit | Note |
|---|---|---|
| `git clone --depth 50 …/NodeGraph.git` | 0 | commit `75876ea` |
| `cd render && npm install` | 0 | 11 packages, 8s |
| `cd render && npm test` | 0 | 7 tests pass (Node's built-in runner; `pretest` builds) |
| `cd render && npm run typecheck` | 0 | |
| `cd render && npm run verify:demo` | **1** | `demo proof failed: {"htmlStatus":200,"title":true,"liveButton":false,"demoStatus":200,"assertionReceipt":true,"componentStatus":200}` — defect D1 |
| `cd render && node mcp/client-demo.mjs` | 0 | `MCP SESSION COMPLETE — boundary held` |
| `npm install` (root) | 0 | 122 packages, 52s; `prepare` runs the build |
| `npm test` (root) | 0 | 14 tests pass, 2 files, vitest 4.1.10 |
| `npm run typecheck` (root) | 0 | |
| `npm run build` (root) | 0 | |
| `node scripts/serve-demo.mjs` | running | demo server for the captures |
| headless-Chrome CDP capture ×6 | 0 | wrote `promotion/evidence/baseline/*` |

### One near-miss worth recording

The first `verify:demo` run was measured against the **wrong process**. Port 4173
was already held by an 11-hour-old orphaned `serve-demo.mjs` from an earlier
session; `probe-demo.mjs` spawns its own server but fetches a hardcoded
`127.0.0.1:4173`, so its child silently lost the bind and the probe read a tree
that was not this clone. The stale process was killed and the run repeated
against this clone, which reproduced the identical failure — so D1 stands, but it
stands on the second measurement, not the first. Two consequences for whoever
works this next: restart the server before capturing, and `probe-demo.mjs` will
happily grade a stranger's demo without saying so.

## Defect ledger

Open defects, most-impactful first. A defect is only listed once it has a
reproduction; a hunch is not a defect.

| # | Severity | Journey | Reproduction | Status |
|---|----------|---------|--------------|--------|
| D1 | major | J1 | Fresh clone → `cd render && npm install && npm run verify:demo` → **exit 1**, `demo proof failed: {…"liveButton":false…}`. `render/scripts/probe-demo.mjs:35` asserts the demo HTML contains the string `Add another live branch`; that string exists nowhere under `render/demo/`. The gate's second half would fail too: `render/scripts/browser-demo-gate.mjs:178` clicks `#add-branch`, and `grep -rn "add-branch" demo/ src/` returns nothing. The repo's own rendered-demo gate is stale relative to the ten-scenario gallery that replaced the single-branch demo. | open |
| D2 | major | J1 | `render/README.md:23` ("then press **Add another live branch**") and `:218` tell a first-time reader to press a control that does not exist. Rendered at 1280x900, the page offers ten scenario chips and no such button; `document.body.innerText.includes('Add another live branch')` is `false` in all seven captured states (`report.json` → every step's `addBranchText`). The first instruction a stranger follows after the app starts is wrong. | open |
| D3 | major | J2 | Press **Assertion chain** at 1280x900. The caption under the stage reads "violet assertion edges, each carrying a full replay receipt" (`render/demo/demo.js:146`) and `render/README.md:63` says "A violet `assertion` edge". Nothing violet is drawn: `render/src/graph-model.ts:89` sets `assertion: { dark: "#727b83" }` against `traversal: { dark: "#616a72" }` and `evidence: { dark: "#a8b1b9" }` — two near-identical greys about 1.3:1 apart. See `09-selection-readout.png`: the only thing separating a curated claim from interaction history in the drawing is the small `v97` label. The repo's binding rule is that these three classes never look alike, and the docs describe a colour channel the renderer does not implement. | open |
| D4 | major | J4 | The root README presents `examples/compose` as the proof that the two layers are one product, with a screenshot. There is no command to run it: no script in either `package.json`, no mention in "Development" or "Example App", and `examples/compose/compose.js` imports `../../dist/semanticGraph.js` and `../../render/dist/index.js`, so it also silently requires both layers to be built. It renders correctly once served — "model: 54 nodes, 102 edges, 6 backed facts · rendered: 46 entities, 94 relationships (all traversal …)", 0 console errors (`13-compose.png`) — but only from a static server written by hand for this capture. | open |
| D5 | major | J1 | At 390x844 (`07-mobile-390.png`) the page itself is fine — chips wrap, 0 px horizontal overflow — but the graph is only shrunk, never fitted: the camera keeps its desktop framing, so "intervention h…" and "biomarker hub…" are clipped at the canvas edge and roughly half the constellation sits outside the visible stage. `render/demo/index.html` also pins `#root { min-height: 620px }`, so the canvas stays taller than most of a phone screen. A `fit` control exists but the reader has to know to press it. | open |
| D6 | minor | J1 | The live counter under the stage ("142 entities · 145 edges", `#stats`) is `rgb(85,96,106)` on `#0b0e12` — measured 3.01:1, below the 4.5:1 AA minimum for body text (`report6.json` → `contrast`). It is the one text element on the page that fails; the other 19 measured pass. | open |
| D7 | major | J2 | A keyboard-only reader can reach every scenario chip (Tab, visible ring, Enter activates — `05-keyboard-focus.png`) but can never open a node, and the node readout is where "measured 0" vs "unknown", and the Reactome receipt, are disclosed. Measured on the rendered page: 8 `<canvas>` elements, 0 with a `role` or `aria-label`; `[data-testid="nodegraph-canvas"]` has no `tabindex`; 0 `aria-live` regions on a surface whose content streams in while the reader watches (`report6.json` → `basics`). | open |

## Iterations

_none yet — Wave 1 is baseline measurement only._
