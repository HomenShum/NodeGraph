import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startDemoServer } from "./serve-demo.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifactRoot = resolve(root, ".proofloop");
await mkdir(artifactRoot, { recursive: true });
const out = await mkdtemp(resolve(artifactRoot, "viewer-"));
const proof = { status: "RUNNING", states: [], motion: [], failures: [], resourcesClosed: false };
const server = await startDemoServer();
let browser;
let compose;
let page;
const check = expect.configure({ timeout: 15_000 });

const litPixels = () => {
  const canvas = document.querySelector('[data-testid="cinematic-layer"]');
  if (!canvas) throw new Error("overlay canvas missing");
  const rgba = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0) lit++;
  return lit;
};

async function capture(name, errors, axe = false) {
  const state = await page.evaluate(() => ({
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight },
    scrollWidth: document.documentElement.scrollWidth,
    stage: (() => { const el = document.querySelector('[data-testid="nodegraph-canvas"]'); return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 }; })(),
    stats: document.querySelector("#stats")?.textContent,
    text: document.body.innerText,
    focused: document.activeElement?.getAttribute("data-testid"),
    scenarios: [...document.querySelectorAll("#scenarios button")].map((b) => ({ text: b.textContent, pressed: b.getAttribute("aria-pressed"), disabled: b.disabled })),
  }));
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true });
  await writeFile(resolve(out, `${name}.html`), await page.content());
  const accessibility = axe ? await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze() : undefined;
  await writeFile(resolve(out, `${name}.json`), JSON.stringify({ state, errors, accessibility }, null, 2));
  proof.states.push({ name, width: state.viewport.width, scrollWidth: state.scrollWidth, errors: [...errors], axeViolations: accessibility?.violations.map((v) => v.id) ?? null });
  assert.ok(state.scrollWidth <= state.viewport.width, `${name}: horizontal page overflow`);
  assert.ok(state.stage.width > 0 && state.stage.height > 0, `${name}: graph has no visible area`);
  assert.equal(errors.length, 0, `${name}: ${errors.join("; ")}`);
  if (accessibility) assert.deepEqual(accessibility.violations.map((v) => v.id), [], `${name}: accessibility violations`);
}

async function newPage(width, reducedMotion = "no-preference") {
  if (page) await page.context().close();
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("pageerror", (e) => { if (errors.length < 30) errors.push((e.stack ?? e.message).slice(0, 3000)); });
  page.on("console", (m) => { if (m.type() === "error" && errors.length < 30) errors.push(m.text().slice(0, 1000)); });
  return errors;
}

