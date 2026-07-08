import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = join(root, "docs", "media");
const frameDir = join(outDir, "streamlit-showcase-frames");
const gifPath = join(outDir, "nodegraph-streamlit-showcase.gif");
const port = process.env.NODEGRAPH_STREAMLIT_PORT ?? "8508";
const baseUrl = `http://127.0.0.1:${port}`;

mkdirSync(outDir, { recursive: true });
rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });

const server = spawn("python", [
  "-m",
  "streamlit",
  "run",
  "examples/streamlit/app.py",
  "--server.headless",
  "true",
  "--server.port",
  port,
  "--server.fileWatcherType",
  "none",
  "--browser.gatherUsageStats",
  "false",
], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});

let serverOutput = "";
server.stdout.on("data", (data) => { serverOutput += data.toString(); });
server.stderr.on("data", (data) => { serverOutput += data.toString(); });

try {
  await waitForServer(baseUrl, 45_000);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });

  const frames = [
    "/?focus=company:cardionova",
    "/?focus=person:maya",
    "/?focus=agent_job:room-nodeagent",
    "/?focus=funding:series-a&evidence=1",
    "/?query=source&focus=source:pitchbook-cardionova&evidence=1",
    "/?query=hipaa&focus=open_question:hipaa&evidence=1",
  ];

  for (let index = 0; index < frames.length; index += 1) {
    await page.goto(`${baseUrl}${frames[index]}`, { waitUntil: "networkidle" });
    await page.waitForSelector("text=NodeGraph Streamlit Showcase", { timeout: 20_000 });
    await page.waitForSelector("iframe", { timeout: 20_000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: join(frameDir, `frame-${String(index + 1).padStart(3, "0")}.png`), fullPage: false });
  }

  await browser.close();

  await run("ffmpeg", ["-y", "-framerate", "1.15", "-i", join(frameDir, "frame-%03d.png"), "-vf", "scale=960:-1:flags=lanczos,palettegen", join(frameDir, "palette.png")]);
  await run("ffmpeg", ["-y", "-framerate", "1.15", "-i", join(frameDir, "frame-%03d.png"), "-i", join(frameDir, "palette.png"), "-lavfi", "scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5", gifPath]);

  if (!existsSync(gifPath)) throw new Error(`GIF was not written: ${gifPath}`);
  console.log(`wrote ${gifPath}`);
} finally {
  stopServer(server);
}

async function waitForServer(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (data) => { output += data.toString(); });
    child.stderr.on("data", (data) => { output += data.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}\n${output}`));
    });
  });
}

function stopServer(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}
