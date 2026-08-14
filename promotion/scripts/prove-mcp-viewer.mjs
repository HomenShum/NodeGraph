/**
 * PROOF: journey J5's second half — the agent-authored rail, in a browser.
 *
 * J5 is "let my own agent author the graph, and refuse it when it cuts
 * corners". Its first half has always passed: `node mcp/client-demo.mjs` runs
 * a real MCP session and the server refuses an assertion with no replay
 * receipt. Its second half — "the viewer's rail shows only the accepted
 * events" — had never been driven in a browser, which is the single reason
 * gate condition 1 stayed FAIL after wave 3 closed the other four journeys.
 *
 * This drives it:
 *
 *   1. Runs the real MCP session, writing the accepted-event log the server
 *      appends to (`render/.nodegraph/events.jsonl`).
 *   2. Reads that file directly and asserts the refused claim is ABSENT from
 *      it. The refusal is the product; a log that quietly kept the bad claim
 *      would still render a pretty graph.
 *   3. Serves `render/` and opens `/mcp/viewer/` in headless Chromium, waits
 *      for the tail to replay, and reads the rail's own line back.
 *   4. Asserts the replayed count equals the number of lines in the log, that
 *      the receipted assertion IS on the drawing (its release badge appears in
 *      the readout), and that the page logged no console errors.
 *
 * Run (after `npm install` at the root and `cd render && npm install &&
 * npm run build`):
 *
 *     node promotion/scripts/prove-mcp-viewer.mjs
 *     npm run proof:mcp-viewer
 *
 * Env: NODEGRAPH_DEMO_PORT (default 4910), NODEGRAPH_EVIDENCE_DIR.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { REPO, startDemoServer } from "./demo-server.mjs";

const PORT = Number(process.env.NODEGRAPH_DEMO_PORT ?? 4910);
const OUT = resolve(process.env.NODEGRAPH_EVIDENCE_DIR ?? resolve(REPO, "promotion/evidence/mcp-viewer"));
const LOG = resolve(REPO, "render/.nodegraph/events.jsonl");

mkdirSync(OUT, { recursive: true });
// A stale log from an earlier run would make the replay count meaningless, and
// the eventIds are fixed strings so a second session appends nothing new.
rmSync(resolve(REPO, "render/.nodegraph"), { recursive: true, force: true });

const session = spawnSync(process.execPath, ["mcp/client-demo.mjs"], {
  cwd: resolve(REPO, "render"),
  encoding: "utf8",
  timeout: 120_000,
});
const sessionOutput = `${session.stdout ?? ""}${session.stderr ?? ""}`.trim();
if (session.status !== 0) throw new Error(`mcp/client-demo.mjs exited ${session.status}\n${sessionOutput}`);

const lines = readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const refusedInLog = lines.filter((e) => e.eventId === "mcp:assert-bad");
const acceptedAssert = lines.filter((e) => e.type === "assert_edge");

const server = await startDemoServer(PORT);
const browser = await chromium.launch();
let rail = null;
let readout = null;
const consoleErrors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  await page.goto(`${server.url}mcp/viewer/`, { waitUntil: "load" });
  // The tail polls once a second; the layout then settles.
  await page.waitForFunction(() => (document.querySelector("#log")?.textContent ?? "").length > 0, null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(6_000);
  rail = (await page.locator("#log").textContent())?.trim() ?? null;
  // Walk to the receipted claim with the keyboard and read the release badge
  // out of the readout: proof the accepted assertion reached the DRAWING, not
  // just the file.
  await page.locator('[data-testid="nodegraph-canvas"]').focus();
  for (let i = 0; i < 40 && !/Reactome/.test(readout ?? ""); i += 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(60);
    readout = (await page.locator('[data-testid="nodegraph-readout"]').textContent())?.replace(/\s+/g, " ").trim() ?? null;
  }
  await page.screenshot({ path: resolve(OUT, "mcp-viewer-rail.png") });
} finally {
  await browser.close();
  await server.stop();
}

const replayed = Number(/^(\d+) accepted events replayed/.exec(rail ?? "")?.[1] ?? -1);
const checks = {
  sessionExitCode: session.status,
  boundaryHeld: sessionOutput.includes("MCP SESSION COMPLETE — boundary held"),
  refusalReported: /unreceipted assert: refused/.test(sessionOutput),
  acceptedEventsInLog: lines.length,
  refusedClaimInLog: refusedInLog.length,
  acceptedAssertionsInLog: acceptedAssert.length,
  railText: rail,
  eventsReplayedInBrowser: replayed,
  receiptVisibleInReadout: /Reactome/.test(readout ?? ""),
  readout,
  consoleErrors,
};
const failures = [
  checks.boundaryHeld ? null : "the MCP session did not report the boundary holding",
  checks.refusalReported ? null : "the unreceipted assertion was not refused",
  checks.refusedClaimInLog === 0 ? null : "the refused claim reached the accepted-event log",
  checks.acceptedAssertionsInLog === 1 ? null : `expected exactly 1 accepted assertion, found ${checks.acceptedAssertionsInLog}`,
  replayed === lines.length ? null : `viewer replayed ${replayed} of ${lines.length} accepted events`,
  checks.receiptVisibleInReadout ? null : "the accepted assertion's receipt never appeared in the readout",
  consoleErrors.length === 0 ? null : `console errors: ${consoleErrors.join(" | ")}`,
].filter(Boolean);

writeFileSync(
  resolve(OUT, "mcp-viewer.json"),
  `${JSON.stringify({ journey: "J5", provedAt: new Date().toISOString(), verdict: failures.length === 0 ? "PASS" : "FAIL", failures, checks, sessionOutput }, null, 2)}\n`,
);
process.stdout.write(
  `${failures.length === 0 ? "PASS" : "FAIL"} — ${lines.length} accepted events in the log, ` +
    `${refusedInLog.length} refused claims in it, viewer replayed ${replayed}, ${consoleErrors.length} console errors\n`,
);
for (const f of failures) process.stdout.write(`  ${f}\n`);
if (failures.length > 0) process.exitCode = 1;
