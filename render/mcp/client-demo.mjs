/**
 * A real MCP JSON-RPC session against the server: initialize, list tools,
 * observe a research trail, assert one receipted claim, then attempt one
 * UNRECEIPTED claim and require the refusal. Exits nonzero if the refusal
 * does not happen — the boundary is the test.
 *
 *   node mcp/client-demo.mjs [--events <path>]
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const extra = process.argv.slice(2);
const server = spawn(process.execPath, [resolve(here, "server.mjs"), ...extra], {
  stdio: ["pipe", "pipe", "inherit"],
});

const pending = new Map();
let nextId = 1;
createInterface({ input: server.stdout }).on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  const waiter = pending.get(msg.id);
  if (waiter) { pending.delete(msg.id); waiter(msg); }
});
const rpc = (method, params) =>
  new Promise((ok) => {
    const id = nextId++;
    pending.set(id, ok);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });

const init = await rpc("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "client-demo" } });
console.log("server:", init.result.serverInfo.name);
const tools = await rpc("tools/list", {});
console.log("tools:", tools.result.tools.map((t) => t.name).join(", "));

const observe = (entities, measuredCount, eventId) =>
  rpc("tools/call", { name: "observe", arguments: { entities, measuredCount, eventId } });

// A research trail: what an agent actually touched, step by step.
await observe([{ kind: "condition", label: "melanoma" }], 3743, "mcp:base");
await observe([{ kind: "condition", label: "melanoma" }, { kind: "intervention", label: "pembrolizumab" }], 120, "mcp:conj");
await observe([{ kind: "intervention", label: "pembrolizumab" }, { kind: "protein", label: "PD-1" }, { kind: "tool", label: "chembl lookup" }], undefined, "mcp:hop1");
await observe([{ kind: "protein", label: "PD-1" }, { kind: "pathway", label: "Co-inhibition by PD-1" }, { kind: "tool", label: "reactome lookup" }], undefined, "mcp:hop2");
await observe([{ kind: "sponsor", label: "Merck" }, { kind: "intervention", label: "pembrolizumab" }, { kind: "session", label: "sponsor scan" }], undefined, "mcp:hop3");

// One RECEIPTED claim — accepted.
const good = await rpc("tools/call", {
  name: "assert_edge",
  arguments: {
    a: { kind: "protein", label: "PD-1" },
    b: { kind: "pathway", label: "Co-inhibition by PD-1" },
    receipt: {
      source: "Reactome", release: "v97",
      subjectId: "Q15116", objectId: "R-HSA-389948",
      url: "https://reactome.org/ContentService/data/mapping/UniProt/Q15116/pathways",
    },
    eventId: "mcp:assert-good",
  },
});
console.log("receipted assert:", good.result.isError ? "REFUSED (BUG)" : "accepted");

// One UNRECEIPTED claim — must be refused.
const bad = await rpc("tools/call", {
  name: "assert_edge",
  arguments: {
    a: { kind: "intervention", label: "pembrolizumab" },
    b: { kind: "pathway", label: "Co-inhibition by PD-1" },
    receipt: { source: "a blog post" },
    eventId: "mcp:assert-bad",
  },
});
console.log("unreceipted assert:", bad.result.isError ? `refused — ${bad.result.content[0].text.slice(0, 80)}` : "ACCEPTED (BUG)");

server.stdin.end();
if (!bad.result.isError || good.result.isError) {
  console.error("MCP BOUNDARY TEST FAILED");
  process.exit(1);
}
console.log("MCP SESSION COMPLETE — boundary held");
