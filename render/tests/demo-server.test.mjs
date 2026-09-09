import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { startDemoServer } from "../scripts/serve-demo.mjs";

test("a developer can serve two checkouts concurrently without grading a stranger's port", { timeout: 15_000 }, async () => {
  const first = await startDemoServer();
  let second;
  try {
    second = await startDemoServer();
    assert.notEqual(first.url, second.url);
    await assert.rejects(startDemoServer({ port: Number(new URL(first.url).port) }), /EADDRINUSE/);
    for (const server of [first, second]) {
      const response = await fetch(`${server.url}/`, { signal: AbortSignal.timeout(2000) });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /NodeGraph Live/);
      const head = await fetch(`${server.url}/demo/demo.js`, { method: "HEAD", signal: AbortSignal.timeout(2000) });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), "");
    }
  } finally {
    if (second) await second.close();
    await first.close();
  }
  await assert.rejects(fetch(`${first.url}/`, { signal: AbortSignal.timeout(2000) }));
});

test("a developer's private files stay inaccessible through malformed requests, links and repeated bursts", { timeout: 15_000 }, async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "nodegraph-http-"));
  const root = resolve(fixture, "public");
  await mkdir(resolve(root, "demo"), { recursive: true });
  await mkdir(resolve(root, ".nodegraph"));
  await mkdir(resolve(root, ".private"));
  await mkdir(resolve(fixture, "outside"));
  await writeFile(resolve(root, "demo/index.html"), "<h1>fixture viewer</h1>");
  await writeFile(resolve(root, ".env"), "synthetic-private-marker");
  await writeFile(resolve(root, ".private/data.json"), '{"value":"synthetic-private-marker"}\n');
  await writeFile(resolve(root, "demo/public.js"), "/* public fixture */\n");
  await writeFile(resolve(root, ".nodegraph/events.jsonl"), '{"accepted":true}\n');
  await writeFile(resolve(fixture, "outside/private.js"), "synthetic-private-marker");
  await symlink(resolve(fixture, "outside"), resolve(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  for (const [target, alias] of [[".private/data.json", "alias-json.js"], [".env", "alias-env.js"], ["demo/public.js", "alias-public.js"], [".nodegraph/events.jsonl", "alias-events.jsonl"]]) {
    await symlink(resolve(root, target), resolve(root, alias), "file");
  }
  const server = await startDemoServer({ root });
  try {
    // Ten waves of concurrent reads exercise error recovery and stream closure.
    for (let wave = 0; wave < 10; wave++) {
      await Promise.all(["/.env", "/%2eenv", "/.private/data.json", "/alias-json.js", "/alias-env.js", "/alias-events.jsonl", "/linked/private.js", "/missing.js", "/%ZZ", "/demo/index.html"].map(async (path) => {
        const response = await fetch(`${server.url}${path}`, { signal: AbortSignal.timeout(2000) });
        const body = await response.text();
        assert.equal(response.status, path === "/demo/index.html" ? 200 : path === "/missing.js" || path === "/%ZZ" ? 404 : 403);
        assert.ok(!body.includes("synthetic-private-marker"));
      }));
      const publicAlias = await fetch(`${server.url}/alias-public.js`, { signal: AbortSignal.timeout(2000) });
      assert.equal(publicAlias.status, 200);
      assert.equal(publicAlias.headers.get("content-type"), "text/javascript; charset=utf-8");
      assert.equal(await publicAlias.text(), "/* public fixture */\n");
    }
    const aliasHead = await fetch(`${server.url}/alias-public.js`, { method: "HEAD", signal: AbortSignal.timeout(2000) });
    assert.equal(aliasHead.status, 200);
    assert.equal(aliasHead.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(await aliasHead.text(), "");
    const write = await fetch(`${server.url}/`, { method: "POST", body: "ignored", signal: AbortSignal.timeout(2000) });
    assert.equal(write.status, 405);
    await write.text();
    const events = await fetch(`${server.url}/.nodegraph/events.jsonl`, { signal: AbortSignal.timeout(2000) });
    assert.equal(events.status, 200);
    assert.equal(await events.text(), '{"accepted":true}\n');
  } finally {
    await server.close();
    assert.ok(fixture.startsWith(resolve(tmpdir()) + sep + "nodegraph-http-"));
    await rm(fixture, { recursive: true });
  }
});
