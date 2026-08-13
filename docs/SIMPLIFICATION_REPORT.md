# Simplification report

Wave 3, the human-readiness pass. Measured on a fresh
`git clone --depth 20` of `main` at commit `cf9f686`, Windows 11, Node 22.22.2.

Every row names the command that produces it. A row with no command is not a
measurement. The optimization target is **concepts removed** — dependencies,
public APIs, config knobs, indirections, files a reader must open — not raw line
count, and the line rows below show why that distinction matters here.

## The table

| Measure | Before | After | Change | Evidence command |
|---|---:|---:|---:|---|
| Production files (tracked source, excl. tests) | 42 | 41 | −1 | `git ls-files '*.ts' '*.tsx' '*.mjs' '*.js' \| grep -v '^tests/\|^render/tests/\|package-lock' \| wc -l` |
| Production source lines (same set) | 7,466 | 7,554 | **+88** | same list piped to `xargs wc -l \| tail -1` |
| Library source lines only (`src/` + `render/src/`) | 5,042 | 5,027 | −15 | `cat src/*.ts src/*.tsx render/src/* \| wc -l` |
| Direct dependencies (both packages, incl. peer) | 20 | 19 | −1 | `node -e "const a=require('./package.json'),b=require('./render/package.json');const c=o=>Object.keys(o\|\|{}).length;console.log(c(a.dependencies)+c(a.devDependencies)+c(a.peerDependencies)+c(b.dependencies)+c(b.devDependencies)+c(b.peerDependencies))"` |
| Installed package tree, model layer | 122 | 76 | **−46** | `rm -rf node_modules && npm install --no-audit --no-fund` |
| Public runtime exports, model layer | 36 | 33 | −3 | `npm run build && node -e "import('./dist/index.js').then(m=>console.log(Object.keys(m).length))"` |
| Unused files | 0 | 0 | 0 | `npx knip@5 --no-progress` |
| Unused exports | 2 | 0 | −2 | `npx knip@5 --no-progress` |
| Unused dependencies | 1 | 0 | −1 | `npx knip@5 --no-progress` |
| Duplicate exports | 1 | 0 | −1 | `npx knip@5 --no-progress` |
| Duplicate blocks | 0 | 0 | 0 | `npx jscpd@4 src render/src --reporters console --min-lines 5 --min-tokens 50` |
| Duplicate percentage | 0% | 0% | 0 | same |
| Circular dependencies | 0 | 0 | 0 | `npx dependency-cruiser@16 --no-config --output-type err-long src render/src examples tests render/tests` |
| Canonical workflow tests, model layer | 14 pass | 14 pass | 0 | `npm test` |
| Canonical workflow tests, view layer | 11 pass | 11 pass | 0 | `cd render && npm test` |
| Typecheck, both packages | exit 0 | exit 0 | 0 | `npm run typecheck`; `cd render && npm run typecheck` |
| **Browser workflow passes** | **exit 1** | **exit 0** | **fixed** | `cd render && npm run verify:demo` |
| Browser workflow, repeated | not run | 6/6 exit 0 | new | `for i in 1 2 3 4 5 6; do npm run verify:demo; echo $?; done` |
| Rendered-page edge-grammar proof | exit 0, 6/6 pairs | exit 0, 6/6 pairs | 0 | `npm run proof:edge-grammar` |
| MCP boundary demo | exit 0 | exit 0 | 0 | `cd render && node mcp/client-demo.mjs` |
| `examples/compose` runnable from a script | **no command existed** | `npm run example:compose` | fixed | see "compose" below |
| Production bundle (showcase, JS) | 492.45 kB / 152.43 kB gzip | 492.41 kB / 152.43 kB gzip | −0.04 kB | `npm run example:build` |
| Production bundle (showcase, CSS) | 26.05 kB | 26.05 kB | 0 | same |
| Doc pointers validated | no checker existed | 22 files, 34 tour steps, exit 0 | new | `npm run docs:check` |
| Additions / deletions | — | 55 files changed, 1845 insertions(+), 769 deletions(-) | — | `git diff --shortstat cf9f686 HEAD` |

### Read the line rows honestly

**Production source lines went UP by 88, and that is the correct outcome.**
45 lines of custom build machinery were deleted; roughly 130 lines were added to
the two browser-gate scripts, and almost all of it is comments recording the
measurements behind the fixes (why the pixel sample is taken five times, what the
stale assertion used to check, what EBUSY did to a passing run) plus the new
`scripts/check-docs.mjs`. Library source — the code a consumer actually ships —
fell by 15 lines.

The rows that carry the real result are *dependencies*, *public exports*,
*unused findings*, and *browser workflow passes*.

### On the knip numbers

`knip.json` was added in this pass. Without a config, knip has no entry points
for the second package or the examples and reports 20 "unused files" that are all
false — `render/src/index.ts`, the demo, every capture script. Both the before
and after rows above were produced with the same committed config, and the
"before" run was taken against unmodified source before any edit landed.

