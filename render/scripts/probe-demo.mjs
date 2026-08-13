import { spawn } from "node:child_process";

// The same knob serve-demo.mjs reads. Without it this probe spawned its own
// server and then graded whatever already held 4173 — a stale server from an
// earlier session silently passed as this clone once, in this repo.
const port = Number(process.env.NODEGRAPH_DEMO_PORT ?? 4173);

const child = spawn(process.execPath, ["scripts/serve-demo.mjs"], {
  cwd: new URL("../", import.meta.url),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

// Wait for OUR server to announce itself, not for the port to answer. If the
// port is already held, the child dies and every fetch below would still
// succeed — against the stranger. That has happened here: a run once graded an
// 11-hour-old server from an earlier session.
const listening = new Promise((resolveReady, rejectReady) => {
  child.stdout.once("data", resolveReady);
  child.once("exit", (code) =>
    rejectReady(new Error(`demo server exited (${code}) — port ${port} is held by another process`)),
  );
  setTimeout(() => rejectReady(new Error("demo server never announced itself")), 10_000).unref();
});

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const get = async (path) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    signal: AbortSignal.timeout(2_000),
  });
  return { status: response.status, body: await response.text() };
};

try {
  await listening;
  let html;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      html = await get("/");
      break;
    } catch {
      await wait(100);
    }
  }
  if (!html) throw new Error("demo server did not become reachable");
  const demo = await get("/demo/demo.js");
  const component = await get("/dist/react.js");
  const proof = {
    htmlStatus: html.status,
    title: html.body.includes("NodeGraph Live"),
    // The control rail the README tells a first-time reader to press. It was
    // `#add-branch` until the ten-scenario gallery replaced the single-branch
    // demo; the assertion outlived the button and failed every fresh clone.
    scenarioRail: html.body.includes('id="scenarios"'),
    demoStatus: demo.status,
    assertionReceipt: demo.body.includes("subjectId"),
    componentStatus: component.status,
  };
  if (Object.values(proof).some((value) => value !== true && value !== 200)) {
    throw new Error(`demo proof failed: ${JSON.stringify(proof)}`);
  }
  process.stdout.write(`${JSON.stringify(proof)}\n`);
} finally {
  child.kill();
}
