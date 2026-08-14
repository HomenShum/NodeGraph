# Journey J5, second half — the agent-authored rail in a browser

**Producer:** [`promotion/scripts/prove-mcp-viewer.mjs`](../../scripts/prove-mcp-viewer.mjs)
**Regenerate:** `npm run proof:mcp-viewer` (exit 0 = journey drivable)

## Why this exists

J5 is "let my own agent author the graph, and refuse it when it cuts corners".
Its first half always passed: `node mcp/client-demo.mjs` runs a real MCP
session and the server refuses an assertion that arrives without a replay
receipt. Its second half — *the viewer shows only what survived* — had never
been driven in a browser, and that single gap was the whole reason gate
condition 1 stayed FAIL after wave 3 closed the other four journeys.

Driving it found the reason it had never been driven: **`/mcp/viewer/` 404'd.**
`serve-demo.mjs` mapped only `/` to an index file, so the directory URL that
`PRODUCT_JOURNEYS.md` and the MCP README both tell the reader to open resolved
to a directory, failed the is-a-file check, and returned 404. Fixed in
`render/scripts/serve-demo.mjs`: a trailing slash now serves that directory's
`index.html`, and the path-traversal refusal above it is untouched.

## What the artifact proves

`mcp-viewer.json`, from a real session each run:

- The MCP session exits 0 and prints `MCP SESSION COMPLETE — boundary held`.
- **The refused claim is absent from the accepted-event log** — the file is
  read directly and searched for `mcp:assert-bad`. This is the check that
  matters; a log that quietly kept the bad claim would still draw a handsome
  graph.
- The viewer replays every accepted event and says so in its own words
  (`6 accepted events replayed · 8 entities · 11 edges`), and the number it
  reports equals the number of lines in the file.
- The accepted assertion reached the DRAWING, not just the file: the proof
  walks the graph with the arrow keys until the readout shows the receipt, and
  asserts on `Reactome`.
- Zero console errors.

`mcp-viewer-rail.png` is the frame. It is also the only capture in this repo
where all three trust classes appear at once — a violet receipted assertion, a
thick measured evidence edge, and faint traversal history — with the readout
below showing `count unknown — not measured` for a node nobody counted.
