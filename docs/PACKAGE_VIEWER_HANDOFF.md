# NodeGraph package and viewer handoff

A developer needs to install both layers, preserve source identities when
composing them, and inspect the same graph in a browser. Previously the demo
quickstart left its imported build files missing, and root tests excluded the
renderer. The composition example also normalized distinct source entities by
name, displaying 46 entities from a 54-entity model.

The renderer demo now builds before starting. The static composition passes
its complete model snapshot directly, preserving source IDs. The viewer has
readable dark-theme highlights, labels that fit their canvas, visible module
failure/retry, and support for a host temporarily hiding its panel. Without
the latter, a zero-width refresh threw and removed the React tree.

## Install and verify

Use Node 22 or 24 from the repository root:

```sh
npm ci
npm --prefix render ci
npm run test:all
npm run typecheck
npm --prefix render run typecheck
npm run example:build
npm run verify:packages
npm audit
npm --prefix render audit
```

For browser proof, install Playwright Chromium in both packages with
`npx playwright install chromium`, then run from the root:

```sh
npm run verify:packages -- --browser
npm --prefix render run verify:demo -- --compose
```

The first command packs and installs both packages into a temporary consumer
outside the checkout. Model/core runtime scenarios cover invalid documents,
200 events, exact retries, conflicting retries and bounded state. Public type
declarations compile in NodeNext without `skipLibCheck`. The React entry is
bundled and, with `--browser`, exercised in Chromium. It needs browser WebGL
globals; server-rendered hosts must load it on the client.

The gallery command checks five widths, keyboard selection, unknown versus
measured zero, filters, refused-batch recovery, hidden-panel recovery, bounded
ingestion, reduced motion, module retry and the composition example. Motion
must light actual overlay pixels, then remain dark across successive samples.
Axe results retain incomplete/manual checks as well as violations. Inspect
the screenshots; automated checks alone are not a complete visual grade.

## Ownership and evidence

The new Playwright verifier replaces the custom raw-CDP client and writes to
fresh `.proofloop/viewer-*` directories. It awaits browser/server closure and
fails if teardown fails. Packed consumers, command logs and screenshots go to
`.proofloop/packages-*`; only the owned temporary install is removed.

The localhost server rejects unsupported methods, private files and paths or
linked directories escaping its root. The MCP viewer's accepted-event log
remains explicitly readable. Never put credentials in public demo assets.
Provider keys and production deployment are not part of this library check.

CI executes both package checks on Linux/Windows with Node 22/24 and browser
checks on Linux. Audit failures remain failures. Historical promotion evidence
describes its original source; it is not current acceptance. No npm publication,
hosted deployment, SEO ranking improvement, full product grade or independent
human approval follows automatically from these checks.
