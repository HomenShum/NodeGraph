/**
 * Docs that point at line numbers rot the moment a file moves. This checks
 * every pointer in one pass and exits non-zero on the first broken one:
 *
 *   - every step in .tours/*.tour resolves to a real file and a real line
 *   - every `path/to/file.ts:123` citation in docs/ resolves the same way
 *   - every relative markdown link in docs/ and README.md points at something
 *
 * Run: npm run docs:check
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const problems = [];
const lineCount = (relative) => readFileSync(join(root, relative), "utf8").split(/\r?\n/).length;

const check = (relative, line, where) => {
  if (!existsSync(join(root, relative))) {
    problems.push(`${where}: no such file ${relative}`);
    return;
  }
  if (line === undefined) return;
  const total = lineCount(relative);
  if (line < 1 || line > total) {
    problems.push(`${where}: ${relative}:${line} is out of range (file has ${total} lines)`);
  }
};

// 1. CodeTours
for (const name of readdirSync(join(root, ".tours"))) {
  if (!name.endsWith(".tour")) continue;
  const tour = JSON.parse(readFileSync(join(root, ".tours", name), "utf8"));
  tour.steps.forEach((step, index) => {
    check(step.file, step.line, `.tours/${name} step ${index + 1}`);
  });
}

// 2. `file:line` citations and relative links in the markdown packet
const markdown = ["README.md"];
const walk = (dir) => {
  for (const entry of readdirSync(join(root, dir))) {
    const relative = `${dir}/${entry}`;
    if (statSync(join(root, relative)).isDirectory()) walk(relative);
    else if (entry.endsWith(".md")) markdown.push(relative);
  }
};
walk("docs");
walk("promotion");

const CITATION = /`([\w./-]+\.(?:ts|tsx|mjs|js|html|json)):(\d+)`/g;
const LINK = /\]\((?!https?:|#|mailto:)([^)#]+)(?:#[^)]*)?\)/g;

for (const file of markdown) {
  const text = readFileSync(join(root, file), "utf8");
  for (const [, path, line] of text.matchAll(CITATION)) {
    if (!path.includes("/")) continue; // bare filenames are prose, not pointers
    check(path, Number(line), file);
  }
  for (const [, target] of text.matchAll(LINK)) {
    const from = join(root, dirname(file), decodeURI(target));
    if (!existsSync(from)) problems.push(`${file}: broken link -> ${target}`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.stderr.write(`\n${problems.length} broken doc pointer(s)\n`);
  process.exit(1);
}
process.stdout.write(`docs ok: ${markdown.length} markdown files, all tour steps resolve\n`);
