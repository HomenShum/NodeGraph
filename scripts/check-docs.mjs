/**
 * Docs that point at line numbers rot the moment a file moves. Checking only
 * that the number is in range proves the anchor is STABLE, never that it is
 * CORRECT: a twenty-line drift inside a six-hundred-line file passes silently,
 * and a citation can name one symbol while pointing at another entirely.
 *
 * So every pointer carries what it expects to find, and this asserts the cited
 * line MATCHES it:
 *
 *   - every step in `.tours/*.tour` carries a `pattern` (CodeTour's own field),
 *     and the cited line must be the FIRST line matching it — which is exactly
 *     the line CodeTour itself jumps to, so the tour and this check agree
 *   - every citation in the markdown packet is written `symbol` (`path:line`),
 *     and the cited line must contain that symbol
 *   - a pointer with no symbol, or a bare "(line 42)" naming no file, is
 *     refused rather than silently skipped
 *   - every relative markdown link points at something
 *
 * Run: npm run docs:check
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const problems = [];

/** The cited file's lines, or null (with a problem recorded) if it cannot be cited. */
const cite = (relative, line, where) => {
  if (!existsSync(join(root, relative))) {
    problems.push(`${where}: no such file ${relative}`);
    return null;
  }
  const lines = readFileSync(join(root, relative), "utf8").split(/\r?\n/);
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    problems.push(`${where}: ${relative}:${line} is out of range (file has ${lines.length} lines)`);
    return null;
  }
  return lines;
};

// 1. CodeTours — the cited line must be the first line matching the step's pattern.
let steps = 0;
for (const name of readdirSync(join(root, ".tours"))) {
  if (!name.endsWith(".tour")) continue;
  const tour = JSON.parse(readFileSync(join(root, ".tours", name), "utf8"));
  tour.steps.forEach((step, index) => {
    steps += 1;
    const where = `.tours/${name} step ${index + 1}`;
    if (!step.pattern) {
      problems.push(`${where}: no "pattern" — a step must declare what its line contains`);
      return;
    }
    const lines = cite(step.file, step.line, where);
    if (!lines) return;
    const first = lines.findIndex((line) => new RegExp(step.pattern).test(line)) + 1;
    if (first === 0) {
      problems.push(`${where}: /${step.pattern}/ matches nothing in ${step.file}`);
    } else if (first !== step.line) {
      problems.push(
        `${where}: /${step.pattern}/ first matches ${step.file}:${first}, ` +
          `but the step cites :${step.line} — CodeTour would open :${first}`,
      );
    }
  });
}

// 2. Citations and relative links in the markdown packet
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

const SOURCE = String.raw`[\w./-]+\.(?:ts|tsx|mjs|js|html|json|md)`;
// `what the line says` (`path/to/file.ts:123`) — the only accepted citation form.
const CITATION = new RegExp(String.raw`\`([^\`\n]{1,160})\`\s*\(\`(${SOURCE}):(\d+)\`\)`, "g");
// Any surviving pointer had no symbol in front of it.
const POINTER = new RegExp(String.raw`\`(${SOURCE}):(\d+(?:-\d+)?)\``, "g");
// "(line 42)" names a line but no file, so nothing can check it.
const LOOSE = /\(lines? \d+(?:-\d+)?\)/g;
const LINK = /\]\((?!https?:|#|mailto:)([^)#]+)(?:#[^)]*)?\)/g;

let citations = 0;
for (const file of markdown) {
  const text = readFileSync(join(root, file), "utf8");
  const rest = text.replace(CITATION, (_, expected, path, line) => {
    citations += 1;
    const lines = cite(path, Number(line), file);
    if (lines && !lines[Number(line) - 1].includes(expected)) {
      problems.push(
        `${file}: cites \`${expected}\` at ${path}:${line}, but that line reads ` +
          `"${lines[Number(line) - 1].trim()}"`,
      );
    }
    return "";
  });
  for (const [, path, line] of rest.matchAll(POINTER)) {
    problems.push(
      `${file}: \`${path}:${line}\` carries nothing to check it against — ` +
        `write \`symbol\` (\`${path}:${line}\`)`,
    );
  }
  for (const [loose] of rest.matchAll(LOOSE)) {
    problems.push(`${file}: "${loose}" names a line but no file — write \`symbol\` (\`path/to/file.ts:N\`)`);
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
process.stdout.write(
  `docs ok: ${steps} tour steps and ${citations} citations in ${markdown.length} markdown files ` +
    `all resolve to a line matching what they claim\n`,
);