## What was deleted

| Deleted | Lines | Why it could go |
|---|---:|---|
| `scripts/build.mjs` | 40 | A custom post-build pass that rewrote every relative ESM specifier to add `.js`. TypeScript already does this when the source writes `.js` — and `render/`, in the same repository, already did exactly that. Replaced by `tsc -p tsconfig.json`. |
| `render/scripts/clean.mjs` | 5 | A file whose entire body was `rmSync(dist, {recursive, force})`. Now a one-line `prebuild` in both packages. |
| `neo4jUpsertPlanJson`, `neo4jSyncPlanJson`, `graphRelationshipReviewJson` | 12 | Three public API names, each a three-line `JSON.stringify(value, null, 2)` wrapper. Callers now call `JSON.stringify` directly. **`nodeGraphDocumentJson` was kept**: it validates through `parseNodeGraphDocument` first, so it is not the same function. |
| `export default NodeGraph` (+ its re-export) | 2 | The component had both a named and a default export, and nothing in the repo imported the default. One import form is one fewer decision. |
| `@vitejs/plugin-react` | 1 dependency | `examples/showcase` has no `vite.config`, so the plugin was never wired in. Vite's esbuild transform already reads `jsx: "react-jsx"` from `tsconfig.json`. Removing it changed the built bundle by 0.04 kB. |
| `export` on `maya`, `priya` fixtures | 2 exports | Showcase fixtures used only inside their own module. |
| stale assertions in `probe-demo.mjs` and `browser-demo-gate.mjs` | — | See D1 below. |

## What custom code an existing capability replaced

| Custom machinery | What replaced it | Rung of the reuse ladder |
|---|---|---|
| 40-line ESM specifier rewriter | `tsc` itself, plus explicit `.js` specifiers — the convention `render/` already used | (b) already in this repository, and (d) the toolchain provides it |
| 5-line `clean.mjs` module | `node -e "require('node:fs').rmSync(...)"` in `prebuild` | (c) standard library |
| Three JSON-serialising public functions | `JSON.stringify(value, null, 2)` | (c) standard library |
| A second static server for `examples/compose` (the baseline capture used a hand-written one that was never committed) | `render/scripts/serve-demo.mjs` with two optional arguments | (b) already in this repository |
| The deleted rewriter's runtime guarantee | a one-line `postbuild` that imports `dist/index.js` through **Node's own resolver** | (d) the platform provides it |

## Defects fixed, with reproductions

These were open in [`promotion/PROMOTION_LOG.md`](../promotion/PROMOTION_LOG.md)
with reproductions, so they are proven defects rather than behavior changes.

### D1 — `npm run verify:demo` exited 1 on every fresh clone

`probe-demo.mjs` asserted the demo page contained the string
`Add another live branch`, and `browser-demo-gate.mjs` clicked `#add-branch`.
Neither existed: the ten-scenario gallery replaced the single-branch demo and the
gate outlived the button. The repo's own README lists this command in its
verification block.

Fixing the string assertion exposed a second, deeper staleness the first failure
had been hiding: the gate's "has the motion decayed?" sample was taken 5.6s after
load, tuned for a demo with one short ingestion. The gallery now opens on the
142-entity dense constellation, which streams for about 6s and extends the live
window with every event, so the gate was reading **87,317 lit pixels** and
calling it a failure — the demo working, reported as broken.

Rewritten to drive a *known* ingestion: press "Calm by contract" (exactly one
event, window closes at ~3.5s), sample inside the window twice, sample well past
it, then press again to prove the window reopens and closes. Then two further
defects surfaced and were fixed in the same script:

- **A pixel sample during a fast stream reads 0 about one run in five.** Every
  ingestion re-runs the overlay effect, and re-running it resizes (therefore
  clears) the canvas one frame before the next paint. Measured on unchanged
  code: `118256, 111935, 117493, 0`. Now the check takes the brightest of five
  samples spanning more than one frame; a genuinely dead overlay still reads 0 in
  all of them.
- **Cleanup could overwrite a passing verdict.** `rmSync` on the temp Chrome
  profile threw `EBUSY` on Windows even after its five built-in retries, so a run
  that had already printed a PASSING proof exited 1 from the `finally` block. A
  disposable temp directory is not the gate's verdict.

Now: `{"denseLive":126580,"initialLive":10178,"expandedLive":6861,"initialDecay":0,"replayLive":6873,"replayDecay":0,"browserErrors":0}`, exit 0, **6 consecutive runs**.

### D2 — both READMEs told a first-time reader to press a control that does not exist

`render/README.md` lines 23 and 218. Rewritten to describe the ten scenario
chips that are actually on the page, and which ones show which rule.

### D4 — the headline "two layers are one product" proof had no run command

