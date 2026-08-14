/**
 * PROOF: the three trust classes do not look alike on the rendered stage.
 *
 * The binding rule this repo is judged by is that `evidence`, `assertion` and
 * `traversal` edges must never be confusable with one another. That rule was
 * stated in prose and never measured, so it drifted: the baseline wave found
 * assertion and traversal ~1.3:1 apart in luminance and identical in hue
 * (defect D3, `promotion/PROMOTION_LOG.md`).
 *
 * This script turns the rule into a number, in the browser, against the same
 * built module the demo loads:
 *
 *   1. Spawns its OWN demo server on its own port and kills it afterwards.
 *      The baseline wave recorded a probe that silently graded an 11-hour-old
 *      orphaned process on a hardcoded port; a proof that can measure a
 *      stranger's tree is not a proof.
 *   2. Drives the rendered gallery to "Assertion chain" — the scenario whose
 *      caption promises violet assertion edges — and screenshots the stage.
 *   3. Imports the demo's own `dist/index.js` IN THE PAGE and calls
 *      `buildGraph`, the same function `NodeGraph.tsx` calls, on a payload
 *      carrying one edge of each type. The `color` it writes is literally the
 *      value Sigma is handed for that edge, so this reads the shipped ink, it
 *      does not paraphrase the source.
 *   4. Scores every pair with CIEDE2000 plus a greyscale WCAG ratio, and
 *      exits non-zero if any pair is confusable.
 *
 * Run (from a fresh clone, after `npm install` at the root and
 * `cd render && npm install && npm run build`):
 *
 *     node promotion/scripts/prove-edge-grammar.mjs
 *
 * Env: NODEGRAPH_DEMO_PORT (default 4308), NODEGRAPH_EVIDENCE_DIR.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const REPO = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const PORT = Number(process.env.NODEGRAPH_DEMO_PORT ?? 4308);
// Defaults to `after/` so the plain `npm run proof:edge-grammar` regenerates
// exactly the committed PASS evidence. `before/` is produced by pointing
// NODEGRAPH_EVIDENCE_DIR at it with the pre-fix palette restored — see the
// README next to the output.
const OUT = resolve(
  process.env.NODEGRAPH_EVIDENCE_DIR ?? resolve(REPO, "promotion/evidence/edge-grammar/after"),
);

/* ------------------------------------------------------------------ */
/* Colour maths. No dependency: sRGB -> linear -> XYZ (D65) -> L*a*b*, */
/* then CIEDE2000. Self-checked against Sharma's reference pairs below */
/* so the numbers this proof rests on are not a hand-rolled guess.     */
/* ------------------------------------------------------------------ */

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

