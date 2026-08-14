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

A **fixed** row describes a tree that no longer exists, so it cites files
without line numbers: the line that held the defect has since moved, and a
pointer nobody can check is worse than no pointer. Live pointers are written
as a backticked symbol followed by a backticked `path:line`, and
`npm run docs:check` asserts the cited line contains that symbol.

| # | Severity | Journey | Reproduction | Status |
|---|----------|---------|--------------|--------|
| D1 | major | J1 | Fresh clone → `cd render && npm install && npm run verify:demo` → **exit 1**, `demo proof failed: {…"liveButton":false…}`. `render/scripts/probe-demo.mjs` asserts the demo HTML contains the string `Add another live branch`; that string exists nowhere under `render/demo/`. The gate's second half would fail too: `render/scripts/browser-demo-gate.mjs` clicks `#add-branch`, and `grep -rn "add-branch" demo/ src/` returns nothing. The repo's own rendered-demo gate is stale relative to the ten-scenario gallery that replaced the single-branch demo. | **fixed, wave 3** — `verify:demo` exits 0 on 6/6 consecutive runs; see `docs/SIMPLIFICATION_REPORT.md`. |
| D2 | major | J1 | `render/README.md` told a first-time reader twice ("then press **Add another live branch**") to press a control that does not exist. Rendered at 1280x900, the page offers ten scenario chips and no such button; `document.body.innerText.includes('Add another live branch')` is `false` in all seven captured states (`report.json` → every step's `addBranchText`). The first instruction a stranger follows after the app starts is wrong. | **fixed, wave 3** — both passages now describe the ten scenario chips that exist. |
| D3 | major | J2 | Press **Assertion chain** at 1280x900. The caption under the stage reads "violet assertion edges, each carrying a full replay receipt" (`render/demo/demo.js`) and `render/README.md` said "A violet `assertion` edge". Nothing violet is drawn: `render/src/graph-model.ts` set `assertion: { dark: "#727b83" }` against `traversal: { dark: "#616a72" }` and `evidence: { dark: "#a8b1b9" }` — two near-identical greys about 1.3:1 apart. See `09-selection-readout.png`: the only thing separating a curated claim from interaction history in the drawing is the small `v97` label. The repo's binding rule is that these three classes never look alike, and the docs describe a colour channel the renderer does not implement. | **fixed, iteration 1** — measured at 6.70 CIEDE2000 dark / 9.44 light, now 22.37 / 26.47. `promotion/evidence/edge-grammar/` |
| D4 | major | J4 | The root README presents `examples/compose` as the proof that the two layers are one product, with a screenshot. There is no command to run it: no script in either `package.json`, no mention in "Development" or "Example App", and `examples/compose/compose.js` imports `../../dist/semanticGraph.js` and `../../render/dist/index.js`, so it also silently requires both layers to be built. It renders correctly once served — "model: 54 nodes, 102 edges, 6 backed facts · rendered: 46 entities, 94 relationships (all traversal …)", 0 console errors (`13-compose.png`) — but only from a static server written by hand for this capture. | **fixed, wave 3** — `npm run example:compose` builds both layers and serves it; re-proved in headless Chromium, 0 console errors, `promotion/evidence/wave3/`. |
| D5 | major | J1 | **fixed, iteration 2.** At 390x844 (`07-mobile-390.png`) the page itself is fine — chips wrap, 0 px horizontal overflow — but the graph is only shrunk, never fitted: the camera keeps its desktop framing, so "intervention h…" and "biomarker hub…" are clipped at the canvas edge and roughly half the constellation sits outside the visible stage. `render/demo/index.html` also pins `#root { min-height: 620px }`, so the canvas stays taller than most of a phone screen. A `fit` control exists but the reader has to know to press it. **Root cause: the camera was fitted once, ~1.3s after mount, and never again — a stream that keeps arriving grows straight out of frame, which is invisible at 1440 and clips half the field at 390. Refit now runs after every ingestion settle and on resize, unless the reader has aimed the camera themselves; below 520px the label budget drops to hubs and the frame opens 30% wider.** Re-proved: ring ink at 390 is 0 top / 0 bottom / 0 left (was a field running off the stage), `promotion/evidence/wig/wig-review.json` → `graph-fits-mobile`, `responsive-390.png`. | **fixed, iteration 2** — label truncation at the right edge survives as minor D8. |
| D6 | minor | J1 | **fixed, iteration 2.** The live counter under the stage ("142 entities · 145 edges", `#stats`) is `rgb(85,96,106)` on `#0b0e12` — measured 3.01:1, below the 4.5:1 AA minimum for body text (`report6.json` → `contrast`). It is the one text element on the page that fails; the other 19 measured pass. **Now `#8b949d`, 6.29:1 — the same ink as the page's own subtitle, because wave 3b put the eviction disclosure on this line and it stopped being decoration. The identical value on the MCP viewer's `#log` was fixed with it.** axe-core reports 0 `color-contrast` violations. | **fixed, iteration 2** |
| D7 | major | J2 | **fixed, iteration 2.** A keyboard-only reader can reach every scenario chip (Tab, visible ring, Enter activates — `05-keyboard-focus.png`) but can never open a node, and the node readout is where "measured 0" vs "unknown", and the Reactome receipt, are disclosed. Measured on the rendered page: 8 `<canvas>` elements, 0 with a `role` or `aria-label`; `[data-testid="nodegraph-canvas"]` has no `tabindex`; 0 `aria-live` regions on a surface whose content streams in while the reader watches (`report6.json` → `basics`). | open |
| D8 | minor | J1 | Below 520px, Sigma draws a node's label to the RIGHT of the node, and the hub names beside nodes near the frame are cut mid-word by the canvas. Measured at 390x823: 47 pixels of label ink in the outermost 3px ring, all of it on the right edge (`promotion/evidence/wig/wig-review.json` -> `label-truncation-mobile`). Reduced from the baseline's clipped field, not eliminated. Closing it needs a custom Sigma `labelRenderer` that measures text before drawing. | open |
| D9 | minor | J1 | Which of the eleven scenarios is open, and which edge types are filtered on, live only in React state. A reader cannot send a colleague the frame they are looking at, and Back does not undo a chip press (`wig-review.json` -> `deep-link-state`: `location.href` unchanged across a scenario switch). Minor on a self-describing gallery; it would be major on a product surface. | open |
| D10 | major | J2 | **fixed, iteration 2, found by driving.** Switch scenarios with a node still selected and the whole component dies: the selection panel read `graph.getNodeAttribute(selected.id, "visits")` from the LIVE graph during render, and a scenario change removes that node, so React threw `NotFoundGraphError: Graph.getNodeAttribute: could not find the "[\"condition\",\"condition hub 1\"]" node` out of render with no boundary above it and the reader got a blank page. Surfaced in the WIG review's console capture; no test failed. Fixed in two places for two reasons: `visits` now travels in the click message, so the readout describes the entity AS CLICKED rather than reaching into a graph that has moved on; and the selection is dropped when its node leaves the graph, because a readout that outlives its entity is a claim about something the graph no longer holds. Re-proved: `consoleErrorsDuringReview: []`. | **fixed, iteration 2** |
| D11 | major | J5 | **fixed, iteration 2, found by driving.** `GET /mcp/viewer/` returned **404** — the URL `PRODUCT_JOURNEYS.md` J5 and `render/mcp/README` both tell the reader to open. `serve-demo.mjs` mapped only `/` to an index file, so any directory URL resolved to a directory, failed the is-a-file check and 404'd. This is why J5's browser half had never been driven in three waves: nobody who followed the instructions ever saw the page. Fixed in the one place that maps URLs to files; the path-traversal refusal above it is untouched. Re-proved: `npm run proof:mcp-viewer` exit 0, `promotion/evidence/mcp-viewer/`. | **fixed, iteration 2** |

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

- **Root cause** — `render/src/graph-model.ts`, and it was written down
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

---

## Wave 3b — 2026-08-13 — what a second cold reader found

An independent engineer was handed only this repository, ran it, and traced the
nine steps of `docs/START_HERE.md`. They got through it — and reported three
things the repo was telling itself that were not true.

- **Root `npm test` reads like the whole suite and is half of it.** 14 vitest
  cases, exit 0, and not one line of `render/src/session.ts`,
  `render/src/graph-model.ts`, `render/src/NodeGraph.tsx` or
  `render/mcp/server.mjs` executes — the running product, and five of the nine
  steps. `docs/codebase/TESTING.md` even said "there is no single `test` command
  covering both packages", which documents the trap instead of removing it.
  **Fixed:** root `npm run test:all` = `vitest run && npm --prefix render test
  && npm run docs:check`. Measured just now: **14 + 11 passed, docs 0, exit 0**.

- **The doc-pointer guard proved anchor stability, never anchor correctness.**
  `scripts/check-docs.mjs` only asked whether the cited line number was inside
  the file, so a twenty-line drift in a six-hundred-line file passed silently,
  and its citation regex skipped any path without a `/` — which is why the
  bare `graph-model.ts` pointers in `START_HERE.md` were never checked at all. **Fixed:**
  every `.tours` step now carries CodeTour's own `pattern` and must *first*-match
  at the cited line (so the check and the tour open the same line), and every
  markdown citation is written as a backticked symbol before a backticked
  `path:line`, with the guard asserting the line contains that symbol. Coverage
  went from "34 tour steps exist" to **34 tour steps and 38 citations, each
  matched against the line's content**.

  Proved by breaking it on purpose: moved tour step 5 twenty lines down its file, and pointed the
  `requireEdgeType` citation at the `requireAssertionReceipt` line — right
  file, wrong symbol. **Old guard: `docs
  ok`, exit 0. New guard: exit 1, naming both.** Restored, exit 0. It then caught
  four more real drifts introduced by this wave's own edits before they shipped.

- **`session.stats()` had no caller on any user surface.** It is the only thing
  that reports the *limits* beside the sizes, and it was reachable only from
  tests: a store that evicts without saying so is indistinguishable from data
  loss, to a reader and to an agent. **Fixed:** the readout under the stage now
  reads it. Measured in headless Chrome on the rendered page: dense scenario
  `142 entities · 145 edges · bounded at 400/900`; **Bounded memory** scenario
  `60 entities · 50 edges · bounded at 60/140 — at capacity, oldest-inserted
  evicted first` (`evidence/wave3b/bounded-memory-readout.png`, 0 console
  errors). `browser-demo-gate.mjs` now asserts `boundsDisclosed`; reverting the
  readout to the snapshot-only version fails it (`"boundsDisclosed":false`).

  Note this lands on the one element D6 flags at 3.01:1 contrast, so D6 now
  hides a bigger claim than a counter. It stays open.

- **Found while verifying the above, and fixed:** the near-miss recorded at
  baseline was still live. Port 4173 was held by an 11-hour-old
  `serve-demo.mjs` from another session; both gates spawned their own server,
  waited for *the port* to answer, and would have graded the stranger. They now
  wait for **their own child's listening line** and exit non-zero naming the
  port, and both honour `NODEGRAPH_DEMO_PORT` (which `serve-demo.mjs` already
  read). Proved against the real squatter: `node scripts/probe-demo.mjs` and
  `scripts/browser-demo-gate.mjs` on 4173 both **throw**; on 4608 the full
  `verify:demo` returns
  `{"boundsDisclosed":true,"denseLive":123471,"initialLive":9630,"expandedLive":6885,"initialDecay":0,"replayLive":6872,"replayDecay":0,"browserErrors":0}`.

- **Tests:** `npm run test:all` exit 0 (14 vitest + 11 node:test + docs 34
  steps/38 citations), root and render `npm run typecheck` exit 0,
  `NODEGRAPH_DEMO_PORT=4608 npm run verify:demo` exit 0.

---

### Iteration 2 — 2026-08-13 — the two audits that were never run, and what running them found

- **Journeys exercised:** J1 (the gallery at 320–2560px), J2 (the readout, by
  keyboard this time), J5 (the MCP rail's browser half — never driven before).

- **Why this iteration exists.** Conditions 7 and 8 had been UNVERIFIED since
  the baseline, with an honest reason: no Web Interface Guidelines review and
  no axe or Lighthouse run had happened. The scorecard even said that one
  hand-measured contrast check "is not the audit this condition names". Both
  toolchains are installable here now, so both were run — and, because the gate
  requires an artifact AND its producer, both were run **by scripts that live in
  this repo** rather than by hand.

- **The producers, all three committed and re-runnable from a clean clone:**

  | Command | Writes | Exits non-zero when |
  |---|---|---|
  | `npm run audit:web-quality` | `promotion/evidence/web-quality/` | any axe serious/critical violation, or Lighthouse accessibility < 0.90 |
  | `npm run review:wig` | `promotion/evidence/wig/` | any guideline whose `severityIfFailed` is major |
  | `npm run proof:mcp-viewer` | `promotion/evidence/mcp-viewer/` | the refused claim reaches the log, or the viewer replays fewer events than the log holds |

  Each spawns its own demo server on its own port and waits for **its own
  child's listening line**, so none of them can repeat the baseline's near-miss
  of grading an orphaned stranger process.

- **What the audits found on the tree as it stood** (all fixed below):
  axe-core 2 violations — `color-contrast` (serious) on the counter under the
  stage, `heading-order` (moderate) on the component's own `h3`; Lighthouse
  mobile accessibility 0.88, best-practices 0.96, SEO 0.90, one browser console
  error (a 404 favicon), mobile CLS 0.083 and TBT 5083ms; the graph unreachable
  by keyboard; no error state anywhere; and the graph clipped at 390px.

- **Fixed, and why each fix is where it is:**

  - **The stage grew with the node count.** `height: Math.min(height, 260 + n * 22)`
    sizes the stage from data — on a surface whose premise is that nodes stream
    in, that is a box that resizes under the reader on every batch. Deleted; the
    prop is now honoured flat.

    **Careful with the numbers here, because it is easy to pair two that do not
    belong together.** This fix, the chips fix and the header fix all attack
    layout shift, and they are not separable in the final report. What was
    measured: Lighthouse mobile CLS **0.083 before this iteration, 0.0004
    after**, and mobile TBT **5083ms before, 802ms after** — but across all of
    this iteration's changes, not this bullet alone. Separately, an in-repo
    `PerformanceObserver` harness at 412x823 under 4x CPU throttle attributed
    **0.119** of a 0.2015 total to the chips arriving late and **0.083** to the
    header wrapping, and read **0.0008** once all three were fixed. Those
    attribution numbers come from an intermediate tree, not the pristine one, so
    they explain WHERE the shift came from and must not be quoted as a
    before/after pair with the Lighthouse figures.
  - **The chips were markup that JS was building.** They now live in
    `render/demo/index.html` and `demo.js` refuses to bind if the two lists have
    drifted. A crawler and a reader both see the eleven scenarios before any
    script runs.
  - **The header wrapped mid-ingestion.** `"0 entities · 0 of 0"` fits beside the
    title and `"142 entities · 145 of 145"` does not; the wrap moved everything
    below it by 20px. Stacked — five style properties deleted, one height at
    every width.
  - **D7, the keyboard.** See the ledger. One selection path, two inputs.
  - **D5, the mobile framing.** See the ledger. Refit after every settle, and a
    width-aware label budget.
  - **D6, the contrast.** One token, in two files.
  - **The error state did not exist.** `NodeGraph` gained an `error` prop and an
    internal catch around `patchGraph` — which throws by contract, and threw out
    of a render effect with no boundary above it. A new **Refused batch**
    scenario reaches the state from the UI: an assertion with an empty release,
    refused whole, said in words under the stage.
  - **The loading state did not exist either.** The page pulls React and Sigma
    from esm.sh, so there is a real second of blank reserved box. It now says
    "Loading the renderer…", and React clears it on mount.
  - **D10 and D11**, both found only because something was driven. See the ledger.

- **Re-proved, after the change, in the rendered app:**
  axe-core **0 violations** (29 rules passing); Lighthouse accessibility,
  best-practices and SEO **1.00 on both form factors**, desktop performance
  **0.99**, mobile 0.79; mobile CLS 0.0004, desktop CLS 0.0002; **0 console
  errors, 0 non-2xx HTTP requests**; WIG review **20 of 23 pass, 0 major, 2
  minor**; interaction latency worst **17ms unthrottled / 118ms at 4x throttle**
  with **zero long tasks in a 3s idle window** after the field settles; J5
  driven end to end.

  Every number in that sentence is read out of the committed
  `promotion/evidence/web-quality/web-quality.json` and `wig/wig-review.json`,
  not from an earlier run. Lighthouse performance is the one that moves: five
  consecutive runs of this same tree scored mobile between 0.68 and 0.85 and
  desktop between 0.80 and 1.00 depending on what else the machine was doing.
  The accessibility, best-practices and SEO scores and the axe result did not
  move at all.

- **Tests:** root `npm test` 14 passed, render `npm test` 11 passed,
  `npm run docs:check` ok (34 tour steps, 39 citations — it caught nine anchors
  this iteration's own edits had moved, including one that pointed at a comment
  instead of the symbol it named), both typechecks 0, `npm run build` 0,
  `npm run verify:demo` exit 0, `npm run proof:edge-grammar` 6/6 pairs,
  `npm run proof:mcp-viewer` exit 0.

- **Conditions newly PASS:** 1, 2, 3, 5, 6, 7, 8, 9, 10. Conditions 4, 11 and 12
  were already PASS and were re-measured rather than inherited. **12/12.**

- **Two things done in the open, because a reader should be suspicious of both.**
  First, the `graph-fits-mobile` check originally scored the SUM of ink in all
  four edges of the label-canvas ring and read FINDING at 37px; it was split
  after seeing that every pixel was on the right edge, which is label truncation
  rather than a field overflowing its stage. The framing half passes; the
  truncation half is now its own open minor row, and the split is recorded in
  the check's own `note`. Second, the interaction measurement's first cut
  sampled long tasks at a fixed 10s and reported 27 of them — which looked like
  "the steady state is not still", the opposite of this product's headline
  claim. It was the cinematic window and the FA2 settle, both stretched by the
  4x throttle, and both finished by ~14s. The fixed sleep was replaced with a
  measured time-to-still. **A fixed sleep would have shipped a false defect
  against this repo's central claim.**

- **Noted, not fixed** (one iteration, one theme): the force-layout worker is
  respawned once per ingestion batch — about 48 blob workers per load of the
  dense scenario. It is not a leak (each is terminated) and not a failed
  request, but it is most of what mobile TBT is made of, and it is the obvious
  next place to look if mobile performance is ever worth chasing above 0.8.