`examples/compose` is presented in the root README with a screenshot, but no
script in either `package.json` ran it, and its imports need **both** `dist/`
trees built. It only rendered from a static server hand-written for the baseline
capture and never committed.

`npm run example:compose` now builds both layers and serves it. Verified in
headless Chromium: `model: 54 nodes, 102 edges, 6 backed facts · rendered: 46
entities, 94 relationships (all traversal — no count was measured, no
release-stamped receipt exists)`, **0 console errors**
(`promotion/evidence/wave3/compose-runs-from-npm-script.png`).

The reuse was `render/scripts/serve-demo.mjs` rather than a new server or an
`npx serve` dependency. It gained two optional arguments — a root directory and
the URL to print — and its default behavior is byte-identical, which
`verify:demo` exercises on every run. Its path-traversal guard still holds at the
wider root: `curl --path-as-is '.../%2e%2e%2f%2e%2e%2fWindows/win.ini'` → 404.

### Not in the ledger, found here

Running the documented `node mcp/client-demo.mjs` wrote `.nodegraph/events.jsonl`
into a dirty working tree. Added to `render/.gitignore`.

## Findings left unresolved, and why

| Finding | Why it was left |
|---|---|
| **D7 — the graph is unreachable by keyboard** (major, open) | This is a *feature* change: it needs a focusable node list and an `aria-live` region beside the canvas, which is new UI, not structural cleanup. Wave 3's rules forbid mixing feature work with structural refactoring. It is the highest-impact item left; see `docs/codebase/CONCERNS.md`. |
| **D5 — the camera never fits a small viewport** (major, open) | Same reason: a responsive fit behaviour is new behaviour, and the product loop owns it. |
| **D6 — `#stats` at 3.01:1** (minor, open) | One hex value, but it is a visual-design change in the demo page and belongs to the product loop, which measures contrast as a gate condition. |
| **No error, loading or empty state in the demo** | Feature work. Recorded in `CONCERNS.md` rather than invented here. |
| **Two packages, two test runners, no single test command** | The biggest tax on a cold reader, and a genuine system change: the root's tests are TypeScript and need transpilation, so converging on `node --test` depends on type-stripping behaviour that varies by Node version. Documented in `TESTING.md` and `CONCERNS.md` instead of half-done. |
| **`src/semanticGraph.ts` at 1,071 lines** | Well sectioned, one `derive*` per relationship source, and jscpd finds no duplication in it. Splitting it would move code between files without removing a concept, which is exactly what this pass is told not to count as progress. |
| **`selectSemanticEdge` and `semanticGraphIndexes` are unused outside `src/`** | `selectSemanticEdge` is the only producer of `selection.selectedEdge`, which `EntityGraphDetailPanel` and `nodeAgentBridge` both render. Deleting it deletes the edge-selection *capability*, not dead code. Rule 1 says preserve observable behavior. |
| **`docs/internal/`, `ENHANCEMENT_LOOP.md`, `PRODUCT_AUDIT_2026-08-12.md`** | Cross-repo planning notes about other repositories. Not verified in this pass; flagged in `STRUCTURE.md` as ignorable on day one rather than deleted, because they are somebody's working record. |
| **The demo needs network** (`esm.sh` import map) | Deliberate: the demo's claim is that the renderer needs no bundler. Documented in `STACK.md` and `INTEGRATIONS.md` as the most likely reason a fresh clone appears broken. |

## Verified from a genuinely fresh clone

Not inferred from the working tree. `git clone --depth 1` of the pushed commit
`eb54aa5`, into an empty directory, on Windows 11 / Node 22.22.2:

| Step | Result |
|---|---|
| `npm install` (root) | 76 packages, 21s, exit 0 |
| `npm test` | 14 passed |
| `npm run docs:check` | 22 markdown files, all tour steps resolve |
| `cd render && npm install` | 11 packages, 2s, exit 0 |
| `cd render && npm test` | 11 passed, 0 failed |
| `cd render && npm run verify:demo` | exit 0, `{"denseLive":124402,...,"initialDecay":0,...,"replayDecay":0,"browserErrors":0}` |
| `npm run example:compose` | serves; page renders `model: 54 nodes, 102 edges, 6 backed facts · rendered: 46 entities, 94 relationships (all traversal ...)`, **0 console errors** |

## How to reproduce this report

```sh
git clone https://github.com/HomenShum/NodeGraph && cd NodeGraph
npm install && (cd render && npm install)

npm test && npm run typecheck && npm run build && npm run docs:check
(cd render && npm test && npm run typecheck && npm run verify:demo)
npm run proof:edge-grammar

npx knip@5 --no-progress
npx jscpd@4 src render/src --reporters console --min-lines 5 --min-tokens 50
npx dependency-cruiser@16 --no-config --output-type err-long src render/src examples tests render/tests
```