/** WCAG relative luminance — the channel a fully colour-blind reader keeps. */
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const hexToLab = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  // sRGB D65 -> XYZ, then normalised by the D65 white point.
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** CIEDE2000. Sharma, Wu & Dalal (2005), kL = kC = kH = 1. */
function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);
  const hp = (b, ap) => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hp(b1, ap1);
  const hp2 = hp(b2, ap2);

  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;
  let dhp;
  if (Cp1 * Cp2 === 0) dhp = 0;
  else if (Math.abs(hp2 - hp1) <= 180) dhp = hp2 - hp1;
  else if (hp2 - hp1 > 180) dhp = hp2 - hp1 - 360;
  else dhp = hp2 - hp1 + 360;
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dhp) / 2);

  const Lbar = (L1 + L2) / 2;
  const Cpbar = (Cp1 + Cp2) / 2;
  let hpbar;
  if (Cp1 * Cp2 === 0) hpbar = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hpbar = (hp1 + hp2) / 2;
  else if (hp1 + hp2 < 360) hpbar = (hp1 + hp2 + 360) / 2;
  else hpbar = (hp1 + hp2 - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(hpbar - 30)) +
    0.24 * Math.cos(rad(2 * hpbar)) +
    0.32 * Math.cos(rad(3 * hpbar + 6)) -
    0.2 * Math.cos(rad(4 * hpbar - 63));
  const dTheta = 30 * Math.exp(-(((hpbar - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpbar ** 7 / (Cpbar ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
  const Sc = 1 + 0.045 * Cpbar;
  const Sh = 1 + 0.015 * Cpbar * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  return Math.sqrt(
    (dLp / Sl) ** 2 +
      (dCp / Sc) ** 2 +
      (dHp / Sh) ** 2 +
      Rt * (dCp / Sc) * (dHp / Sh),
  );
}

// Self-check: four pairs from Sharma's published CIEDE2000 test data. If this
// trips, every number below is meaningless and the proof must not run.
for (const [lab1, lab2, expected] of [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [[50, -1, 2], [50, 0, 0], 2.3669],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
]) {
  const got = deltaE2000(lab1, lab2);
  assert.ok(
    Math.abs(got - expected) < 1e-3,
    `CIEDE2000 self-check failed: got ${got}, expected ${expected}`,
  );
}

/* ------------------------------------------------------------------ */
/* Thresholds.                                                         */
/* ------------------------------------------------------------------ */

/**
 * CIEDE2000 floor for "these two edge classes are not confusable".
 *
 * Derived, not fitted. The CIE just-noticeable difference is ~2.3, and that is
 * the best case: two large patches, side by side, controlled light. These are
 * 0.6-5px anti-aliased strokes scattered across a stage, read at a glance,
 * usually not adjacent, often crossing each other. Roughly 6.5x the JND is the
 * bar, which is 15.
 *
 * For audit, the measurements that bracket it: at commit f136ae2 (baseline,
 * defect D3 open) this script measured assertion-vs-traversal at dE00 6.70
 * dark / 9.44 light. After the fix the worst pair is 21.83. The floor was
 * derived first and happens to separate them; it was not read off them.
 */
const DE_FLOOR = 15;

/**
 * Greyscale floor, for a reader with no colour vision at all: hue cannot be
 * the only thing separating two classes. WCAG's 3:1 non-text minimum is about
 * a mark against its BACKGROUND; this is mark-against-mark, where the eye is
 * comparing two inks directly, so the bar is lower and named separately.
 */
const GREY_FLOOR = 1.6;

/* ------------------------------------------------------------------ */

const waitForServer = (child) =>
  new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("demo server did not start in 15s")), 15_000);
    child.stdout.on("data", (b) => {
      if (String(b).includes("http://")) {
        clearTimeout(timer);
        ok();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`demo server exited with ${code}`));
    });
  });

if (!existsSync(resolve(REPO, "render/dist/index.js"))) {
  console.error("render/dist is not built. Run: cd render && npm install && npm run build");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// Own the server. Never measure a process this script did not start.
const server = spawn(process.execPath, [resolve(REPO, "render/scripts/serve-demo.mjs")], {
  env: { ...process.env, NODEGRAPH_DEMO_PORT: String(PORT) },
  stdio: ["ignore", "pipe", "inherit"],
});
await waitForServer(server);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  colorScheme: "dark",
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
// Wait for demo.js to have BOUND the chips, not merely for chips to exist:
// they are markup now, present before any script runs, so counting them
// proves nothing. The module ends by clicking the default scenario, and
// that click is what sets `.active`.
await page.waitForFunction(() => !!document.querySelector("#scenarios button.active"));

// The scenario whose caption promises violet assertion edges, then the one
// that draws traversal history. No scenario in the gallery emits all three
// classes at once, so the drawing cannot show the full grammar in one frame —
// the three-way comparison below is what closes that gap.
for (const [name, waitMs, slug] of [
  ["Assertion chain", 5200, "assertion-chain-dark"],
  ["Deep traversal", 5200, "deep-traversal-dark"],
]) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(waitMs);
  await page.locator("#stage").screenshot({ path: resolve(OUT, `${slug}.png`) });
}
await page.getByRole("button", { name: "Assertion chain", exact: true }).click();
await page.waitForTimeout(5200);
await page.screenshot({ path: resolve(OUT, "assertion-chain-page.png"), fullPage: false });

