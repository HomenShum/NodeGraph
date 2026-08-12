#!/usr/bin/env node
/**
 * nodegraph-mcp: any MCP-speaking agent becomes a graph author.
 *
 * A handwritten stdio MCP server (JSON-RPC 2.0, newline-delimited) exposing
 * two tools — `observe` and `assert_edge` — validated by the REAL
 * GraphSession, so the trust grammar is enforced at the protocol boundary:
 * an assert_edge without a complete replay receipt (source, release, both
 * stable ids, an http(s) URL) is refused with the session's own error, and
 * an invented count is refused by the same validator the React panel uses.
 * Accepted events append to .nodegraph/events.jsonl; the bundled viewer
 * (mcp/viewer/) tails that file into a live rail.
 *
 *   node mcp/server.mjs [--events <path>]
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { GraphSession } from "../dist/index.js";

const eventsArg = process.argv.indexOf("--events");
const EVENTS = resolve(
  eventsArg > -1 ? process.argv[eventsArg + 1] : ".nodegraph/events.jsonl",
);
mkdirSync(dirname(EVENTS), { recursive: true });

// The session IS the validator. Its state also dedupes eventIds, so a
// retried tool call is idempotent exactly like the in-browser session.
const session = new GraphSession({ maxNodes: 1000, maxEdges: 3000, maxSeen: 5000 });

const TOOLS = [
  {
    name: "observe",
    description:
      "Record entities an agent step actually used. Two entities plus a " +
      "measured count draw an evidence edge; three or more draw traversal " +
      "history; no count means the entity renders 'unknown — not measured'. " +
      "Never pass a count you did not measure.",
    inputSchema: {
      type: "object",
      required: ["entities"],
      properties: {
        entities: {
          type: "array", minItems: 1,
          items: {
            type: "object", required: ["kind", "label"],
            properties: { kind: { type: "string" }, label: { type: "string" } },
          },
        },
        measuredCount: { type: "number", description: "ONLY a real measured count." },
        eventId: { type: "string" },
      },
    },
  },
  {
    name: "assert_edge",
    description:
      "Record a curated claim between two entities. REFUSED unless the " +
      "receipt carries source, release, subjectId, objectId, and an http(s) " +
      "url — a claim without a replayable receipt does not enter the graph.",
    inputSchema: {
      type: "object",
      required: ["a", "b", "receipt"],
      properties: {
        a: { type: "object", required: ["kind", "label"] },
        b: { type: "object", required: ["kind", "label"] },
        receipt: {
          type: "object",
          required: ["source", "release", "subjectId", "objectId", "url"],
        },
        eventId: { type: "string" },
      },
    },
  },
];

const record = (type, payload) => {
  appendFileSync(EVENTS, JSON.stringify({ ts: Date.now(), type, ...payload }) + "\n");
};

const call = (name, args) => {
  if (name === "observe") {
    session.observe(args.entities, args.measuredCount, { eventId: args.eventId });
    record("observe", { entities: args.entities, measuredCount: args.measuredCount, eventId: args.eventId });
    const s = session.getSnapshot();
    return `observed ${args.entities.length} entities; graph now ${s.nodes.length} entities / ${s.edges.length} edges`;
  }
  if (name === "assert_edge") {
    session.assertEdge(args.a, args.b, args.receipt, { eventId: args.eventId });
    record("assert_edge", { a: args.a, b: args.b, receipt: args.receipt, eventId: args.eventId });
    return `asserted ${args.a.label} -> ${args.b.label} (${args.receipt.source} ${args.receipt.release})`;
  }
  throw new Error(`unknown tool: ${name}`);
};

const respond = (id, result) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const fail = (id, message) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (method === "initialize") {
    respond(id, {
      protocolVersion: params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "nodegraph-mcp", version: "0.1.0" },
    });
  } else if (method === "notifications/initialized") {
    // notification, no response
  } else if (method === "tools/list") {
    respond(id, { tools: TOOLS });
  } else if (method === "tools/call") {
    try {
      const text = call(params.name, params.arguments ?? {});
      respond(id, { content: [{ type: "text", text }], isError: false });
    } catch (err) {
      // The refusal path: the session's validation error goes back to the
      // agent verbatim, and NOTHING is recorded to the event log.
      respond(id, { content: [{ type: "text", text: String(err?.message ?? err) }], isError: true });
    }
  } else if (id !== undefined) {
    fail(id, `unsupported method: ${method}`);
  }
});
