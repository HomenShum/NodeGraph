# Product goal — NodeGraph

## Who opens this, and what they are trying to finish

Someone is building a screen where an assistant works in the background — looking
things up, following leads, adding to a picture of what it found — and the picture
keeps growing while the person watches. The problem they arrived with is that every
line in that picture looks equally true. A number the assistant actually went and
counted, a claim it copied out of a published reference, and a step it merely
happened to walk through all get drawn as the same line, so the reader ends up
believing things nobody ever checked. They want a drawing surface that refuses to
flatten those three into one look, and they want to hand it a stream of findings and
have it stay honest without them policing every frame. What they walk away holding is
a running page: a graph that fills in as findings arrive, where a thick line means a
real measured count, a badged line means someone else's published claim with the
release it came from, a faint line means "we passed through here" and nothing more,
and clicking any point tells them which of the three they are looking at — including
the difference between "measured, and the answer was zero" and "nobody measured this"
(the trust grammar). Motion happens only while something is genuinely arriving, and
where a node sits on screen means nothing at all.

## The gate

This repo is judged by the twelve-condition PROMOTION gate, which lives in one
place and is not restated here:

**https://github.com/HomenShum/NodeKit/blob/main/templates/promotion/GATE.md**

Gate variant: `reduced` <!-- reduced = library/CLI judged on its demo
surface and quickstart; see the GATE's reduced-gate section -->

Scoring vocabulary is PASS / FAIL / **UNVERIFIED**, and UNVERIFIED is never PASS.

## Canonical journeys

The work queue lives in [PRODUCT_JOURNEYS.md](PRODUCT_JOURNEYS.md). A journey
without browser evidence is unfinished, however green the tests are.

## Loop state

Every iteration is recorded in [PROMOTION_LOG.md](PROMOTION_LOG.md) — journey
exercised, defect fixed, evidence path, conditions newly passing. Loop state
lives in git, never in an agent's memory, so any agent can resume the loop cold.

## Current scorecard

Baseline measured 2026-08-13 against commit `75876ea`, on a fresh clone, in
headless Chrome 1280x900 driven over CDP. Raw observations:
`promotion/evidence/baseline/report*.json`; screenshots in the same directory.

**Iteration 2 (2026-08-13) re-measured every row**, so no reading below is
inherited from an earlier wave. Three new producers, each committed with the
artifact it writes:

| Producer | Command | Artifact | Owns |
|---|---|---|---|
| `promotion/scripts/audit-web-quality.mjs` | `npm run audit:web-quality` | `promotion/evidence/web-quality/` | conditions 8, 9, 10 |
| `promotion/scripts/review-wig.mjs` | `npm run review:wig` | `promotion/evidence/wig/` | conditions 3, 4, 5, 6, 7 |
| `promotion/scripts/prove-mcp-viewer.mjs` | `npm run proof:mcp-viewer` | `promotion/evidence/mcp-viewer/` | condition 1 (journey J5) |

They are separate on purpose. A Lighthouse score is not a Web Interface
Guidelines review; the tools measure different things and neither is allowed
to stand in for the other's row.

