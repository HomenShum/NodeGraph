import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const stop = async (child) => {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    wait(2_000),
  ]);
};

const chromeCandidates = [
  process.env.NODEGRAPH_CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const fromPath = process.platform === "win32"
  ? spawnSync("where.exe", ["chrome.exe"], { encoding: "utf8" }).stdout?.split(/\r?\n/)[0]
  : spawnSync("sh", ["-lc", "command -v google-chrome || command -v chromium"], {
      encoding: "utf8",
    }).stdout?.trim();
const chrome = [...chromeCandidates, fromPath].find((candidate) => candidate && existsSync(candidate));
if (!chrome) throw new Error("Chrome not found; set NODEGRAPH_CHROME for the rendered demo gate");

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async open() {
    await new Promise((resolveOpen, reject) => {
      this.ws.addEventListener("open", resolveOpen, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
      } else {
        this.events.push(message);
      }
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCall, reject) => {
      this.pending.set(id, { resolve: resolveCall, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

// The same knob serve-demo.mjs reads; see probe-demo.mjs for why it matters.
const demoPort = Number(process.env.NODEGRAPH_DEMO_PORT ?? 4173);
const demoUrl = `http://127.0.0.1:${demoPort}`;

const server = spawn(process.execPath, ["scripts/serve-demo.mjs"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
// Wait for OUR server to announce itself, not for the port to answer; see
// probe-demo.mjs. A held port kills the child and Chrome would then be driven
// against the stranger holding it.
const listening = new Promise((resolveReady, rejectReady) => {
  server.stdout.once("data", resolveReady);
  server.once("exit", (code) =>
    rejectReady(new Error(`demo server exited (${code}) — port ${demoPort} is held by another process`)),
  );
  setTimeout(() => rejectReady(new Error("demo server never announced itself")), 10_000).unref();
});
const profile = mkdtempSync(resolve(tmpdir(), "nodegraph-live-"));
let chromeProcess;

try {
  await listening;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(demoUrl, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) break;
    } catch {
      if (attempt === 29) throw new Error("demo server did not become reachable");
      await wait(100);
    }
  }

  const debugUrl = await new Promise((resolveDebug, reject) => {
    chromeProcess = spawn(
      chrome,
      [
        "--headless=new",
        "--window-size=1280,900",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu-sandbox",
        demoUrl,
      ],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    const timeout = setTimeout(() => reject(new Error("Chrome CDP endpoint timed out")), 10_000);
    chromeProcess.stderr.on("data", (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolveDebug(match[1]);
      }
    });
    chromeProcess.once("error", reject);
  });

  const port = new URL(debugUrl).port;
  let target;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(1_000),
    }).then((response) => response.json());
    target = targets.find((item) => item.type === "page" && item.url.includes(`127.0.0.1:${demoPort}`));
    if (target) break;
    await wait(100);
  }
  if (!target) throw new Error("demo page target did not appear");

  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.call("Runtime.enable");
  await cdp.call("Page.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const evaluate = async (expression) => {
    const result = await cdp.call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const pixelSample = () => evaluate(`(() => {
    const canvas = document.querySelector('[data-testid="cinematic-layer"]');
    if (!canvas) return { lit: -1, nodes: 0 };
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) lit += 1;
    return {
      lit,
      nodes: document.querySelectorAll('[data-testid="nodegraph"] canvas').length,
    };
  })()`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate("Boolean(document.querySelector('[data-testid=\"nodegraph\"]'))")) break;
    if (attempt === 39) throw new Error("NodeGraph did not mount");
    await wait(100);
  }

  // The page opens on "Dense constellation", which streams for ~6s. That is
  // the frame the README's mid-ingestion screenshot is supposed to show, so
  // photograph it here — and do NOT try to measure stillness against it: every
  // event extends the live window, so a scenario that is still streaming has
  // not yet earned its decay. (Before this rewrite the gate sampled "decay" at
  // 5.6s into that stream and read 87,317 lit pixels, which was the demo
  // working, not failing.)
  // Wait for a CONDITION, not a clock: the page's own entity counter passing
  // 30 means the stream is genuinely mid-flight, so the live window is open and
  // there are nodes to breathe. Sampling at a fixed 900ms read 0 lit pixels on
  // a slow load — the assertion was measuring the machine, not the renderer.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const entities = await evaluate(
      "Number((document.querySelector('#stats')?.textContent ?? '0').split(' ')[0])",
    );
    if (entities >= 30) break;
    if (attempt === 59) throw new Error("dense constellation never reached 30 entities");
    await wait(100);
  }
  // session.stats() is the only thing that also discloses the LIMITS, and a
  // bounded store that evicts without saying so is indistinguishable from data
  // loss. This fails the moment the readout stops naming the cap.
  const boundsDisclosed = /bounded at \d+\/\d+/.test(
    await evaluate("document.querySelector('#stats')?.textContent ?? ''"),
  );
  // Take the BRIGHTEST of several samples. Every ingestion re-runs the overlay
  // effect, and re-running it resizes (therefore clears) the canvas one frame
  // before the next paint — so a single sample during a fast stream reads 0
  // roughly one time in five. Measured: 111935, 117493, 0, 118256 on four
  // single-sample runs of the same unchanged code. Several samples spanning
  // more than one frame cannot all land in that gap, and a genuinely dead
  // overlay still reads 0 in all of them.
  const brightestLit = async (samples) => {
    let lit = 0;
    for (let index = 0; index < samples; index += 1) {
      lit = Math.max(lit, (await pixelSample()).lit);
      await wait(60);
    }
    return { lit };
  };
  const denseLive = await brightestLit(5);
  const screenshot = await cdp.call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
  });
  writeFileSync(
    resolve(root, "media", "standalone-demo-mid-ingestion.png"),
    Buffer.from(screenshot.data, "base64"),
  );

  // Live-then-still is measured against ONE known ingestion instead of a
  // wall-clock guess. "Calm by contract" sends a single event at 300ms, so its
  // live window closes at ~3.5s: sample inside it twice, then well past it.
  // Picking the chip by its visible name is exactly how a reader triggers one.
  const pressCalm = () =>
    evaluate(`[...document.querySelectorAll('#scenarios button')]
      .find((button) => button.textContent === 'Calm by contract')
      .click()`);

  await pressCalm();
  await wait(900);
  const initialLive = await pixelSample();
  await wait(900);
  const expandedLive = await pixelSample();
  await wait(3_800);
  const initialDecay = await pixelSample();

  // Press it again: the window must REOPEN and then close again.
  await pressCalm();
  await wait(1_900);
  const replayLive = await pixelSample();
  await wait(3_500);
  const replayDecay = await pixelSample();

  const browserErrors = cdp.events.filter(
    (event) =>
      event.method === "Runtime.exceptionThrown" ||
      (event.method === "Runtime.consoleAPICalled" && event.params?.type === "error"),
  );
  const proof = {
    boundsDisclosed,
    denseLive: denseLive.lit,
    initialLive: initialLive.lit,
    expandedLive: expandedLive.lit,
    initialDecay: initialDecay.lit,
    replayLive: replayLive.lit,
    replayDecay: replayDecay.lit,
    browserErrors: browserErrors.length,
  };
  if (
    !proof.boundsDisclosed ||
    proof.denseLive <= 0 ||
    proof.initialLive <= 0 ||
    proof.expandedLive <= 0 ||
    proof.initialDecay !== 0 ||
    proof.replayLive <= 0 ||
    proof.replayDecay !== 0 ||
    proof.browserErrors !== 0
  ) {
    throw new Error(`rendered demo proof failed: ${JSON.stringify(proof)}`);
  }
  process.stdout.write(`${JSON.stringify(proof)}\n`);
  cdp.close();
} finally {
  await stop(chromeProcess);
  await stop(server);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Chrome's own child processes can still hold handles inside the profile
    // after the launcher exits — on Windows this throws EBUSY even after the
    // five built-in retries, and it did: a run that had already printed a
    // PASSING proof exited 1 from here. The profile is a disposable directory
    // under the OS temp dir, so failing to unlink it is not the gate's verdict.
    process.stdout.write(`left temp Chrome profile behind: ${profile}\n`);
  }
}
