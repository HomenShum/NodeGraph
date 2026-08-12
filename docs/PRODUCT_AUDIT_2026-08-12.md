# Product audit, 2026-08-12 — what shipped and what remains

The audit's verdict: the view layer already reads like a best-in-class
component; the front door spoke a private dialect, contradicted itself
about the repo's own shape, and pointed at an npm name that is squatted.

Shipped same day (the identity pass): scoped package names
(`@homenshum/nodegraph` — the bare name has been held on npm since 2015 —
and `@homenshum/nodegraph-live` with its repository URL repointed off the
archived duplicate), one layers table instead of two contradicting ones,
NodeRoom dialect and process links off the first screen, the render
README's fenced install made honest, `render/demo.log` deleted, and three
process docs moved to `docs/internal/`.

Remaining ladder, in leverage order:

1. **`examples/compose/`** — the ~15-line bridge (model classifies trust,
   renderer draws it) that makes "one product, two layers" true rather
   than asserted. Verified feasible; two honest caveats to carry as
   comments: model `weight` is a relevance score, not a measured count
   (map it only for `source_backed` edges), and the renderer's `assertion`
   class needs the model to grow an optional release-stamped ref.
2. **Curate the model's exports** — `src/index.ts` is 15 wildcard
   re-exports (106 symbols); the render layer's curated ~28-symbol index
   is the house style. Split React panels into a `/react` subpath so the
   main entry stops dragging React into Node consumers.
3. **Root package.json exports map + files trim** — no `exports` today;
   `files` would ship 907KB of docs GIFs to npm.
4. **CI** — one workflow: both layers' test + typecheck + render
   `npm pack --dry-run`, badges on both READMEs.
5. **Publishes** (owner npm login): `@homenshum/nodegraph` and
   `@homenshum/nodegraph-live`; then flip both READMEs' install blocks.
6. Collapse `render/CHANGELOG/` lanes into one conventional CHANGELOG.md.
