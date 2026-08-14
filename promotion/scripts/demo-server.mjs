/**
 * Start the demo server for a proof, and be certain it is OURS.
 *
 * The baseline wave recorded a probe that graded an 11-hour-old orphaned
 * `serve-demo.mjs` squatting on the hardcoded port: the child lost the bind,
 * exited, and the probe happily measured a stranger's tree. So this waits for
 * the CHILD's own listening line, not for the port to answer, and throws
 * naming the port when the child dies instead.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export async function startDemoServer(port) {
  const child = spawn(process.execPath, ["render/scripts/serve-demo.mjs"], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODEGRAPH_DEMO_PORT: String(port) },
    windowsHide: true,
  });
  await new Promise((ok, fail) => {
    child.stdout.once("data", ok);
    child.once("exit", (code) =>
      fail(new Error(`demo server exited (${code}) — port ${port} is held by another process`)),
    );
    setTimeout(() => fail(new Error("demo server never announced itself")), 10_000).unref();
  });
  return {
    url: `http://127.0.0.1:${port}/`,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill();
      await Promise.race([
        new Promise((done) => child.once("exit", done)),
        new Promise((done) => setTimeout(done, 2_000)),
      ]);
    },
  };
}
