import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { GraphSession } from "../dist/index.js";

const server = fileURLToPath(new URL("../mcp/server.mjs", import.meta.url));
const MAX_RECORD_BYTES = 1024 * 1024;
const initial = {
  entities: [{ kind: "finding", label: "Before restart" }],
  measuredCount: 7,
  eventId: "restart:one",
};
const assertion = {
  a: { kind: "finding", label: "Before restart" },
  b: { kind: "finding", label: "Independent source" },
  receipt: {
    source: "Synthetic source", release: "v1", subjectId: "finding:1",
    objectId: "finding:2", url: "https://example.com/receipt",
  },
  eventId: "restart:assertion",
};
const line = (type, payload) => JSON.stringify({ ts: 1, type, ...payload }) + "\n";
const records = async (file) => (await readFile(file, "utf8")).trim().split("\n").map(JSON.parse);

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "nodegraph-mcp-restart-"));
  t.diagnostic(`Retained synthetic event files: ${dir}`);
  return dir;
}

function writer(t, events) {
  const child = spawn(process.execPath, [server, "--events", events], {
    windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  let next = 0;
  const pending = new Map();
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-65536); });
  const output = createInterface({ input: child.stdout });
  output.on("line", (raw) => {
    const reply = JSON.parse(raw);
    const request = pending.get(reply.id);
    if (request) {
      clearTimeout(request.timer);
      pending.delete(reply.id);
      request.resolve(reply.result);
    }
  });
  const closed = new Promise((resolve) => child.once("close", (code, signal) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(`writer exited (${code}): ${stderr}`));
    }
    pending.clear();
    resolve({ code, signal, stderr });
  }));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 2000);
      try { await closed; } finally { clearTimeout(timer); }
    }
    output.close();
    return closed;
  };
  t.after(stop);
  return {
    stop,
    closed,
    rpc(method, params) {
      assert.ok(pending.size < 8, "the real client has at most eight requests in flight");
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`request ${id} timed out: ${stderr}`));
        }, 10000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    },
    call(name, args) { return this.rpc("tools/call", { name, arguments: args }); },
  };
}

test("an analyst's queued retries survive writer restart without hiding the next finding", { timeout: 30000 }, async (t) => {
  const file = join(await fixture(t), "events.jsonl");
  const a = writer(t, file);
  await a.rpc("initialize", { protocolVersion: "2025-06-18" });
  assert.equal((await a.call("observe", initial)).isError, false);
  assert.equal((await a.call("observe", { ...initial, measuredCount: 9 })).isError, true);
  assert.equal((await a.call("assert_edge", assertion)).isError, false);
  assert.equal((await a.stop()).code, 0);

  const b = writer(t, file);
  // Queue real protocol input immediately, before startup replay has completed.
  const [ready, conflict, changedReceipt, retry, later] = await Promise.all([
    b.rpc("initialize", { protocolVersion: "2025-06-18" }),
    b.call("observe", { ...initial, measuredCount: 9 }),
    b.call("assert_edge", { ...assertion, receipt: { ...assertion.receipt, release: "v2" } }),
    b.call("observe", { eventId: initial.eventId, measuredCount: 7, entities: initial.entities }),
    b.call("observe", { entities: [{ kind: "finding", label: "Later valid" }], measuredCount: 11, eventId: "restart:later" }),
  ]);
  assert.equal(ready.serverInfo.name, "nodegraph-mcp");
  assert.equal(conflict.isError, true);
  assert.match(conflict.content[0].text, /reused with different content/);
  assert.equal(changedReceipt.isError, true);
  assert.equal(retry.isError, false);
  assert.equal(later.isError, false);
  assert.equal((await b.stop()).code, 0);
  const saved = await records(file);
  assert.equal(saved.length, 4, "only accepted calls are appended, including the exact retry");
  const viewer = new GraphSession();
  for (const event of saved) {
    if (event.type === "observe") viewer.observe(event.entities, event.measuredCount, { eventId: event.eventId });
    else viewer.assertEdge(event.a, event.b, event.receipt, { eventId: event.eventId });
  }
  assert.equal(viewer.getSnapshot().nodes.find((node) => node.label === "Before restart").count, 7);
  assert.equal(viewer.getSnapshot().nodes.find((node) => node.label === "Later valid").count, 11);
  assert.equal(viewer.getSnapshot().turns, 2, "an exact retry does not strengthen the graph");
});