/**
 * Read the ink out of the SHIPPED module, in the page that is rendering it.
 * `buildGraph` is the function `NodeGraph.tsx` calls on mount, and the `color`
 * attribute it writes is exactly what Sigma paints, so this is the rendered
 * value rather than a restatement of the palette literal.
 */
const inks = await page.evaluate(async () => {
  const { buildGraph } = await import("/dist/index.js");
  const nodes = [
    { id: "a", label: "A", type: "condition" },
    { id: "b", label: "B", type: "intervention" },
    { id: "c", label: "C", type: "protein" },
    { id: "d", label: "D", type: "reaction" },
    { id: "e", label: "E", type: "pathway" },
  ];
  const edges = [
    { source: "a", target: "b", weight: 120, type: "evidence" },
    { source: "b", target: "c", weight: 7, type: "traversal" },
    {
      source: "c",
      target: "d",
      weight: 1,
      type: "assertion",
      receipt: {
        source: "Reactome",
        release: "v97",
        subjectId: "R-HSA-6802913",
        objectId: "R-HSA-6802957",
        url: "https://reactome.org/content/detail/R-HSA-6802913",
      },
    },
  ];
  const read = (dark) => {
    const g = buildGraph(nodes, edges, { dark });
    const out = { edges: {}, nodeRings: {} };
    g.forEachEdge((_k, a) => (out.edges[a.edgeType] = a.color));
    g.forEachNode((_n, a) => (out.nodeRings[a.kind] = a.borderColor));
    return out;
  };
  return { dark: read(true), light: read(false) };
});

const score = (theme, palette) => {
  const names = Object.keys(palette).sort();
  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [x, y] = [names[i], names[j]];
      const de = deltaE2000(hexToLab(palette[x]), hexToLab(palette[y]));
      const grey = contrastRatio(palette[x], palette[y]);
      pairs.push({
        theme,
        pair: `${x} vs ${y}`,
        inks: [palette[x], palette[y]],
        deltaE2000: Number(de.toFixed(2)),
        greyscaleContrast: Number(grey.toFixed(2)),
        pass: de >= DE_FLOOR && grey >= GREY_FLOOR,
      });
    }
  }
  return pairs;
};

const pairs = [...score("dark", inks.dark.edges), ...score("light", inks.light.edges)];
const failures = pairs.filter((p) => !p.pass);

const report = {
  measuredAt: new Date().toISOString(),
  scenario: "Assertion chain",
  viewport: "1280x900",
  thresholds: { deltaE2000: DE_FLOOR, greyscaleContrast: GREY_FLOOR },
  edgeInk: { dark: inks.dark.edges, light: inks.light.edges },
  nodeRingInk: { dark: inks.dark.nodeRings },
  pairs,
  failures: failures.map((f) => `${f.theme}: ${f.pair}`),
  consoleErrors,
  verdict: failures.length === 0 ? "PASS" : "FAIL",
};
writeFileSync(resolve(OUT, "edge-grammar.json"), `${JSON.stringify(report, null, 2)}\n`);

for (const p of pairs) {
  console.log(
    `${p.pass ? "ok  " : "FAIL"} ${p.theme.padEnd(5)} ${p.pair.padEnd(24)} ` +
      `${p.inks.join(" / ")}  dE00 ${String(p.deltaE2000).padStart(6)}  grey ${p.greyscaleContrast}:1`,
  );
}
console.log(`\n${report.verdict}: ${pairs.length - failures.length}/${pairs.length} pairs distinguishable`);
console.log(`evidence: ${OUT}`);

await context.close();
await browser.close();
server.kill();
process.exit(failures.length === 0 ? 0 : 1);
