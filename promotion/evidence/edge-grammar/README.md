# Evidence — trust-grammar edge ink (defect D3)

Both halves are reproducible from a fresh clone. The producer is
`promotion/scripts/prove-edge-grammar.mjs`; it spawns its own demo server on
its own port and kills it afterwards, so it can never grade a process it did
not start.

Setup once:

    npm install                                   # root: playwright
    npx playwright install chromium
    cd render && npm install && npm run build && cd ..

## `after/` — the current tree, verdict PASS, exit 0

    npm run proof:edge-grammar

## `before/` — the defect, verdict FAIL, exit 1

Reproduce it by putting the pre-fix palette back and rebuilding:

    git stash push render/src/graph-model.ts     # or: git checkout f136ae2 -- render/src/graph-model.ts
    (cd render && npm run build)
    NODEGRAPH_EVIDENCE_DIR="$PWD/promotion/evidence/edge-grammar/before" \
      node promotion/scripts/prove-edge-grammar.mjs
    git stash pop
    (cd render && npm run build)

Both directories in this repo were produced by the same version of the
producer, on the same machine, minutes apart — the only difference between
them is `EDGE_COLOR` in `render/src/graph-model.ts`.

## What each file is

| File | What it shows |
|---|---|
| `edge-grammar.json` | Every pair of trust classes in both themes: the ink Sigma is handed, CIEDE2000, greyscale contrast, pass/fail, console errors. |
| `assertion-chain-dark.png` | The "Assertion chain" stage at 1280x900. Before: four grey assertion edges. After: four violet ones. Node positions are identical because seeding is deterministic, so the ink is the only variable. |
| `assertion-chain-page.png` | The same moment, full page, for the filter row and caption. |
| `deep-traversal-dark.png` | The "Deep traversal" stage — the only scenario that draws traversal edges. |

## One limit, stated

No scenario in the gallery emits all three edge classes at once, so no single
screenshot shows the complete grammar. The three-way comparison rests on
`edge-grammar.json`, which reads the inks out of the demo's own
`dist/index.js` in the page that is rendering it, via the same `buildGraph`
call `NodeGraph.tsx` makes on mount. The demo page is dark-only, so the light
palette is measured but never photographed.
