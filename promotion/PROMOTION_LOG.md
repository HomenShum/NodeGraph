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
| D1 | major | J1 | Fresh clone → `cd render && npm install && npm run verify:demo` → **exit 1**, `demo proof failed: {…"liveButton":false…}`. `render/scripts/probe-demo.mjs:35` asserts the demo HTML contains the string `Add another live branch`; that string exists nowhere under `render/demo/`. The gate's second half would fail too: `render/scripts/browser-demo-gate.mjs:178` clicks `#add-branch`, and `grep -rn "add-branch" demo/ src/` returns nothing. The repo's own rendered-demo gate is stale relative to the ten-scenario gallery that replaced the single-branch demo. | **fixed, wave 3** — `verify:demo` exits 0 on 6/6 consecutive runs; see `docs/SIMPLIFICATION_REPORT.md`. |
| D2 | major | J1 | `render/README.md:23` ("then press **Add another live branch**") and `:218` tell a first-time reader to press a control that does not exist. Rendered at 1280x900, the page offers ten scenario chips and no such button; `document.body.innerText.includes('Add another live branch')` is `false` in all seven captured states (`report.json` → every step's `addBranchText`). The first instruction a stranger follows after the app starts is wrong. | **fixed, wave 3** — both passages now describe the ten scenario chips that exist. |
| D3 | major | J2 | Press **Assertion chain** at 1280x900. The caption under the stage reads "violet assertion edges, each carrying a full replay receipt" (`render/demo/demo.js:146`) and `render/README.md:63` says "A violet `assertion` edge". Nothing violet is drawn: `render/src/graph-model.ts:89` sets `assertion: { dark: "#727b83" }` against `traversal: { dark: "#616a72" }` and `evidence: { dark: "#a8b1b9" }` — two near-identical greys about 1.3:1 apart. See `09-selection-readout.png`: the only thing separating a curated claim from interaction history in the drawing is the small `v97` label. The repo's binding rule is that these three classes never look alike, and the docs describe a colour channel the renderer does not implement. | **fixed, iteration 1** — measured at 6.70 CIEDE2000 dark / 9.44 light, now 22.37 / 26.47. `promotion/evidence/edge-grammar/` |
| D4 | major | J4 | The root README presents `examples/compose` as the proof that the two layers are one product, with a screenshot. There is no command to run it: no script in either `package.json`, no mention in "Development" or "Example App", and `examples/compose/compose.js` imports `../../dist/semanticGraph.js` and `../../render/dist/index.js`, so it also silently requires both layers to be built. It renders correctly once served — "model: 54 nodes, 102 edges, 6 backed facts · rendered: 46 entities, 94 relationships (all traversal …)", 0 console errors (`13-compose.png`) — but only from a static server written by hand for this capture. | **fixed, wave 3** — `npm run example:compose` builds both layers and serves it; re-proved in headless Chromium, 0 console errors, `promotion/evidence/wave3/`. |
| D5 | major | J1 | At 390x844 (`07-mobile-390.png`) the page itself is fine — chips wrap, 0 px horizontal overflow — but the graph is only shrunk, never fitted: the camera keeps its desktop framing, so "intervention h…" and "biomarker hub…" are clipped at the canvas edge and roughly half the constellation sits outside the visible stage. `render/demo/index.html` also pins `#root { min-height: 620px }`, so the canvas stays taller than most of a phone screen. A `fit` control exists but the reader has to know to press it. | open |
| D6 | minor | J1 | The live counter under the stage ("142 entities · 145 edges", `#stats`) is `rgb(85,96,106)` on `#0b0e12` — measured 3.01:1, below the 4.5:1 AA minimum for body text (`report6.json` → `contrast`). It is the one text element on the page that fails; the other 19 measured pass. | open |
| D7 | major | J2 | A keyboard-only reader can reach every scenario chip (Tab, visible ring, Enter activates — `05-keyboard-focus.png`) but can never open a node, and the node readout is where "measured 0" vs "unknown", and the Reactome receipt, are disclosed. Measured on the rendered page: 8 `<canvas>` elements, 0 with a `role` or `aria-label`; `[data-testid="nodegraph-canvas"]` has no `tabindex`; 0 `aria-live` regions on a surface whose content streams in while the reader watches (`report6.json` → `basics`). | open |

## Iterations

### Iteration 1 — 2026-08-13 — D3, the trust grammar

- **Journey exercised:** J2 — read a claim's provenance off the drawing.

- **Observed:** on the rendered gallery at 1280x900, "Assertion chain", the
  four curated assertion edges and the traversal edges are the same line. The
  baseline called it "about 1.3:1 apart" by eye; measured, it is **CIEDE2000
  6.70 in dark and 9.44 in light** — the CIE just-noticeable difference for two
  large adjacent patches is 2.3, and these are 1px anti-aliased strokes
  scattered across a stage. `promotion/evidence/edge-grammar/before/`
  (`edge-grammar.json` verdict FAIL, exit 1; `assertion-chain-dark.png` shows
  four grey edges under a caption promising violet ones).

- **Root cause** — `render/src/graph-model.ts:79-90`, and it was written down
  in the comment above the palette: hue was reserved entirely for node kind,
  width entirely for evidence magnitude, which left **one** channel —
  lightness — to carry a **three**-way categorical distinction against a single
  background. Three mutually distinguishable steps do not fit on that ramp, so
  two classes landed on top of each other. The comment named the mitigation:
  *"the per-type filter toggles do the discriminating work"* — which only holds
  by switching the other classes **off**, i.e. exactly the state the rule is not
  about. The docs were never wrong; the renderer never implemented them.

- **Fixed:** `render/src/graph-model.ts` — `EDGE_COLOR` only. Assertion takes
  the violet hue both READMEs and the demo caption already promised
  (`#a276ee` dark, `#7c4ae0` light). That does not collide with the categorical
  node-kind scale, because kind hue is a **ring** around a disc and edge ink is
  a **line** — different marks, and only one edge class is chromatic.
  `EDGE_COLOR` feeds `edgeDisplayAttrs`, which is the single writer of edge
  `color` for both `buildGraph` and `patchGraph`, so there was one place to fix
  and no sibling caller left behind.

  The greyscale floor then caught a second, deeper crowding: hue must not be
  the **only** separator, or a reader with no colour vision loses the grammar
  entirely — and the dark ramp had no room for a third luminance step. Evidence
  to traversal spanned 2.53:1; two 1.6:1 steps need 2.56:1. So the dark ramp
  widened to 3.63:1 (`#c2cad1` / `#5b646d`) to make the room. Light already had
  it and only assertion moved. Three hex values changed in total.

- **Re-proved:** `promotion/evidence/edge-grammar/after/` — verdict PASS, exit
  0, **6/6 pairs distinguishable**, worst pair now 21.83 CIEDE2000 and 1.78:1
  greyscale. `assertion-chain-dark.png` is the same frame as the before shot —
  identical node positions, because seeding is deterministic — with violet
  assertion edges. 0 console errors. Producer:
  `promotion/scripts/prove-edge-grammar.mjs`, which drives the rendered demo in
  headless Chromium and reads the ink out of the demo's own `dist/index.js`
  **in the page**, through the same `buildGraph` call `NodeGraph.tsx` makes on
  mount. It spawns and kills its own server on its own port, so it cannot
  repeat the baseline's near-miss of grading an orphaned stranger process.

- **Tests:** `cd render && npm test` → **11 passed, 0 failed** (was 7; the four
  new ones are `render/tests/edge-grammar.test.mjs`). Root `npm test` 14
  passed, root `npm run typecheck` 0, root `npm run build` 0, `cd render &&
  npm run typecheck` 0.

  **The regression check was confirmed to fail before the fix**, not assumed:
  `git stash push render/src/graph-model.ts` → `npm test` → `not ok 2 - no two
  trust classes are confusable in dark` and `not ok 3 - … in light`, 9 pass 2
  fail → `git stash pop` → 11 pass. If the ink regresses, those two tests fail
  in `npm test` before anything is served.

  `cd render && npm run verify:demo` still exits 1 with the identical
  `{"liveButton":false}` signature as the baseline — that is D1, untouched and
  still open.

- **Conditions newly PASS:** 12. Condition 2 stays FAIL (six major defects
  remain open); condition 11 stays FAIL (D1).

- **Noted, not fixed** (one defect per iteration): no scenario in the gallery
  emits all three edge classes at once, so the drawing cannot show the whole
  grammar in a single frame, and the demo page is dark-only so the light
  palette is measured but never photographed. Neither blocks D3 — the
  three-way comparison is in `edge-grammar.json` — but a gallery that cannot
  display its own headline rule in one picture is worth a future iteration.

---

## Wave 3 — 2026-08-13 — human-readiness (a second, separate loop)

Wave 3 does not ask "can a stranger use this product"; it asks **"can a stranger
maintain it"**. Gate:
<https://github.com/HomenShum/NodeKit/blob/main/templates/promotion/HUMAN_READY.md>.

Full before/after measurements, every evidence command, and the findings left
unresolved with their reasons: **[`docs/SIMPLIFICATION_REPORT.md`](../docs/SIMPLIFICATION_REPORT.md)**.
The runtime-order walkthrough is [`docs/START_HERE.md`](../docs/START_HERE.md);
the same walks are clickable in [`.tours/`](../.tours).

- **Deleted:** `scripts/build.mjs` (a 40-line ESM specifier rewriter that
  `tsc` plus explicit `.js` specifiers already do — the convention `render/`
  used all along), `render/scripts/clean.mjs`, three public
  `JSON.stringify` wrappers, a duplicate default export, and the
  `@vitejs/plugin-react` devDependency that no vite config ever wired in.
- **Closed from the ledger above:** D1, D2, D4. D1's fix uncovered three further
  defects in the same gate — a decay sample timed into a still-streaming
  scenario (reading 87,317 lit pixels and calling it failure), a canvas-clear
  race that made a single pixel sample read 0 one run in five, and an `EBUSY`
  in cleanup that turned an already-printed PASS into exit 1 on Windows. All
  three are fixed and the reasoning is in the comments at the failure site.
- **Still open:** D5, D6, D7. Each is feature work, not structural cleanup, and
  wave 3's rules forbid mixing the two. D7 (the graph is unreachable by
  keyboard, and the node readout is where the trust grammar is disclosed) is the
  highest-impact item left in this repository.
- **Tests:** root `npm test` 14 passed, `cd render && npm test` 11 passed, both
  typechecks 0, `npm run build` 0, `npm run docs:check` 0,
  `npm run proof:edge-grammar` PASS 6/6 pairs, `cd render && npm run
  verify:demo` **exit 0 on six consecutive runs** (was exit 1 at baseline).