| # | Condition | Status | Evidence / reason |
|---|-----------|--------|-------------------|
| 1 | Journeys succeed end-to-end in a real browser | PASS | All five now drive. J1, J2, J3 at baseline (`01-desktop-default.png`, `18-unknown-readout.png`, `09-selection-readout.png`, `20-drag-after.png`); J4 from `npm run example:compose` in wave 3 (`promotion/evidence/wave3/`). **Iteration 2 drove J5's browser half, the last one outstanding** — and found why nobody had: `/mcp/viewer/`, the URL both this repo's journey and its MCP README tell the reader to open, returned **404**, because `serve-demo.mjs` mapped only `/` to an index file. Fixed there. The journey now proves itself end to end: 6 accepted events in the log, **0 refused claims in it**, the viewer replaying all 6 (`6 accepted events replayed · 8 entities · 11 edges`), the receipt visible in the readout, 0 console errors. `promotion/evidence/mcp-viewer/` — producer `npm run proof:mcp-viewer`. |
| 2 | No critical or major usability defect open | PASS | The ledger in [PROMOTION_LOG.md](PROMOTION_LOG.md) has **no open major row**. D3 closed in iteration 1; D1, D2, D4 in wave 3; **D5, D6, D7 and two defects found while measuring — a stale-selection crash and the 404 on the viewer URL — in iteration 2**, each with a re-runnable proof. Two **minor** findings stay open and are named with what closing them costs: hub labels truncated at the right frame edge below 520px (47px of ink, `wig-review.json` → `label-truncation-mobile`), and no scenario or filter state in the URL (`→ deep-link-state`). |
| 3 | Mobile and desktop both intentional | PASS | Not the same view scaled. Below 520px the **label budget changes** (`labelThreshold(order, stageWidth)` — hubs only, instead of all 142 names smeared across a 322px canvas) and the camera frames **30% wider**, because Sigma draws a label beside its node and label width does not shrink with the stage. Measured at 390x823: ink in the outermost 3px ring of the label canvas is **0 top, 0 bottom, 0 left** (baseline: the constellation ran off the stage), and the stage is clamped to `70vh` rather than a flat 620px on an 844px phone. `promotion/evidence/wig/responsive-390.png`, `responsive-768.png`, `desktop-1440.png`; `wig-review.json` → `graph-fits-mobile`. |
| 4 | No horizontal overflow at supported widths | PASS | `documentElement.scrollWidth - innerWidth` = **0 at 320, 360, 390, 414, 768, 1024, 1280, 1440 and 2560** — `wig-review.json` → `no-horizontal-overflow`. Re-measured 2026-08-13 through a committed producer; the baseline reached the same answer with a probe that no longer exists. |
| 5 | Loading/empty/success/error/agent-running designed | PASS | All five, each observable. **Loading**: the served HTML carries “Loading the renderer…” inside the stage, because the import map fetches React and Sigma from esm.sh and there is a real second before first render (read from the raw document, since React clears it on mount). **Empty**: “Select an entity — click it, or focus the graph and press the arrow keys — …”. **Success**: the readout, opened by mouse or keyboard. **Dense**: `142 entities · 145 of 145 relationships shown`. **Error**: a new **Refused batch** scenario sends an assertion with an empty release; the session refuses the whole batch and the renderer says so in `role="alert"` — “Batch refused, nothing drawn: receipt.release must be a non-empty string. The graph still shows the last accepted state.” `promotion/evidence/wig/state-error.png`; `wig-review.json` → `states-designed`. |
| 6 | Keyboard and basic accessibility pass | PASS | The graph is reachable and operable without a mouse: 14 Tab presses land on the stage (`role="application"`, `tabIndex=0`, an aria-label that states the key map), ArrowRight opens the readout through the **same `emitNode` a mouse click calls**, Escape clears it. A polite `aria-live` region is mounted from the start rather than inserted at announce time. **axe-core 4.13.0: 0 violations, 29 rules passing. Lighthouse accessibility 1.00 on mobile and desktop** (was 0.88). Smallest hit target 24px; every control has an accessible name. `promotion/evidence/wig/keyboard-focus-ring.png`, `keyboard-selection.png`; `promotion/evidence/web-quality/axe.json`. |
| 7 | Web Interface Guidelines: no major unresolved | PASS | **A review, not a tool score.** 23 guidelines from <https://vercel.com/design/guidelines> (fetched 2026-08-13) checked against the rendered surface, each with the DOM measurement that decided it: **20 pass, 0 major, 2 minor**. Five guideline families are recorded as not applicable *with reasons* (no form, no webfont, no images, no modal or drawer, no locale formatting), so the coverage is auditable rather than implied. Three conflicts with this repo's trust grammar are recorded in `invariantConflicts` and resolved in the grammar's favour — most sharply “optimistic updates”, refused outright, because an optimistically drawn edge is an unconfirmed claim wearing confirmed ink. `promotion/evidence/wig/wig-review.json` plus seven screenshots — producer `npm run review:wig`. |
| 8 | Web-quality audit: no major unresolved | PASS | Two engines, both committed with the commands that produced them. **axe-core 4.13.0: 0 violations** (was 2 — `color-contrast` serious on the counter, `heading-order` moderate). **Lighthouse 13.4.1: accessibility 1.00, best-practices 1.00, SEO 1.00 on both form factors** (was 0.88 / 0.96 / 0.90). Core Web Vitals: desktop LCP 406ms, CLS 0.0002, TBT 5ms, performance **1.00**; mobile LCP 1059ms, CLS **0.0004** (was 0.083), TBT 802ms, performance 0.81. Zero browser console errors, zero non-2xx HTTP requests. Reported and not resolved: mobile performance sits below 0.9 — 142 entities force-laid-out on a 4x-throttled phone — and Lighthouse scores move a few points run to run on a loaded machine, so read the committed report as one honest sample. `promotion/evidence/web-quality/` — producer `npm run audit:web-quality`. |
| 9 | No unexplained console errors or failed requests | PASS | **0 console errors** in both Lighthouse profiles and across the whole WIG review session, and **0 non-2xx HTTP requests**. The baseline's two explained non-200s are gone rather than excused: the favicon 404 is now an inline SVG mark, and the aborted document was an artifact of the old capture harness. One thing that looks alarming in a raw report and is not: ~48 `blob:` URLs recorded with status -1 are the force-layout's Web Worker, respawned once per ingestion batch and never touching the network. Counted separately in `web-quality.json` → `lighthouse.*.network`. |
| 10 | Performance does not obstruct interaction | PASS | The measurement the baseline said was missing, on the case it named. Dense constellation, 142 entities, 412x823: **worst key-to-readout 30ms unthrottled, 104ms at 4x CPU throttle** — against Core Web Vitals' INP “good” threshold of 200ms, an external bar rather than one chosen after seeing the number. The field reaches its still steady state at 9s throttled and books **zero long tasks in a 3s idle window** after it, which is this product's own claim about stillness measured rather than asserted. `web-quality.json` → `interaction`. The first cut of this measurement sampled at a fixed 10s and read 27 long tasks; that was the cinematic window stretched by the throttle, not a busy steady state, and a fixed sleep would have shipped a false defect. |
| 11 | Tests and build green | PASS | Root `npm test` 14 passed, render `npm test` 11 passed, `npm run docs:check` ok (34 tour steps and 39 citations, each matched against the line's content), both typechecks 0, `npm run build` 0, `npm run verify:demo` exit 0, `npm run proof:edge-grammar` 6/6 pairs, `npm run proof:mcp-viewer` exit 0, `npm run audit:web-quality` exit 0, `npm run review:wig` exit 0. Re-measured 2026-08-13 after iteration 2. |
| 12 | Verified in the rendered app, not inferred from code | PASS | Every claim above came from driving the running page. Two defects in this iteration exist only because something was driven rather than read: the stale-selection crash surfaced as a `NotFoundGraphError` in the WIG review's console capture when a scenario changed with a node still selected, and the `/mcp/viewer/` 404 surfaced the first time anything opened that URL. Neither had a failing test. Every producer spawns its own server on its own port and waits for its own child's listening line, so none of them can grade a stranger's process. |

**Status: PROMOTED** — 12/12 PASS, re-measured 2026-08-13 (iteration 2). Every row
names a committed artifact and a committed producer; running the three commands
in the table above regenerates all of them. Two minor findings remain open and
are listed in the defect ledger: hub labels truncated at the right frame edge
below 520px, and no scenario or filter state in the URL. Neither is major, and
neither is being called fixed.
