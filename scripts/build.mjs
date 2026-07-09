import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");

await rm(dist, { recursive: true, force: true });

const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json"], {
  cwd: root,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

await rewriteRelativeEsmSpecifiers(dist);

async function rewriteRelativeEsmSpecifiers(dir) {
  const entries = await readdir(dir);
  await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      await rewriteRelativeEsmSpecifiers(path);
      return;
    }
    if (![".js", ".ts"].includes(extname(path)) || path.endsWith(".map")) return;
    const source = await readFile(path, "utf8");
    const rewritten = source.replace(/((?:from|export \*)\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (match, prefix, specifier, suffix) => {
      if (specifier.endsWith(".js") || specifier.endsWith(".json") || specifier.endsWith(".css")) return match;
      const candidate = join(dirname(path), `${specifier}.js`);
      return existsSync(candidate) ? `${prefix}${specifier}.js${suffix}` : match;
    });
    if (rewritten !== source) await writeFile(path, rewritten, "utf8");
  }));
}
