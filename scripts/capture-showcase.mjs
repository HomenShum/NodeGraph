import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = join(root, "docs", "media");
const frameDir = join(outDir, "showcase-frames");
const gifPath = join(outDir, "nodegraph-showcase.gif");
const port = process.env.NODEGRAPH_SHOWCASE_PORT ?? "5174";
const baseUrl = `http://127.0.0.1:${port}`;

mkdirSync(outDir, { recursive: true });
rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });

const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "example:dev", "--", "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BROWSER: "none" },
  shell: process.platform === "win32",
});

let serverOutput = "";
server.stdout.on("data", (data) => { serverOutput += data.toString(); });
server.stderr.on("data", (data) => { serverOutput += data.toString(); });

try {
  await waitForServer(baseUrl, 30_000);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 840 }, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const frames = [
    async () => page.getByRole("button", { name: /CardioNova diligence/i }).click(),
    async () => page.locator(".story").getByRole("button", { name: "Who researched the company?" }).click(),
    async () => page.locator(".story").getByRole("button", { name: "Show funding evidence" }).click(),
    async () => page.locator(".story").getByRole("button", { name: "Open risk questions" }).click(),
    async () => page.getByPlaceholder(/Search CardioNova/i).fill("source"),
    async () => page.getByText("Evidence-backed only").click(),
  ];

  for (let index = 0; index < frames.length; index += 1) {
    await frames[index]();
    await page.waitForSelector(".react-flow__node", { timeout: 10_000 });
    await page.locator(".react-flow__controls-fitview").click({ timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(850);
    await page.screenshot({ path: join(frameDir, `frame-${String(index + 1).padStart(3, "0")}.png`), fullPage: false });
  }
  await browser.close();

  await run("ffmpeg", ["-y", "-framerate", "1.2", "-i", join(frameDir, "frame-%03d.png"), "-vf", "scale=960:-1:flags=lanczos,palettegen", join(frameDir, "palette.png")]);
  await run("ffmpeg", ["-y", "-framerate", "1.2", "-i", join(frameDir, "frame-%03d.png"), "-i", join(frameDir, "palette.png"), "-lavfi", "scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5", gifPath]);

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