try {
  browser = await chromium.launch({ headless: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    const errors = await newPage(width);
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await check(page.getByTestId("nodegraph")).toBeVisible();
    await check(page.locator("#stats")).toContainText("142 entities");
    if (width === 390) {
      // Real application panels hide without unmounting while events arrive.
      // This formerly threw from resize and removed the entire React tree.
      await page.getByTestId("nodegraph").evaluate((el) => { el.style.display = "none"; });
      await page.waitForTimeout(250);
      assert.equal(await page.getByTestId("nodegraph-canvas").evaluate((el) => el.clientWidth), 0);
      await page.getByTestId("nodegraph").evaluate((el) => { el.style.removeProperty("display"); });
      await check(page.getByTestId("nodegraph")).toBeVisible();
      await capture("panel-reopened-390", errors);
    }
    await capture(`gallery-${width}`, errors, true);

    // A keyboard-only reviewer reaches the same measurements as a mouse user.
    const evidence = page.locator('[data-filter-type="evidence"]');
    await evidence.uncheck();
    await check(page.getByTestId("nodegraph").locator("header")).toContainText("0 of");
    await evidence.check();
    await page.getByTestId("nodegraph-fit").click();
    await page.getByRole("button", { name: "Unknown vs zero", exact: true }).click();
    await check(page.locator("#stats")).toContainText("2 entities");
    const stage = page.getByTestId("nodegraph-canvas");
    await stage.focus();
    const counts = [];
    for (let n = 0; n < 2; n++) {
      await stage.press("ArrowRight");
      await check(page.getByTestId("nodegraph-selection")).toBeVisible();
      counts.push(await page.getByTestId("count-readout").innerText());
    }
    assert.deepEqual(counts.sort(), ["0", "unknown — not measured"].sort());
    await capture(`keyboard-${width}`, errors);
    await stage.press("Escape");
    await check(page.getByTestId("nodegraph-selection")).toHaveCount(0);

    // Invalid incoming evidence must leave the accepted pair visible and let
    // the reader switch scenarios to recover without reloading the application.
    await page.getByRole("button", { name: "Refused batch", exact: true }).click();
    await check(page.getByRole("alert")).toContainText("last accepted state");
    await check(page.locator("#stats")).toContainText("2 entities · 1 edges");
    await capture(`refused-${width}`, errors);
    await page.getByRole("button", { name: "Calm by contract", exact: true }).click();
    await check(page.getByRole("alert")).toHaveCount(0);
    await check(page.locator("#stats")).toContainText("2 entities");
    if (width === 1440) {
      // Each effect resize clears a frame. Poll the actual overlay instead of
      // taking a single sample that can land between clear and paint.
      const pressCalm = () => page.getByRole("button", { name: "Calm by contract", exact: true }).click();
      for (let repeat = 0; repeat < 2; repeat++) {
        await pressCalm();
        let brightestLit = 0;
        await check.poll(async () => {
          brightestLit = Math.max(brightestLit, await page.evaluate(litPixels));
          return brightestLit;
        }, { timeout: 5000, intervals: [80, 80, 100] }).toBeGreaterThan(0);
        await capture(`motion-${repeat}`, errors);
        // Stillness must span multiple frames. A single clear/paint gap during
        // ingestion is zero too, and is not evidence that the window ended.
        let calm = [];
        await check.poll(async () => {
          calm = [];
          for (let n = 0; n < 5; n++) { await page.waitForTimeout(120); calm.push(await page.evaluate(litPixels)); }
          return calm.every((value) => value === 0);
        }, { timeout: 8000 }).toBe(true);
        proof.motion.push({ repeat, brightestLit, calm });
      }
      await page.getByRole("button", { name: "Bounded memory", exact: true }).click();
      await check(page.locator("#stats")).toContainText("at capacity, oldest-inserted evicted first");
      await page.waitForTimeout(9000);
      await check(page.locator("#stats")).toContainText("60 entities");
      await capture("bounded-stream", errors);
    }
  }
  const reducedErrors = await newPage(390, "reduce");
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await check(page.getByTestId("nodegraph")).toBeVisible();
  await page.getByRole("button", { name: "Calm by contract", exact: true }).click();
  await check(page.locator("#stats")).toContainText("2 entities");
  for (let n = 0; n < 8; n++) {
    assert.equal(await page.evaluate(litPixels), 0);
    await page.waitForTimeout(100);
  }
  await capture("reduced-motion-390", reducedErrors, true);

  // Deliberate failed module request: the page must tell the user how to
  // recover. Remove the interception before pressing the real retry button.
  const failureErrors = await newPage(390);
  await page.route("**/dist/react.js", (route) => route.abort("failed"));
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await check(page.getByRole("alert")).toContainText("Unable to load the renderer");
  assert.equal(await page.getByTestId("nodegraph").count(), 0);
  await page.screenshot({ path: resolve(out, "module-failure.png"), fullPage: true });
  await writeFile(resolve(out, "module-failure.html"), await page.content());
  const failureAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  await writeFile(resolve(out, "module-failure.json"), JSON.stringify({ expectedBlockedModule: "/dist/react.js", errors: failureErrors, accessibility: failureAxe }, null, 2));
  assert.deepEqual(failureAxe.violations.map((v) => v.id), []);
  await page.unroute("**/dist/react.js");
  failureErrors.length = 0;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await check(page.getByTestId("nodegraph")).toBeVisible();
  await check(page.locator("#stats")).toContainText("142 entities");
  await capture("module-recovered", failureErrors);

  if (process.argv.includes("--compose")) {
    compose = await startDemoServer({ root: resolve(root, "..") });
    for (const width of [320, 390, 768, 1024, 1440]) {
      const errors = await newPage(width);
      await page.goto(`${compose.url}/examples/compose/index.html`, { waitUntil: "domcontentloaded" });
      await check(page.getByTestId("nodegraph")).toBeVisible();
      await check(page.locator("#stats")).toContainText("model: 54 nodes, 102 edges");
      await check(page.locator("#stats")).toContainText("input to renderer: 54 entities, 102 relationships");
      // The 102 semantic edges map to 96 unique undirected traversal pairs;
      // the input counter must not call them 102 rendered relationships.
      await check(page.getByTestId("nodegraph").locator("header")).toContainText("54 entities · 96 of 96 relationships shown");
      await check(page.locator('[data-filter-type="traversal"]')).toBeChecked();
      assert.equal(await page.locator('[data-filter-type="evidence"]').count(), 0);
      await page.getByTestId("nodegraph-canvas").press("ArrowRight");
      await check(page.getByTestId("count-readout")).toHaveText("unknown — not measured");
      await capture(`compose-${width}`, errors, true);
    }
  }
  proof.status = "PASS";
} catch (error) {
  proof.status = "FAIL";
  proof.failures.push(error.stack ?? String(error));
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(out, "failure.png"), fullPage: true }).catch(() => {});
    await writeFile(resolve(out, "failure.html"), await page.content()).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  // Playwright owns browser/profile teardown; never delete a profile while
  // Chrome may still hold its files. All HTTP servers are closed and awaited.
  const closed = await Promise.allSettled([browser?.close(), compose?.close(), server.close()]);
  proof.resourcesClosed = closed.every((result) => result.status === "fulfilled");
  if (!proof.resourcesClosed) { proof.status = "FAIL"; process.exitCode = 1; proof.failures.push("owned resource teardown failed"); }
  await writeFile(resolve(out, "RESULT.json"), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ status: proof.status, states: proof.states.length, resourcesClosed: proof.resourcesClosed, out, failures: proof.failures }));
}
