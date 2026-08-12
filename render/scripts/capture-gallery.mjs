/**
 * Capture the scenario gallery: one still per scenario at its liveliest
 * moment, plus one continuous clip cycling the showpieces. Regenerates the
 * README media. Requires the demo server: `npm run demo` (port 4173).
 *
 *     node scripts/capture-gallery.mjs
 */

import { chromium } from "playwright";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "..", "media", "gallery");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 860 },
  colorScheme: "dark",
  recordVideo: { dir: OUT, size: { width: 1440, height: 860 } },
});
const page = await context.newPage();
const video = page.video();

await page.goto("http://127.0.0.1:4173", { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForFunction(() => document.querySelectorAll("#scenarios button").length === 10);

// Per-scenario stills: click, wait to its liveliest / most-formed moment.
const SHOTS = [
  ["Dense constellation", 6500],
  ["Deep traversal", 5200],
  ["Hub burst", 4200],
  ["Assertion chain", 5200],
  ["Rapid fire", 3200],
  ["Bounded memory", 7000],
  ["Evidence lands", 3600],
  ["Unknown vs zero", 2200],
];
for (const [name, waitMs] of SHOTS) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(waitMs);
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  await page.screenshot({ path: resolve(OUT, `${slug}.png`) });
  console.log("shot:", slug);
}

// The clip: cycle the showpieces while recording, end with a drag.
for (const [name, waitMs] of [
  ["Dense constellation", 9000],
  ["Hub burst", 6500],
  ["Assertion chain", 6500],
  ["Rapid fire", 5000],
]) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(waitMs);
}
await page.getByRole("button", { name: "Drag playground", exact: true }).click();
await page.waitForTimeout(3500);
const box = await page.locator("#root").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 - 80, { steps: 18 });
await page.mouse.up();
await page.waitForTimeout(1800);

await context.close();
const tmp = await video?.path().catch(() => null);
if (tmp) {
  const target = resolve(OUT, "gallery.webm");
  rmSync(target, { force: true });
  renameSync(tmp, target);
  console.log("clip: gallery.webm");
}
await browser.close();
console.log("GALLERY CAPTURE DONE ->", OUT);
