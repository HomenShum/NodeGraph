/**
 * PROMOTION condition 8 — the web-quality audit (accessibility, performance,
 * Core Web Vitals), run by tools this repo does not own.
 *
 * Condition 8 was UNVERIFIED for three waves with the reason "no axe or
 * Lighthouse run". One hand-measured contrast check had been done and was
 * logged as defect D6, and the scorecard said plainly that a single check is
 * not the audit the condition names. This script is that audit.
 *
 * It runs, against the SAME rendered surface a stranger meets — the demo
 * gallery the reduced gate judges this package on:
 *
 *   - Lighthouse 13.4.1, mobile (the default: 4x CPU throttle, 375x667) and
 *     desktop preset. Categories, Core Web Vitals, and every failing audit.
 *   - axe-core CLI 4.13.0, which is a different engine with a different rule
 *     set, so the two do not confirm each other's arithmetic.
 *
 * Verdict rule, stated up front so it cannot be relaxed after seeing a number:
 * MAJOR means any axe violation of impact `serious` or `critical`, or a
 * Lighthouse accessibility score below 0.90. Everything else is recorded as a
 * finding with its severity and does not fail the gate on its own. The
 * performance score is REPORTED, never used to conclude anything about
 * condition 7 — a Lighthouse run is not a Web Interface Guidelines review.
 *
 * Run (after `npm install` at the root and `cd render && npm install &&
 * npm run build`):
 *
 *     node promotion/scripts/audit-web-quality.mjs
 *     npm run audit:web-quality
 *
 * Env: NODEGRAPH_DEMO_PORT (default 4907), NODEGRAPH_EVIDENCE_DIR.
 * Network: both tools are fetched with `npx --yes` at pinned versions.
 */

import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { REPO, startDemoServer } from "./demo-server.mjs";

const PORT = Number(process.env.NODEGRAPH_DEMO_PORT ?? 4907);
const OUT = resolve(
  process.env.NODEGRAPH_EVIDENCE_DIR ?? resolve(REPO, "promotion/evidence/web-quality"),
);
const LIGHTHOUSE = "lighthouse@13.4.1";
const AXE = "@axe-core/cli@4.13.0";

// Windows: `npx` is a .cmd shim, and Node refuses to spawnSync it without a
// shell (EINVAL). With a shell, arguments carrying spaces — an evidence path
// under "Program Files", say — must be quoted by us.
const win = process.platform === "win32";
const npx = (args) => {
  const quoted = win ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
  const run = spawnSync(win ? "npx.cmd" : "npx", quoted, {
    cwd: REPO,
    encoding: "utf8",
    shell: win,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10 * 60_000,
  });
  if (run.error) throw run.error;
  return run;
};

mkdirSync(OUT, { recursive: true });
const server = await startDemoServer(PORT);
const commands = [];

