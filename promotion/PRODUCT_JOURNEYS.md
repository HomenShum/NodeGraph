# Canonical journeys — NodeGraph

Three to five real workflows. Not feature tours: a journey is one person, one
goal, and the artifact they hold when it worked. These are the promotion loop's
work queue, exercised in order of importance.

**A journey with no browser evidence is unfinished**, regardless of test status.

All baseline evidence below was captured on 2026-08-13 from a fresh clone of
`75876ea`, in headless Chrome at 1280x900 driven over CDP, against the demo
server started by `render/scripts/serve-demo.mjs`. Raw observations live in
`promotion/evidence/baseline/report*.json`.

## Journey shape

Each journey states, in this order:

- **Persona and situation** — who arrived, and why today.
- **Goal** — what they want to be true when they leave.
- **Steps** — what they actually do, in the UI, in order.
- **Done when** — the observable artifact or state that proves completion.
- **Evidence** — path to the capture that shows it working. Empty until proven.

---

## J1 — "I have five minutes; show me it actually runs"

- **Persona and situation:** An engineer picking a graph component for a product
  where an assistant streams findings onto a page. They found this repo from a
  README GIF, they do not believe GIFs, and they will give it one command before
  moving on.
- **Goal:** See the thing run locally, from a clean clone, with no account, no
  key, and no configuration.
- **Steps:**
  1. `git clone https://github.com/HomenShum/NodeGraph`
  2. `cd NodeGraph/render && npm install && npm run demo`
     (`render/package.json` -> `"demo": "node scripts/serve-demo.mjs"`)
  3. Open <http://127.0.0.1:4173> — `render/demo/index.html`.
  4. Watch the default "Dense constellation" scenario stream in, then stop.
- **Done when:** The stage shows a live graph whose counter climbs and settles
  (142 entities · 145 edges), and the motion stops on its own — the ingestion
  overlay measures lit pixels while events land and exactly 0 after decay.
- **Evidence:** `promotion/evidence/baseline/01-desktop-default.png` (mid-ingestion,
  129,273 lit overlay pixels), `02-desktop-decay.png` (0 lit pixels, 142 entities ·
  145 edges). `npm install` completed in 8s, exit 0.

## J2 — "Tell me which of these lines I'm allowed to believe"

- **Persona and situation:** A reviewer who has to sign off on a page an assistant
  produced. Their fear is the one this product was built around: a claim that was
  never measured sitting next to a measured count, looking identical.
- **Goal:** Establish, from the interface alone, which relationships are measured,
  which are someone else's published claim, and which are only interaction history
  — and see the receipt behind a claim.
- **Steps:**
  1. On <http://127.0.0.1:4173>, press the **Unknown vs zero** scenario chip.
  2. Click the node labelled "measured empty cohort", then the one labelled
     "unmeasured cohort", reading the selection panel each time.
  3. Press the **Assertion chain** chip.
  4. Click the "vemurafenib" node and read the `assertions` row.
  5. Uncheck the `assertion` box in the edge-type filter above the canvas.
- **Done when:** The selection readout distinguishes the two absences in words —
  `count 0` versus `count unknown — not measured` — and a curated claim discloses
  its source, release and receipt link rather than passing as a measurement;
  unchecking `assertion` drops the header from "5 of 5 relationships shown" to
  "1 of 5".
- **Evidence:** `promotion/evidence/baseline/18-zero-readout.png`
  ("count 0"), `18-unknown-readout.png` ("count unknown — not measured"),
  `09-selection-readout.png` ("BRAF V600E · Reactome v97 · receipt"),
  `11-filter-assertion-off.png` ("6 entities · 1 of 5 relationships shown").
  Readout strings recorded in `report4.json` and `report2.json`.

## J3 — "Can I push this node out of the way without changing what it means?"

- **Persona and situation:** The same reviewer, now trying to read an overlapping
  cluster. In most graph tools moving a node is either impossible mid-layout or it
  quietly means something.
- **Persona note:** this is the third trust rule — positions are layout, never
  meaning.
- **Goal:** Drag a node somewhere readable and be sure nothing the system believes
  changed.
- **Steps:**
  1. Press the **Drag playground** chip and let it settle (30 entities · 30 edges).
  2. Click a node to confirm what it is ("pathway 1").
  3. Drag it roughly 180 px left and 96 px up, and release.
  4. Re-read the counters and the filter header.
- **Done when:** The node is drawn at the drop point, the layout does not fight the
  cursor, and the graph's counts are byte-identical before and after
  (30 entities · 30 edges → 30 entities · 30 edges).
