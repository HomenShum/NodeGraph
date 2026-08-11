import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["scripts/serve-demo.mjs"], {
  cwd: new URL("../", import.meta.url),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const get = async (path) => {
  const response = await fetch(`http://127.0.0.1:4173${path}`, {
    signal: AbortSignal.timeout(2_000),
  });
  return { status: response.status, body: await response.text() };
};

try {
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
    liveButton: html.body.includes("Add another live branch"),
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
