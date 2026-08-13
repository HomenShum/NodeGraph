# Conventions

Rules this codebase actually follows. Each one is checkable, and most were
learned by getting it wrong first.

## Imports

**Relative import specifiers carry the `.js` extension**, in both packages, even
in `.ts` and `.tsx` files:

```ts
import { requireEdgeType } from "./graph-model.js";
export * from "./semanticGraphTypes.js";
```

TypeScript resolves `./graph-model.js` to `graph-model.ts`; Node then loads the
emitted `graph-model.js` at runtime. Extensionless specifiers typecheck fine and
then fail at runtime with `ERR_MODULE_NOT_FOUND`, which is why the model layer
used to ship a 40-line post-build script that rewrote them. That script is gone.
The guard that replaced it is one line:

```
npm run build   # postbuild imports dist/index.js through Node's own resolver
```

Add an extensionless specifier and the build fails with the exact missing path.

## Naming

- **Domain words, not framework words.** `evidence`, `assertion`, `traversal`,
  `receipt`, `visits`, `measured`, `unknown`. A reader who knows the product
  vocabulary can grep for it.
- Model-layer public functions are verb-first and say what they return:
  `buildSemanticGraph`, `selectSemanticNeighborhood`, `summarizeSemanticGraphClusters`,
  `buildNeo4jSyncPlan`, `exportNodeGraphDocument`.
- Validators are `requireX` and **throw with the field name**:
  `requireText(value, "receipt.source")`. Predicates are `isX` and return
  booleans. If a function is named `require*`, calling it is a trust boundary.

## Comments

Comments explain **why**, and where a number appears in a comment it is a
measurement with the run that produced it, not a guess. Compare:

```ts
// The dark ramp had to WIDEN to make room: at `#a8b1b9`/`#616a72` the whole
// evidence-to-traversal span was 2.53:1, and two 1.6:1 steps need 2.56:1.
```

That is the house style. A comment that says "colors chosen for contrast" would
not be. When you change one of these values, update the number and keep the old
one in the comment so the change stays auditable.

## Types

- `strict: true` in both packages; the model layer also runs `noUnusedLocals`
  and `noUnusedParameters`.
- **Absence is `undefined`, never `null` and never `0`.** `count?: number` means
  unmeasured when absent. The one place `null` appears is the Graphology node
  attribute, because the renderer needs a concrete value to store, and it is
  paired with an explicit `countState: "unknown" | "measured"`.
- Discriminated unions carry their obligations in the type:
  `GraphEdge` makes `receipt` **required** on `type: "assertion"` and forbidden
  (`receipt?: never`) on the other two, so a receiptless assertion does not
  typecheck.

## Validation

Validate the **complete payload before mutating anything**. `buildGraph`,
`patchGraph` and `GraphSession.ingest` all run every check first, because a
renderer that paints half a batch before discovering a bad edge type has already
made a false claim on screen.

Enforce a rule **once, at the layer that owns it**. `edgeDisplayAttrs` is the
single writer of edge display colour and width for both `buildGraph` and
`patchGraph`, which is why fixing the ink collision was three hex values and no
sibling caller was left behind.

## Styling

The React component carries **no CSS dependency**: theme tokens are four local
constants (`ink`, `muted`, `border`, `card`) and styles are inline objects. A
host drops the component into any app without importing a stylesheet.

## Test names are sentences about a person

```
"happy path: an analyst can distinguish unknown, measured zero, evidence, and a receipted assertion"
"adversarial path: unknown edge types and incomplete assertion receipts fail before mutation"
"degraded path: invalid capacity fails at construction instead of becoming an unbounded fallback"
```

Not `test('observe')`. The name states the persona, the situation and the
guarantee, so a failure line alone tells you what a user just lost.

## Test selectors

The renderer exposes stable `data-testid` hooks, and browser gates use them
rather than CSS classes or DOM order: `nodegraph`, `nodegraph-canvas`,
`cinematic-layer`, `nodegraph-selection`, `count-readout`, `visits-readout`,
`edge-type-filters`, `nodegraph-fit`. When you delete a control, grep the gate
scripts in the same commit; the repo has shipped a gate that outlived its button
and failed every fresh clone for weeks.

## Scripts

Anything a reader is told to run is an npm script in the package that owns it.
Cross-package commands live at the root and use `npm --prefix render run ...`.
Verification scripts **spawn and kill their own server on their own port**, so a
run cannot silently grade an orphaned process from an earlier session. That has
happened here.
