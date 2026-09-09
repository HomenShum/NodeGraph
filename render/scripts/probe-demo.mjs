import assert from "node:assert/strict";
import { startDemoServer } from "./serve-demo.mjs";

const server = await startDemoServer();
const get = async (path) => {
  const response = await fetch(`${server.url}${path}`, { signal: AbortSignal.timeout(2_000) });
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    assert.ok(bytes <= 1_000_000, "demo response exceeded 1 MB");
    chunks.push(chunk);
  }
  return { status: response.status, body: Buffer.concat(chunks).toString("utf8") };
};
try {
  const html = await get("/");
  const demo = await get("/demo/demo.js");
  const component = await get("/dist/react.js");
  const proof = {
    htmlStatus: html.status,
    title: html.body.includes("NodeGraph Live"),
    scenarioRail: html.body.includes('id="scenarios"'),
    demoStatus: demo.status,
    assertionReceipt: demo.body.includes("subjectId"),
    componentStatus: component.status,
  };
  assert.ok(Object.values(proof).every((value) => value === true || value === 200), JSON.stringify(proof));
  process.stdout.write(`${JSON.stringify(proof)}\n`);
} finally {
  await server.close();
}
