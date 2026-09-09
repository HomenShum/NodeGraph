# Testing

## Every command, and what it costs

```sh
# both layers at once (repo root) — start here
npm run test:all         # model + renderer/server tests + docs:check, offline

# model layer (repo root)
npm test                 # vitest, 14 tests, ~1s, offline
npm run typecheck        # tsc --noEmit over src, tests, examples/showcase
npm run build            # tsc emits the model package
npm run verify:packages  # pack/install both packages outside this checkout; exercise public APIs and declarations
npm run docs:check       # tour steps and doc citations, each against the
                         # line's CONTENT, not just its number
npm run example:build    # vite production build of the showcase

# view layer
cd render
npm test                 # node --test, builds first, offline
npm run typecheck
npx playwright install chromium
npm run verify:demo      # gallery, responsive interaction, refusal/recovery, axe and bounded motion
node mcp/client-demo.mjs # ~1s: real JSON-RPC session against the MCP server

# whole-product proof (repo root, needs Chromium via playwright)
npm run proof:edge-grammar
```

`npm test` at the root runs the **model** layer only — 14 cases that never touch
`session.ts`, `graph-model.ts`, `NodeGraph.tsx` or the MCP server, which is where
the running product lives. It goes green while the view layer is untested, so it
reads like a whole suite and is not one. **`npm run test:all` is the command that
covers both**; it exits non-zero if either layer or the doc-pointer guard fails.

`verify:demo` uses an OS-assigned localhost port and awaits closure of its owned
server and Playwright browser. `NODEGRAPH_DEMO_PORT` still sets the interactive
demo server's port. Browser artifacts go to `render/.proofloop/viewer-*`.

From the root, `npm run verify:packages -- --browser` also renders the packed
React export, while `npm --prefix render run verify:demo -- --compose` checks
the source composition example. Install Playwright Chromium in both packages
first. The React export requires a browser; core/model imports and declarations
are verified under Node's NodeNext module resolution without `skipLibCheck`.

## What each suite actually protects

### `render/tests/` — the trust grammar

| File | Tests | Protects |
|---|---:|---|
| `trust-boundary.test.mjs` | 3 | The product's whole point. A **happy path** (unknown vs measured zero vs evidence vs a receipted assertion are four distinguishable states), an **adversarial path** (unknown edge types and incomplete receipts fail *before* mutation), and a **recovery path** (exact retries are idempotent; an eventId reused with different content throws instead of overwriting). |
| `sustained-session.test.mjs` | 3 | The long-running case. A day-long stream stays bounded and evicts deterministically; eviction reaches the live render surface instead of leaving invisible stale state; an invalid capacity fails at construction rather than becoming an unbounded fallback. |
| `edge-grammar.test.mjs` | 4 | That the three inks stay distinguishable in both themes, by CIEDE2000 and by greyscale contrast, and that an edge arriving later by patch keeps its class ink. It includes a **self-check of the CIEDE2000 implementation against Sharma's published reference pairs**, so a broken metric cannot silently pass the grammar. |
| `seed-geometry.test.mjs` | 1 | That a streamed chain of births is never collinear. This exists because a real capture rendered 142 nodes as a straight line: the previous seed offset produced `dx === dy` for every birth, and force layout preserves collinearity it is handed. |
| `demo-server.test.mjs` | 2 | Concurrent owned servers, port collision refusal, shutdown, malformed/private requests and repeated read bursts; the intended MCP event-log route remains readable. |

### `tests/` — the model layer

14 vitest cases over `buildSemanticGraph` and its consumers: derivation from real
room data, neighborhood selection, deterministic relationship-review plans,
evidence filtering, deterministic layout, cluster ranking with bounded neighbor
expansion, a 250+ node fixture staying derivable/filterable/layoutable, deck
storyboards and ranked connection paths, a parameterized Neo4j upsert executed
against a fake session, a document round-trip with provenance and persistent
pins, and incremental sync with optional stale pruning.

## The browser gates

Tests prove the model. These prove the **rendered page**, which is where two of
this repo's real defects were found.

- **`cd render && npm run verify:demo`** — `probe-demo.mjs` checks the page, the
  demo module and the built component all serve, then `browser-demo-gate.mjs`
  drives it in headless Chrome: the dense scenario is genuinely painting during
  ingestion, then "Calm by contract" is pressed twice and the overlay must go to
  **exactly zero lit pixels** after each live window closes, with zero console
  errors. Also checks keyboard measurements, filters, refused-batch recovery,
  reduced motion, bounded ingestion and failed-module recovery at representative
  widths. It preserves screenshots and raw axe findings under `.proofloop`.
- **`npm run proof:edge-grammar`** — reads the edge colours out of the demo's own
  built bundle *in the page*, through the same `buildGraph` call the component
  makes on mount, and scores all six class pairs. Writes
  `promotion/evidence/edge-grammar/after/`.

Both own their server and browser. That is deliberate: an
earlier run of this repo's gate silently graded an 11-hour-old orphaned server
from a previous session.

## Rules for adding a test here

1. **Name the persona and the guarantee**, not the function. See
   `docs/codebase/CONVENTIONS.md`.
2. **Cover the sad path in the same file.** Every suite above pairs a happy path
   with an adversarial one and, where state accumulates, a sustained one.
3. **Prove the test fails first.** When iteration 1 fixed the ink collision, the
   regression check was confirmed to fail before the fix
   (`git stash push render/src/graph-model.ts` → 2 failures → `git stash pop` →
   green) rather than assumed to. Do that.
4. **A number in an assertion needs a source.** `edge-grammar.test.mjs` scores
   against a published metric and self-checks the metric. Do not edit an expected
   value to match new behaviour; if a threshold must move, the justification goes
   in the comment with the old value beside it.

## Known gaps

- Axe and keyboard scenarios are partial accessibility evidence. Manual assistive
  technology review and full product quality grades remain unverified.
- No performance measurement of input latency during the 142-entity scenario.
- The light theme's edge palette is measured by tests but never photographed:
  the demo page is dark-only.
- No scenario emits all three edge classes at once, so no single frame shows the
  whole grammar.
