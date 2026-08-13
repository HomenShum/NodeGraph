# Testing

## Every command, and what it costs

```sh
# model layer (repo root)
npm test                 # vitest, 14 tests, ~1s, offline
npm run typecheck        # tsc --noEmit over src, tests, examples/showcase
npm run build            # tsc, then loads dist/index.js through Node's resolver
npm run docs:check       # every tour step and doc line-citation resolves
npm run example:build    # vite production build of the showcase

# view layer
cd render
npm test                 # node --test, 11 tests, ~0.3s, builds first, offline
npm run typecheck
npm run verify:demo      # ~35s: serves the demo, drives it in headless Chrome
node mcp/client-demo.mjs # ~1s: real JSON-RPC session against the MCP server

# whole-product proof (repo root, needs Chromium via playwright)
npm run proof:edge-grammar
```

There is no single `test` command covering both packages. That is a real cost of
the two-package layout; run both.

## What each suite actually protects

### `render/tests/` — the trust grammar

| File | Tests | Protects |
|---|---:|---|
| `trust-boundary.test.mjs` | 3 | The product's whole point. A **happy path** (unknown vs measured zero vs evidence vs a receipted assertion are four distinguishable states), an **adversarial path** (unknown edge types and incomplete receipts fail *before* mutation), and a **recovery path** (exact retries are idempotent; an eventId reused with different content throws instead of overwriting). |
| `sustained-session.test.mjs` | 3 | The long-running case. A day-long stream stays bounded and evicts deterministically; eviction reaches the live render surface instead of leaving invisible stale state; an invalid capacity fails at construction rather than becoming an unbounded fallback. |
| `edge-grammar.test.mjs` | 4 | That the three inks stay distinguishable in both themes, by CIEDE2000 and by greyscale contrast, and that an edge arriving later by patch keeps its class ink. It includes a **self-check of the CIEDE2000 implementation against Sharma's published reference pairs**, so a broken metric cannot silently pass the grammar. |
| `seed-geometry.test.mjs` | 1 | That a streamed chain of births is never collinear. This exists because a real capture rendered 142 nodes as a straight line: the previous seed offset produced `dx === dy` for every birth, and force layout preserves collinearity it is handed. |

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
  errors. Also writes `render/media/standalone-demo-mid-ingestion.png`.
- **`npm run proof:edge-grammar`** — reads the edge colours out of the demo's own
  built bundle *in the page*, through the same `buildGraph` call the component
  makes on mount, and scores all six class pairs. Writes
  `promotion/evidence/edge-grammar/after/`.

Both spawn and kill their own server on their own port. That is deliberate: an
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

- No accessibility audit (axe/Lighthouse) runs anywhere, and the graph surface
  fails basic keyboard access today. See `CONCERNS.md`.
- No performance measurement of input latency during the 142-entity scenario.
- The light theme's edge palette is measured by tests but never photographed:
  the demo page is dark-only.
- No scenario emits all three edge classes at once, so no single frame shows the
  whole grammar.