test("a recovering operator gets no success for damaged history and retains every original byte", { timeout: 30000 }, async (t) => {
  const dir = await fixture(t);
  const good = line("observe", initial);
  const histories = {
    malformed: good + "{broken}\n",
    whitespace: good + " \t\n" + good,
    bom: good + "\uFEFF" + good,
    unknown: good + line("invented", initial),
    conflict: good + line("observe", { ...initial, measuredCount: 9 }),
    unterminated: good + line("observe", { ...initial, eventId: "last" }).trimEnd(),
    truncated: good + '{"type":"observe"',
    oversized: good + line("observe", { ...initial, entities: [{ kind: "finding", label: "x".repeat(MAX_RECORD_BYTES) }] }),
    invalidUtf8: Buffer.concat([Buffer.from(good + '{"type":"'), Buffer.from([0xff]), Buffer.from('"}\n')]),
  };
  for (const [name, history] of Object.entries(histories)) {
    const file = join(dir, `${name}.jsonl`);
    await writeFile(file, history);
    const before = await readFile(file);
    const child = writer(t, file);
    await assert.rejects(child.rpc("initialize", {}), /writer exited/);
    const exit = await child.closed;
    assert.notEqual(exit.code, 0, `${name} must refuse startup`);
    assert.match(exit.stderr, /event log|history|record/i);
    assert.deepEqual(await readFile(file), before, `${name} evidence must not be rewritten`);
  }
  const unreadable = writer(t, dir);
  await assert.rejects(unreadable.rpc("initialize", {}), /writer exited/);
  assert.notEqual((await unreadable.closed).code, 0, "only ENOENT may mean an empty history");
});

test("a long-running analyst retains FIFO conflict protection through bursts, duplicate retries and restart", { timeout: 60000 }, async (t) => {
  const file = join(await fixture(t), "events.jsonl");
  const a = writer(t, file);
  // Reuse one node to isolate receipt retention from the separate node/edge limits.
  for (let start = 0; start < 5000; start += 8) {
    const replies = await Promise.all(Array.from({ length: Math.min(8, 5000 - start) }, (_, i) =>
      a.call("observe", { ...initial, eventId: `shift:${start + i}`, measuredCount: start + i })));
    assert.ok(replies.every((reply) => reply.isError === false));
  }
  for (let i = 0; i < 16; i++) {
    assert.equal((await a.call("observe", { ...initial, eventId: "shift:4999", measuredCount: 4999 })).isError, false);
  }
  await a.stop();
  const b = writer(t, file);
  assert.equal((await b.call("observe", { ...initial, eventId: "shift:0", measuredCount: 99 })).isError, true,
    "duplicate lines must not evict the oldest receipt during startup replay");
  assert.equal((await b.call("observe", { ...initial, eventId: "shift:5000", measuredCount: 5000 })).isError, false);
  assert.equal((await b.call("observe", { ...initial, eventId: "shift:0", measuredCount: 99 })).isError, false,
    "a genuinely expired receipt is reusable; restart must not promise permanent dedupe");
  assert.equal((await b.call("observe", { ...initial, eventId: "shift:4999", measuredCount: 99 })).isError, true);
  await b.stop();
  assert.equal((await records(file)).length, 5018);
});

test("an oversized tool result cannot poison receipt state or make its accepted retry unreplayable", { timeout: 30000 }, async (t) => {
  const dir = await fixture(t);
  const file = join(dir, "events.jsonl");
  const a = writer(t, file);
  await a.call("observe", initial);
  const before = await readFile(file);
  const rejected = await a.call("observe", { entities: [{ kind: "finding", label: "é".repeat(MAX_RECORD_BYTES / 2) }], eventId: "size:retry" });
  assert.equal(rejected.isError, true);
  assert.match(rejected.content[0].text, /1048576|1 MiB/);
  assert.deepEqual(await readFile(file), before);
  assert.equal((await a.call("observe", { ...initial, eventId: "size:retry", measuredCount: 12 })).isError, false);
  await a.stop();
  const b = writer(t, file);
  assert.equal((await b.call("observe", { ...initial, eventId: "size:retry", measuredCount: 13 })).isError, true);
  await b.stop();
  assert.equal((await records(file)).length, 2);

  const boundary = { entities: [{ kind: "finding", label: "" }], eventId: "exact-bound" };
  boundary.entities[0].label = "x".repeat(MAX_RECORD_BYTES - Buffer.byteLength(line("observe", boundary)));
  const exact = line("observe", boundary);
  assert.equal(Buffer.byteLength(exact), MAX_RECORD_BYTES);
  const boundaryFile = join(dir, "exact-boundary.jsonl");
  await writeFile(boundaryFile, exact);
  const c = writer(t, boundaryFile);
  assert.equal((await c.call("observe", { ...initial, eventId: "exact-bound" })).isError, true,
    "an exactly permitted record, including its newline, must restore the remembered identity");
  assert.equal((await c.call("observe", initial)).isError, false);
  await c.stop();
  assert.ok((await readFile(boundaryFile, "utf8")).startsWith(exact));
});
