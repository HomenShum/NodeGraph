# START HERE — one user action, followed through the code in the order it runs

This is not an architecture essay. It is the path a single click takes, step by
step, in the order the machine executes it. Read it top to bottom once and you
can change this codebase.

## The person and the job, before any jargon

Someone is building a screen where an assistant works in the background — it
looks things up, follows leads, and adds what it finds to a picture that keeps
growing while the person watches.

Their problem is that every line in that picture looks equally true. A number
the assistant actually went and counted, a claim it copied out of a published
reference, and a step it merely happened to walk through all get drawn as the
same line. The reader ends up believing things nobody ever checked.

This repository draws that picture and refuses to flatten those three into one
look. A thick line means a real measured count. A badged line means someone
else's published claim, stamped with the release it came from. A faint line
means "we passed through here" and nothing more. Clicking any point says which
of the three you are looking at, including the difference between "measured,
and the answer was zero" and "nobody measured this". We call those three
classes and their absence rules the **trust grammar**.

> Paper-note version: a drawing surface for live agent findings, where a
> measured number, a cited claim, and a mere visit are never drawn alike, and
> "unknown" is never drawn as zero.

## Two packages, and why you will open both

| Layer | Directory | What it owns | Run it |
|---|---|---|---|
| **View** | `render/` | The live drawing surface. Sessions, the three edge classes, the Sigma renderer. This is the product. | `cd render && npm install && npm run demo` |
| **Model** | repo root (`src/`) | Turns room artifacts (a sheet, an agent's sourced cells, traces, proposals) into a semantic graph a host app can store and sync. | `npm install && npm test` |

They compose but neither imports the other. `examples/compose` is the proof:
`npm run example:compose`.

**The steps below follow the VIEW layer**, because that is the running
application. Steps 5b and 6b show where the model layer joins.

---

## Step 1 — The application entry and its "route"

**File:** `render/demo/index.html`, served by `render/scripts/serve-demo.mjs`
**Symbol:** the module script tag `<script type="module" src="/demo/demo.js">`
**Called by:** the browser, after `npm run demo` starts the static server
**Calls next:** `render/demo/demo.js` top-level code

**Why this exists**
There is no framework and no router. This is a library, and its entry point is
a plain HTML page with an import map that pulls React, Sigma and Graphology from
`esm.sh` at runtime. That is deliberate: the demo proves the renderer needs no
bundler. It does mean the demo needs network on first load — 42 resources from
two hosts.

`serve-demo.mjs` is 50 lines of `node:http` because the repo refuses to add a
static-server dependency for one page. It takes two optional arguments so the
same server can also host `examples/compose`, which lives above `render/`.

**Core code**

```js
const [rootArg, openArg] = process.argv.slice(2);
const root = resolve(rootArg ?? fileURLToPath(new URL("../", import.meta.url)));
const relative = pathname === "/" ? "demo/index.html" : pathname.slice(1);
const target = resolve(root, relative);
if (target !== root && !target.startsWith(`${root}${sep}`)) {
  response.writeHead(403).end("forbidden");
  return;
}
```

**Input** — an HTTP GET for a path.
**Output** — the file, or 403 for anything resolving outside the served root,
or 404.
**Failure behavior** — path traversal is refused before `statSync`, so a
`..` escape returns 403 and a missing file returns 404. Verified:
`curl --path-as-is 'http://127.0.0.1:4173/%2e%2e%2f%2e%2e%2fWindows/win.ini'`
→ 404.
**Next** — the page loads `demo/demo.js`, Step 2.

---

## Step 2 — The primary user action: pressing a scenario chip

**File:** `render/demo/demo.js`
**Symbol:** the click handler built in the `SCENARIOS.map` loop (line 251)
**Called by:** the reader clicking one of the ten chips above the stage
**Calls next:** `scenario.run()`, which calls `GraphSession.observe` /
`GraphSession.assertEdge` on timers

**Why this exists**
Each chip is one story about the trust grammar — "Unknown vs zero", "Evidence
lands", "Assertion chain", "Bounded memory". Pressing one throws away the
previous session and streams a fresh set of events in on `setTimeout`, so every
run replays a real ingestion: motion while events land, stillness after. This
is the single place a user action enters the system.

**Core code**

```js
b.addEventListener("click", () => {
  for (const other of buttons) other.classList.remove("active");
  b.classList.add("active");
  caption.textContent = s.caption;
  s.run();                       // -> resetSession() then session.observe(...)
});
```

**Input** — a DOM click.
**Output** — a new `GraphSession` and a queue of timers that will call
`observe` / `assertEdge`.
**Failure behavior** — `resetSession` clears every pending timer first, so
switching scenarios mid-stream cannot interleave two stories. A `nonce` prefixes
every `eventId` so the new run's events cannot collide with the old run's
deduplication memory.
**Next** — the first timer fires and calls `observe`, Step 3.

---

## Step 3 — Validation and the domain types: where input becomes trusted

**File:** `render/src/session.ts` and `render/src/graph-model.ts`
**Symbol:** `GraphSession.observe` (session.ts:253), `requireEdgeType`
(graph-model.ts:49), `requireAssertionReceipt` (graph-model.ts:159)
**Called by:** the scenario's `run()`, the MCP server, any host application
**Calls next:** `GraphSession.upsertNode` / `upsertEdge`

**Why this exists**
This is the trust boundary. The rule the whole product rests on is decided
here, not in the renderer: **two participants plus a measured count produce an
`evidence` edge; anything else produces `traversal` telemetry.** Three
participants have no measured pair count, so no edge may claim one. A measured
zero is still evidence, with weight 0. A curated claim is accepted only with a
complete replay receipt — source, release, both stable ids, and a real http(s)
URL — and is refused otherwise.

**Core code**

```ts
if (ids.length === 2 && measuredCount !== undefined) {
  this.upsertEdge(ids[0], ids[1], "evidence", measuredCount);
} else {
  for (let i = 0; i < ids.length; i += 1)
    for (let j = i + 1; j < ids.length; j += 1)
      this.upsertEdge(ids[i], ids[j], "traversal");
}
```

**Input** — `EntityRef[]`, an optional `measuredCount`, an optional `eventId`.
**Output** — nodes and edges in the session's maps, and one listener
notification.
**Failure behavior** — every field is checked by `requireText` / `requireCount`
before anything is written, so a malformed payload throws with a named field and
mutates nothing. `requireEdgeType` refuses a fourth epistemic category outright.
`requireAssertionReceipt` rejects a non-http(s) URL.
**Next** — `upsertNode` / `upsertEdge` write to the bounded store, Step 5.

---

## Step 4 — Agent orchestration: an agent doing the same thing over MCP

**File:** `render/mcp/server.mjs`
**Symbol:** the `createInterface(...).on("line", ...)` JSON-RPC loop (line 102)
**Called by:** any MCP-speaking agent over stdio
**Calls next:** `call(name, args)` → the same `GraphSession`

**Why this exists**
The browser is not the only caller. An agent should be able to author the graph
directly — and if it can, it must hit exactly the same validator, or the trust
grammar would hold in the UI and leak everywhere else. So the MCP server holds a
real `GraphSession` and lets it do the refusing.

There is no LLM, no planner and no agent framework in this repository. This step
is the orchestration boundary; the agent lives outside.

**Core code**

```js
const session = new GraphSession({ maxNodes: 1000, maxEdges: 3000, maxSeen: 5000 });
// ...
} else if (method === "tools/call") {
  try {
    const text = call(params.name, params.arguments ?? {});
    respond(id, { content: [{ type: "text", text }], isError: false });
  } catch (err) {
    // The refusal path: the session's validation error goes back to the
    // agent verbatim, and NOTHING is recorded to the event log.
    respond(id, { content: [{ type: "text", text: String(err?.message ?? err) }], isError: true });
  }
}
```

**Input** — newline-delimited JSON-RPC 2.0 on stdin.
**Output** — JSON-RPC responses on stdout; accepted events appended to
`.nodegraph/events.jsonl`.
**Failure behavior** — a refused call returns `isError: true` with the
session's own message and writes nothing to the event log. Run
`cd render && node mcp/client-demo.mjs` to watch an unreceipted assertion get
refused: `MCP SESSION COMPLETE — boundary held`.
**Next** — tool registration, Step 5.

---

## Step 5 — Tool registration and invocation

**File:** `render/mcp/server.mjs`
**Symbol:** `TOOLS` (line 32) and `call` (line 82)
**Called by:** the JSON-RPC loop, on `tools/list` and `tools/call`
**Calls next:** `session.observe` / `session.assertEdge`

**Why this exists**
Two tools, no registry abstraction, no plugin loader: an array and an
`if`/`if`/`throw`. The tool *descriptions* carry the invariant in prose the
agent reads — "Never pass a count you did not measure", "REFUSED unless the
receipt carries source, release, subjectId, objectId, and an http(s) url" —
because the model chooses arguments from the description before the validator
ever sees them.

**Core code**

```js
const call = (name, args) => {
  if (name === "observe") {
    session.observe(args.entities, args.measuredCount, { eventId: args.eventId });
    record("observe", { entities: args.entities, measuredCount: args.measuredCount, eventId: args.eventId });
    // ...
  }
  if (name === "assert_edge") { /* ... */ }
  throw new Error(`unknown tool: ${name}`);
};
```

**Input** — a tool name and arguments object.
**Output** — a text summary string.
**Failure behavior** — an unknown tool name throws, caught by the loop above
and returned as `isError`. Note the ordering: `session.observe` runs *before*
`record`, so a refused call never reaches the event log.
**Next** — the session mutates its store, Step 6.

### Step 5b — the same shape in the model layer

`src/nodeAgentBridge.ts:92` `createNodeGraphAgentTools` builds five read-only
tools (`nodegraph_overview`, `nodegraph_search`,
`nodegraph_select_neighborhood`, `nodegraph_evidence_summary`,
`nodegraph_open_questions`) over a built semantic graph, with zod schemas. They
only read; the model layer's graph is produced by `buildSemanticGraph`, not by
an agent.

---

## Step 6 — Persistence and artifact mutation

**File:** `render/src/session.ts`
**Symbol:** `upsertNode` (line 179), `upsertEdge` (line 207), `trimNodes`
(line 168), `evictOldestNode` (line 159)
**Called by:** `observe`, `assertEdge`, `ingest`
**Calls next:** `emit()` → every subscriber

**Why this exists**
The session is working state, not a filing cabinet. An analyst who leaves the
panel open all day must not slowly exhaust the browser, so nodes, edges and
deduplication receipts are all bounded with FIFO eviction, and the limits are
disclosed by `stats()` rather than hidden. Eviction is deterministic:
oldest-inserted leaves first, and dropping a node drops its edges.

The count rule lives here too: a measured value supersedes unknown, and an
observation with no measurement leaves the last measurement alone.

**Core code**

```ts
const existing = this.nodes.get(id);
if (existing) {
  existing.visits += 1;
  // A measured zero is data and supersedes unknown; an observation with
  // no measurement leaves the last measurement alone.
  if (count !== undefined) existing.count = count;
} else {
  this.nodes.set(id, { id, label, type: kind, ...(count === undefined ? {} : { count }), visits: 1 });
  this.trimNodes();
}
```

**Input** — a kind, a label, an optional count.
**Output** — a stable node id (`JSON.stringify([kind, label])`).
**Failure behavior** — over-capacity is not an error; it evicts and says so in
`stats()`. Invalid capacity is an error at construction, so a bad limit can
never silently become "unbounded".
**Next** — subscribers re-render, Step 7.

### Step 6b — durable documents, in the model layer

If a host needs the graph to survive a reload, that is the model layer's
`nodegraph.document` v1 contract: `exportNodeGraphDocument`
(`src/graphContract.ts:104`) writes one with a deterministic revision and source
provenance, `parseNodeGraphDocument` (:125) validates one coming back,
`diffNodeGraphDocuments` (:172) reports exactly which nodes, relationships and
clusters changed, and `InMemoryNodeGraphAdapter.importDocument`
(`src/inMemoryAdapter.ts:39`) or `buildNeo4jSyncPlan` applies it.

---

## Step 7 — Streaming and rendering: how progress reaches the interface

**File:** `render/src/NodeGraph.tsx`
**Symbol:** the patch effect (line 128) and the cinematic overlay effect (line 392)
**Called by:** React, when the session snapshot changes
**Calls next:** `patchGraph` (`graph-model.ts:392`), then Sigma repaints itself

**Why this exists**
One graph per mount. Growth is *patched* into the live Graphology graph rather
than rebuilt, because rebuilding tears down the Sigma instance — five canvases
and the layout — and replays the whole lifecycle per update, which reads as
flicker. Sigma reflects Graphology mutations automatically, so patched elements
simply appear.

`patchGraph` returns *what* was born, not just how much, so the overlay can
flare exactly the elements that just arrived.

Motion is bounded by data, not by taste: an ingestion opens a live window
(`liveUntil`), and the `requestAnimationFrame` loop exits when it closes. The
steady state is a still canvas. `prefers-reduced-motion` skips it entirely.

**Core code**

```tsx
const patch = patchGraph(graph, nodes, edges, { dark, visits, kindColors });
if (added > 0) {
  const now = performance.now();
  for (const id of patch.addedNodeIds) births.current.nodes.set(id, now);
  for (const e of patch.addedEdges) births.current.edges.set(e.key, now);
  liveUntil.current = now + 3200;   // the ambience window
  layoutRef.current?.start();
}
```

**Input** — the session snapshot as `nodes` / `edges` props.
**Output** — an in-place graph diff, a repaint, and (while live) an overlay of
birth flares and comets on a sibling canvas.
**Failure behavior** — an edge naming a node the payload did not describe is
dropped rather than inventing that node, because an invented node has no
measured count and would draw a magnitude nobody measured. Non-finite
coordinates are skipped per element inside the draw loop.
**Next** — the reader clicks a node and gets the readout, or something fails —
Step 8.

**The three rules this step must never break**, all enforced in
`graph-model.ts`: only `evidence` weights get the edge **width** channel
(`edgeDisplayAttrs`, line 264); the three classes get three distinct inks *and*
three distinct luminances so a reader with no colour vision keeps the grammar
(`EDGE_COLOR`, line 114); `visits` is carried as an attribute and rendered as
text, never as size, colour or opacity.

---

## Step 8 — Failure and recovery

**File:** `render/src/session.ts`
**Symbol:** `remember` (line 136), and the validate-before-mutate prologue of
`ingest` (line 320)
**Called by:** every public session method
**Calls next:** nothing — it either returns false (duplicate) or throws

**Why this exists**
Retries are normal in agent systems, and a retried tool call must not make a
relationship look stronger. `remember` fingerprints the canonical payload: an
exact retry is a no-op, and — the important half — **an event id reused with
different content is a conflict, not a duplicate to silently ignore**, so it
throws instead of quietly overwriting.

`ingest` validates the complete batch before storing anything, so a subgraph
with one bad edge type rejects whole. A renderer that paints half a batch before
discovering an unknown edge type has already made a false claim.

**Core code**

```ts
const previous = this.seen.get(key);
if (previous !== undefined) {
  if (previous !== fingerprint) {
    throw new Error(`eventId ${JSON.stringify(eventId)} was reused with different content`);
  }
  return false;
}
```

**Input** — a namespace, a payload, an optional event id.
**Output** — `true` to proceed, `false` to skip.
**Failure behavior** — throws on the conflict case; the deduplication map is
itself bounded by `maxSeen` with FIFO eviction.
**Next** — the tests that prove all of the above, Step 9.

**What has no failure path, honestly:** the demo page has no error state. There
is no `catch` in `render/demo/demo.js`, so a rejected batch has nowhere to
surface in the UI. See `docs/codebase/CONCERNS.md`.

---

## Step 9 — The tests that prove this flow

Run them: `cd render && npm test` (11 tests, Node's built-in runner) and
`npm test` at the repo root (14 tests, vitest).

| The step above | The test that proves it |
|---|---|
| 3 — validation, the three classes, unknown vs measured zero | `render/tests/trust-boundary.test.mjs:19` "happy path: an analyst can distinguish unknown, measured zero, evidence, and a receipted assertion" |
| 3 — refusal before mutation | `render/tests/trust-boundary.test.mjs:66` "adversarial path: unknown edge types and incomplete assertion receipts fail before mutation" |
| 8 — idempotency and the reused-id conflict | `render/tests/trust-boundary.test.mjs:112` "recovery path: exact retries are idempotent and an event id cannot hide changed content" |
| 6 — bounded memory and deterministic eviction | `render/tests/sustained-session.test.mjs:21` and `:70` (eviction reaching the render surface), `:95` (invalid capacity fails at construction) |
| 7 — the three inks stay distinguishable, in both themes and after a patch | `render/tests/edge-grammar.test.mjs:136` (CIEDE2000 self-check against Sharma's published pairs) and `:174` |
| 7 — streamed births are never collinear | `render/tests/seed-geometry.test.mjs:5` |
| 6b — document round-trip, provenance, pins | `tests/semanticGraph.test.ts:310` |
| 6b — incremental sync with stale pruning | `tests/semanticGraph.test.ts:326` |
| 5b — the model layer's agent tools | `tests/nodeAgentBridge.test.ts:74` |

And the two checks that drive a real browser:

```sh
cd render && npm run verify:demo     # serves the demo, drives it in headless Chrome
npm run proof:edge-grammar           # re-reads the edge ink out of the rendered page
```

---

## Where you would add one adjacent capability

- **A fourth edge class** — do not. `requireEdgeType` refuses it on purpose,
  and `EDGE_COLOR`'s comment explains why a third luminance step barely fit.
  Adding a fourth means finding a channel, not a colour.
- **A new scenario in the demo** — one object in the `SCENARIOS` array in
  `render/demo/demo.js`. Nothing else.
- **A new node kind** — nothing to register. `kindHue`
  (`graph-model.ts:73`) hashes the kind name into the palette deterministically.
- **A new agent tool** — one entry in `TOOLS` and one `if` in `call`
  (`render/mcp/server.mjs`), routed through the same `GraphSession`.
- **A new derivation in the model layer** — a `derive*` function in
  `src/semanticGraph.ts`, called from `buildSemanticGraph` (line 1022) beside
  `deriveSheet` / `deriveTraces` / `deriveProposals`.

## Next

- `.tours/` — the same three walks as clickable CodeTours, pointing at live
  source rather than copies.
- `docs/codebase/` — stack, structure, architecture, conventions,
  integrations, testing, and the honest list of open concerns.
- `docs/SIMPLIFICATION_REPORT.md` — what this pass deleted, and what it left.
