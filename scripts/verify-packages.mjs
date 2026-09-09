import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import { chromium, expect } from "playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = resolve(root, ".proofloop");
mkdirSync(artifacts, { recursive: true });
const out = mkdtempSync(resolve(artifacts, "packages-"));
// Outside the repository: a missing dependency cannot resolve through this
// checkout's node_modules and turn a broken tarball into a false pass.
// Windows runners expose TEMP through an 8.3 alias. Vite resolves one copy
// but keys its inline-module cache with the other unless the root is canonical.
const temporaryRoot = realpathSync(tmpdir());
const consumer = mkdtempSync(resolve(temporaryRoot, "nodegraph-consumer-"));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "Run through npm run verify:packages so npm's CLI path is explicit");
let sequence = 0;
const run = (args, cwd) => {
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: 180_000, maxBuffer: 4_000_000, windowsHide: true });
  writeFileSync(resolve(out, `${++sequence}.json`), JSON.stringify({ cwd, args, status: result.status, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }, null, 2));
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`);
  return result.stdout;
};
try {
  for (const pkg of [root, resolve(root, "render")]) run([npmCli, "run", "build"], pkg);
  const packages = [];
  for (const pkg of [root, resolve(root, "render")]) {
    const packed = JSON.parse(run([npmCli, "pack", "--json", "--pack-destination", out], pkg));
    assert.equal(packed.length, 1);
    packages.push(resolve(out, packed[0].filename));
  }
  const rootPackage = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  writeFileSync(resolve(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run([npmCli, "install", "--ignore-scripts", "--no-fund", ...packages, `react@${rootPackage.devDependencies.react}`, `react-dom@${rootPackage.devDependencies["react-dom"]}`, "@types/react@19", "typescript@5"], consumer);
  writeFileSync(resolve(consumer, "consumer.mjs"), readFileSync(new URL("./package-consumer.mjs", import.meta.url)));
  run([resolve(consumer, "consumer.mjs")], consumer);
  writeFileSync(resolve(consumer, "consumer.ts"), [
    'import { buildSemanticGraph, type SemanticGraphViewModel } from "@homenshum/nodegraph";',
    'import { GraphSession } from "@homenshum/nodegraph-live/core";',
    'import { NodeGraph, type NodeGraphProps } from "@homenshum/nodegraph-live/react";',
    'const graph: SemanticGraphViewModel = buildSemanticGraph({ roomId: "handoff", artifacts: [] });',
    'const props: NodeGraphProps = new GraphSession().getSnapshot();',
    'void [graph, props, NodeGraph];',
  ].join("\n"));
  run([resolve(consumer, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "consumer.ts"], consumer);
  // The React entry requires browser WebGL globals. Build the public export
  // for its supported host instead of pretending a Node-only import proves it.
  writeFileSync(resolve(consumer, "index.html"), readFileSync(new URL("./package-browser.html", import.meta.url)));
  const dist = resolve(out, "consumer-dist");
  await build({ root: consumer, configFile: false, build: { outDir: dist, emptyOutDir: false } });
  const browserStates = [];
  if (process.argv.includes("--browser")) {
    const server = await preview({ root: consumer, configFile: false, build: { outDir: dist }, preview: { host: "127.0.0.1", port: 0, strictPort: true } });
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const url = `http://127.0.0.1:${server.httpServer.address().port}`;
      for (const width of [390, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => { if (errors.length < 20) errors.push(e.message); });
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        await expect(page.getByTestId("nodegraph")).toBeVisible();
        await page.getByTestId("nodegraph-canvas").press("ArrowRight");
        await expect(page.getByTestId("count-readout")).toHaveText("unknown — not measured");
        await expect(page.locator('[data-filter-type="traversal"]')).toBeChecked();
        assert.deepEqual(errors, []);
        await page.screenshot({ path: resolve(out, `consumer-${width}.png`), fullPage: true });
        writeFileSync(resolve(out, `consumer-${width}.html`), await page.content());
        browserStates.push({ width, errors, text: await page.getByTestId("nodegraph").innerText() });
        await context.close();
      }
    } finally {
      if (browser) await browser.close();
      await new Promise((done, reject) => { server.httpServer.close((error) => error ? reject(error) : done()); server.httpServer.closeAllConnections(); });
    }
  }
  writeFileSync(resolve(out, "RESULT.json"), JSON.stringify({ status: "PASS", packages, consumer, coreRuntimeAndPublicTypes: true, reactBrowserBundle: true, browserStates }, null, 2));
  console.log(JSON.stringify({ status: "PASS", out }));
} finally {
  assert.ok(consumer.startsWith(temporaryRoot + sep + "nodegraph-consumer-"));
  rmSync(consumer, { recursive: true });
}
