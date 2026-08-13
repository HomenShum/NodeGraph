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

| # | Condition | Status | Evidence / reason |
|---|-----------|--------|-------------------|
| 1 | Journeys succeed end-to-end in a real browser | FAIL | J1, J2, J3 drove clean (`01-desktop-default.png`, `18-unknown-readout.png`, `09-selection-readout.png`, `20-drag-after.png`). J4 has no run command anywhere in the repo — `examples/compose/` is a headline README proof with no script in either package.json; it only rendered after I hand-wrote a static server. J5's browser half (`mcp/viewer/`) was not driven. |
| 2 | No critical or major usability defect open | FAIL | 7 defects with reproductions in [PROMOTION_LOG.md](PROMOTION_LOG.md); D1 (`npm run verify:demo` exits 1 on a fresh clone) and D2 (both READMEs tell the reader to press a control that no longer exists) are major. |
| 3 | Mobile and desktop both intentional | FAIL | Layout is fluid and page overflow is 0 at 390 (`07-mobile-390.png`), but the graph camera never fits to the viewport: at 390x844 the constellation renders at desktop scale, node labels are clipped at the canvas edge, and the stage keeps `min-height: 620px` (`render/demo/index.html`). The graph surface is not adapted, only shrunk. |
| 4 | No horizontal overflow at supported widths | PASS | `documentElement.scrollWidth - innerWidth` measured 0 at 360, 390, 414, 768, 1024, 1280, 1440 — `report.json` -> `overflow[]`. |
| 5 | Loading/empty/success/error/agent-running designed | FAIL | Success and agent-running are designed (ingestion flare, then stillness — lit overlay pixels 129,273 mid-window, exactly 0 after decay, `report.json`). Loading and empty are not: before the first ingestion the stage is a blank dotted grid reading "0 entities · 0 edges" with no copy (`report4.json` -> `dragStatsBefore`). No error state exists at all — zero matches for `error`/`catch` in `render/src/NodeGraph.tsx` and `render/demo/demo.js`, so a rejected batch has nowhere to surface. |
| 6 | Keyboard and basic accessibility pass | FAIL | Controls pass: Tab reaches all ten scenario buttons with a visible focus ring, Enter activates ("Rapid fire" became active, 16 entities — `report2.json` -> `keyboardActivation`, `05-keyboard-focus.png`). The graph does not: all 8 canvases carry no `role` or `aria-label`, the canvas is not tabbable, there are 0 `aria-live` regions on a surface that streams in live, and node selection — the receipt readout, the product's whole point — is reachable only by mouse (`report6.json` -> `basics`). |
| 7 | Web Interface Guidelines: no major unresolved | UNVERIFIED | Review not run. No Web Interface Guidelines pass was performed against this surface in this wave. |
| 8 | Web-quality audit: no major unresolved | UNVERIFIED | No axe or Lighthouse run. One hand-measured check did fail (`#stats` text 3.01:1 against its background, AA needs 4.5:1 — `report6.json` -> `contrast`), logged as D6, but a single check is not the audit this condition names. |
| 9 | No unexplained console errors or failed requests | PASS | 0 console errors and 0 exceptions across the desktop journey over 127 responses (`report.json` -> `consoleErrors`, `requestCount`). Both non-200s are explained and named: `GET /favicon.ico` 404 (the demo's static server serves no favicon) and one `net::ERR_ABORTED` on a Document that my own `Page.navigate` cancelled mid-load. |
| 10 | Performance does not obstruct interaction | UNVERIFIED | First contentful paint 656 ms, DOMContentLoaded 522 ms, 42 resources (`report6.json` -> `perf`), and interaction was observed working on the 6-node and 30-node scenarios. But no input-latency or frame measurement was taken during the 142-entity dense constellation, which is the case this condition exists to test. |
| 11 | Tests and build green | FAIL | Green: root `npm test` 14 passed (exit 0), root `npm run typecheck` (exit 0), root `npm run build` (exit 0), render `npm test` 7 passed (exit 0), render `npm run typecheck` (exit 0). Red: render `npm run verify:demo` **exit 1** — `demo proof failed: {"htmlStatus":200,"title":true,"liveButton":false,...}`. That command is listed in `render/README.md`'s own verification block. |
| 12 | Verified in the rendered app, not inferred from code | UNVERIFIED | This is the baseline wave. No improvement was made, so there is nothing to have verified. |

**Status: NOT PROMOTED** — 2/12 PASS.
