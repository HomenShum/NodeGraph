/**
 * Record the scenario gallery for the README hero: three scenarios of real
 * ingestion — dense constellation (cascade + bloom), assertion chain
 * (receipted violet edges), hub burst — then a drag. Emits gallery-clip.webm;
 * convert to GIF with the ffmpeg recipe in the README of this script's
 * commit. Exits nonzero if any scenario fails to populate.
 *
 *   node scripts/record-gallery-clip.mjs      (demo server on :4173)
 */

import { chromium } from "playwright";
import { renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "..", "media");
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  colorScheme: "dark",
  recordVideo: { dir: OUT, size: { width: 1280, height: 860 } },
});
const page = await context.newPage();
const video = page.video();

await page.goto("http://127.0.0.1:4173", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#scenarios button", { timeout: 30000 });

const play = async (name, dwellMs) => {
  await page.locator("#scenarios button", { hasText: name }).click();
  await page.waitForTimeout(dwellMs);
  const stats = await page.textContent("#stats");
  const entities = Number(stats.match(/(\d+) entities/)?.[1] ?? 0);
  console.log(`${name}: ${stats}`);
  if (entities === 0) {
    console.error(`SCENARIO ${name} DID NOT POPULATE`);
    process.exit(1);
  }
};

await play("Dense constellation", 9500);
await play("Assertion chain", 6500);
await play("Hub burst", 6500);

// A drag for the physical feel, on whatever is on stage.
const drag = await page.evaluate(() => {
  const el = document.querySelector("#stage canvas");
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.45 };
});
await page.mouse.move(drag.x, drag.y);
await page.mouse.down();
await page.mouse.move(drag.x - 120, drag.y + 70, { steps: 16 });
await page.mouse.up();
await page.waitForTimeout(1800);

await context.close();
const tmp = await video.path();
const target = resolve(OUT, "gallery-clip.webm");
rmSync(target, { force: true });
renameSync(tmp, target);
console.log("recorded:", target);
await browser.close();