- **Evidence:** `promotion/evidence/baseline/19-drag-before.png` (pathway 1 at
  ~(420,560)), `20-drag-after.png` (pathway 1 at ~(255,463), counts unchanged).
  Selection string and both counter reads in `report5.json`.

## J4 — "Show me the two layers are one product, not two folders"

- **Persona and situation:** A tech lead deciding whether to adopt both halves.
  The front page claims the model layer and the renderer compose in ~15 lines and
  shows a screenshot of it; they want to run that screenshot.
- **Goal:** Watch the model layer turn a research room into a graph and the
  renderer draw it under the trust grammar, in their own browser.
- **Steps:**
  1. From the README, follow the `examples/compose` link.
  2. Look for the command that runs it.
  3. Open the page and read the summary line under the stage.
- **Done when:** The page renders the composed graph and states honestly that the
  model's relevance weight is not a measured count, so every relationship arrives
  as `traversal` — the refusal is the demo.
- **Evidence:** `promotion/evidence/baseline/13-compose.png` — **but reached by a
  static server I hand-wrote for the capture, not by any command in this repo.**
  Step 2 has no answer: `examples/compose` has no script in either
  `package.json`, is not mentioned in the Development or Example App sections,
  and its `compose.js` imports `../../dist/` and `../../render/dist/`, so it also
  needs both layers built first. Rendered result once served:
  "model: 54 nodes, 102 edges, 6 backed facts · rendered: 46 entities, 94
  relationships (all traversal …)", 0 console errors (`report3.json`).
  **Journey status: not drivable as documented.**

## J5 — "Let my own agent author the graph, and refuse it when it cuts corners"

- **Persona and situation:** Someone wiring an existing agent to this renderer over
  MCP. They specifically want to know what happens when the agent asserts a claim
  without a full receipt — because that is the failure that quietly poisons a graph.
- **Goal:** Drive a real MCP session and watch the boundary refuse an unreceipted
  claim, then see the accepted events show up in the viewer.
- **Steps:**
  1. `cd render && node mcp/client-demo.mjs` (`render/mcp/server.mjs` over stdio).
  2. Serve the repo and open `/mcp/viewer/` to watch the accepted-event rail.
- **Done when:** The refused claim never reaches the event log, and the viewer's
  rail shows only the accepted events.
- **Evidence:** Step 1 verified — `node mcp/client-demo.mjs` exit 0, output
  `receipted assert: accepted` / `unreceipted assert: refused — receipt.release
  must be a non-empty string` / `MCP SESSION COMPLETE — boundary held`. Step 2
  verified in **iteration 2** — `promotion/evidence/mcp-viewer/mcp-viewer-rail.png`
  and `mcp-viewer.json`, regenerated by `npm run proof:mcp-viewer`: 6 accepted
  events in the log, **0 refused claims in it**, the rail reading `6 accepted
  events replayed · 8 entities · 11 edges`, the receipt (`Reactome v97`) reached
  by keyboard and visible in the readout, 0 console errors. That frame is also
  the only capture in this repo showing all three trust classes at once.

  **Driving step 2 is what found why nobody had.** `GET /mcp/viewer/` — the URL
  this journey and the MCP README both name — returned **404**, because
  `serve-demo.mjs` mapped only `/` to an index file and any directory URL
  resolved to a directory rather than a file. Three waves recorded this journey
  as "not driven" without anyone discovering that the documented path did not
  serve. Fixed in `render/scripts/serve-demo.mjs`; defect D11.

---

## Journeys every agent surface owes

If this product runs an agent on the user's behalf, at least one journey must
exercise each of these, because they are where agent products fail a stranger:

- **Receipt** — covered by **J2**. After a consequential arrival (a curated claim
  landing beside measured content) the reader can open the node and see the source,
  the release, and a replay link.
- **Recovery** — covered in part by **J5**, and only outside the browser. NodeGraph
  does not run an agent for the user; it draws what someone else's agent produces.
  Its equivalent of "something went wrong mid-run" is a malformed batch, and the
  library's answer is to reject the whole batch before any partial graph is drawn.
  **Reachable from the UI since iteration 2:** the **Refused batch** chip sends an
  assertion whose release is empty, the session refuses the whole batch, and the
  renderer says so under the stage in `role="alert"` — "Batch refused, nothing
  drawn: receipt.release must be a non-empty string. The graph still shows the
  last accepted state." `promotion/evidence/wig/state-error.png`.
- **Steering** — **does not apply, deliberately.** There is no agent here to
  correct. The nearest analogue is the reader changing what is shown — the
  edge-type filters and the drag in J2 and J3 — and neither changes what the
  system believes, by design. Recording this as a decision, not an omission.