try {
  /* ---------------------------------------------------------------- */
  /* Lighthouse: mobile first (its default, and the harsher one), then */
  /* desktop, because "performance" means different things at each and */
  /* a single number would hide which.                                 */
  /* ---------------------------------------------------------------- */
  const lighthouse = {};
  for (const [profile, extra] of [["mobile", []], ["desktop", ["--preset=desktop"]]]) {
    const path = resolve(OUT, `lighthouse-${profile}.json`);
    const args = [
      "--yes", LIGHTHOUSE, server.url,
      "--output=json", `--output-path=${path}`,
      '--chrome-flags=--headless', "--quiet",
      ...extra,
    ];
    commands.push(`npx ${args.join(" ")}`);
    const run = npx(args);
    if (run.status !== 0) throw new Error(`lighthouse ${profile} exited ${run.status}\n${run.stderr}`);
    const report = JSON.parse(readFileSync(path, "utf8"));
    lighthouse[profile] = {
      version: report.lighthouseVersion,
      formFactor: report.configSettings.formFactor,
      scores: Object.fromEntries(
        Object.entries(report.categories).map(([k, v]) => [k, v.score]),
      ),
      webVitals: {
        lcpMs: report.audits["largest-contentful-paint"]?.numericValue ?? null,
        cls: report.audits["cumulative-layout-shift"]?.numericValue ?? null,
        fcpMs: report.audits["first-contentful-paint"]?.numericValue ?? null,
        tbtMs: report.audits["total-blocking-time"]?.numericValue ?? null,
        ttiMs: report.audits["interactive"]?.numericValue ?? null,
      },
      failingAudits: Object.entries(report.audits)
        .filter(([, a]) => a.score !== null && a.score < 1)
        .map(([id, a]) => ({ id, score: a.score, title: a.title })),
      consoleErrors: (report.audits["errors-in-console"]?.details?.items ?? []).map(
        (i) => i.description ?? String(i.source),
      ),
      // Gate condition 9 also asks about failed requests. `blob:` entries are
      // excluded and counted separately: Lighthouse records them with status
      // -1 because they never touch the network — they are the force-layout's
      // Web Worker, respawned once per ingestion batch. Fifty of them looks
      // alarming in a raw report and is not a failure.
      network: (() => {
        const items = report.audits["network-requests"]?.details?.items ?? [];
        const http = items.filter((i) => !String(i.url).startsWith("blob:"));
        return {
          requests: items.length,
          blobWorkerUrls: items.length - http.length,
          nonOk: http
            .filter((i) => !(i.statusCode >= 200 && i.statusCode < 400))
            .map((i) => [i.url, i.statusCode]),
        };
      })(),
      report: `lighthouse-${profile}.json`,
    };
  }

  /* ---------------------------------------------------------------- */
  /* axe-core: a second engine, so a clean sheet is not one tool       */
  /* agreeing with itself.                                            */
  /* ---------------------------------------------------------------- */
  const axePath = resolve(OUT, "axe.json");
  // `--save` is joined onto the CLI's cwd without checking whether it is
  // already absolute, so an absolute path lands at cwd + the whole path and
  // the write fails with ENOENT after a clean run. Hand it a cwd-relative one.
  const axeArgs = ["--yes", AXE, server.url, "--save", relative(REPO, axePath).split(sep).join("/")];
  commands.push(`npx ${axeArgs.join(" ")}`);
  const axeRun = npx(axeArgs);
  // The CLI exits 0 even with violations, so the file is the source of truth.
  const axeReport = JSON.parse(readFileSync(axePath, "utf8"));
  const axePage = Array.isArray(axeReport) ? axeReport[0] : axeReport;
  const violations = (axePage.violations ?? []).map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
  }));

  /* ---------------------------------------------------------------- */
  /* Interaction latency on the case this actually has to survive: the */
  /* 142-entity dense constellation, on a throttled phone. Lighthouse  */
  /* never clicks anything — TBT and TTI are load-time proxies — and   */
  /* gate condition 10 asks whether performance OBSTRUCTS interaction, */
  /* which is a different question with a different answer.            */
  /* ---------------------------------------------------------------- */
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 412, height: 823 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration));
    }).observe({ type: "longtask", buffered: true });
  });
  const takeLongTasks = async () => {
    const tasks = await page.evaluate(() => {
      const seen = window.__longTasks.slice();
      window.__longTasks.length = 0;
      return seen;
    });
    return tasks;
  };
  // Keyboard, not a pixel guess: an arrow press selects a real node whatever
  // the layout settled into, and it goes through the identical `emitNode` path
  // a click does. Five presses, so one lucky frame cannot carry the number.
  const press = async () => {
    const before = await page.locator('[data-testid="nodegraph-readout"]').textContent();
    const started = Date.now();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      (previous) =>
        document.querySelector('[data-testid="nodegraph-readout"]')?.textContent !== previous,
      before,
      { timeout: 5_000 },
    );
    return Date.now() - started;
  };
  const pressFive = async () => {
    const out = [];
    for (let i = 0; i < 5; i += 1) out.push(await press());
    return out;
  };

  await page.goto(server.url, { waitUntil: "load" });
  // Wait for the field to actually GO still rather than assuming a wall-clock
  // moment. The first cut of this measurement sampled at 10s and read 27 long
  // tasks, which looked like "the steady state is not still" — it was the
  // cinematic window and the FA2 settle, both stretched by the 4x throttle,
  // and they were finished by ~14s. Time-to-still is the honest number; a
  // fixed sleep would have shipped a false defect.
  let loadLongTasks = 0;
  let stillAtMs = null;
  for (let elapsed = 1_000; elapsed <= 40_000; elapsed += 1_000) {
    await page.waitForTimeout(1_000);
    const seen = await takeLongTasks();
    loadLongTasks += seen.length;
    if (seen.length === 0 && stillAtMs === null && elapsed >= 6_000) stillAtMs = elapsed;
    else if (seen.length > 0) stillAtMs = null;
    if (stillAtMs !== null && elapsed - stillAtMs >= 1_000) break;
  }
  const stage = await page.locator('[data-testid="nodegraph-canvas"]').boundingBox();
  // The claim this product makes about its steady state is that it HAS one.
  // Three more seconds of no input: a field that is still should book no long
  // tasks at all.
  await takeLongTasks();
  await page.waitForTimeout(3_000);
  const idleLongTasks = await takeLongTasks();

  await page.locator('[data-testid="nodegraph-canvas"]').focus();
  const throttledLatency = await pressFive();
  const interactionLongTasks = await takeLongTasks();
  // Unthrottled, because the bar below is Core Web Vitals' INP threshold and
  // that threshold is defined for a real device, not a 4x-slowed one. Both
  // numbers are kept: the throttled one is what a cheap phone feels.
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.waitForTimeout(500);
  const unthrottledLatency = await pressFive();
  await browser.close();

  const worst = (xs) => Math.max(...xs);
  const interaction = {
    scenario: "Dense constellation — 142 entities, 145 edges",
    viewport: "412x823",
    stage: stage && { w: Math.round(stage.width), h: Math.round(stage.height) },
    keyToReadoutMs: { throttled4x: throttledLatency, unthrottled: unthrottledLatency },
    worstKeyToReadoutMs: {
      throttled4x: worst(throttledLatency),
      unthrottled: worst(unthrottledLatency),
    },
    longTasks: {
      duringLoadAndStream: loadLongTasks,
      idleAfterSettle: idleLongTasks,
      duringFiveSelections: interactionLongTasks,
    },
    // How long the 142-entity ingestion takes to reach the still steady state
    // on a 4x-throttled phone. Divide by roughly four for a real desktop.
    stillAtMsThrottled4x: stillAtMs,
    // Two conditions, both external: INP's "good" threshold is 200ms, and a
    // still field is this repo's own stated contract.
    bar: "worst unthrottled key-to-readout <= 200ms (INP good), and zero long tasks in a 3s idle window",
    verdict:
      worst(unthrottledLatency) <= 200 && idleLongTasks.length === 0 ? "PASS" : "FINDING",
  };

  /* ---------------------------------------------------------------- */
  const majors = [
    ...violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `axe ${v.id} (${v.impact}) at ${v.nodes.map((n) => n.target).join(", ")}`),
    ...(lighthouse.mobile.scores.accessibility < 0.9
      ? [`lighthouse accessibility ${lighthouse.mobile.scores.accessibility} < 0.90 (mobile)`]
      : []),
  ];

  const summary = {
    condition: 8,
    surface: "render/demo/index.html — the demo gallery the reduced gate judges this package on",
    url: server.url,
    measuredAt: new Date().toISOString(),
    tools: { lighthouse: LIGHTHOUSE, axe: AXE },
    commands,
    verdict: majors.length === 0 ? "PASS" : "FAIL",
    majors,
    axe: {
      engine: axePage.testEngine?.version ?? null,
      violationCount: violations.length,
      violations,
      passCount: (axePage.passes ?? []).length,
      incompleteCount: (axePage.incomplete ?? []).length,
      report: "axe.json",
    },
    lighthouse,
    // Gate condition 10 rests on this row, not on the Lighthouse score.
    interaction,
    // Stated, not implied: the two tools below score different things, and
    // neither of them is condition 7.
    notCoveredHere:
      "Web Interface Guidelines review (condition 7) is a separate producer, " +
      "promotion/scripts/review-wig.mjs. A Lighthouse score is not a guidelines review.",
  };

  writeFileSync(resolve(OUT, "web-quality.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `${summary.verdict} — axe ${violations.length} violations ` +
      `(${violations.filter((v) => v.impact === "serious" || v.impact === "critical").length} serious/critical); ` +
      `lighthouse mobile a11y ${lighthouse.mobile.scores.accessibility}, perf ${lighthouse.mobile.scores.performance}; ` +
      `desktop a11y ${lighthouse.desktop.scores.accessibility}, perf ${lighthouse.desktop.scores.performance}\n`,
  );
  for (const m of majors) process.stdout.write(`  MAJOR: ${m}\n`);
  if (majors.length > 0) process.exitCode = 1;
} finally {
  await server.stop();
}
