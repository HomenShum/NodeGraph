import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Static file server for any page in this repo that is plain ESM plus an
// import map, i.e. needs no bundler. Two optional arguments:
//
//   node scripts/serve-demo.mjs
//     -> serves render/, open http://127.0.0.1:4173/
//   node render/scripts/serve-demo.mjs . /examples/compose/index.html
//     -> serves the repo root, open http://127.0.0.1:4173/examples/compose/index.html
//
// The second argument only decides which URL is printed; it does NOT remap "/",
// because a page moved to "/" would resolve its own `./compose.js` against the
// wrong directory. The root README's compose page needs the wider root because
// it imports `dist/` from BOTH layers. Paths outside the served root are
// refused below, so widening the root is a deliberate argument, never a default.
const [rootArg, openArg] = process.argv.slice(2);
const root = resolve(rootArg ?? fileURLToPath(new URL("../", import.meta.url)));
const openPath = openArg ?? "/";
const port = Number(process.env.NODEGRAPH_DEMO_PORT ?? 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const relative = pathname === "/" ? "demo/index.html" : pathname.slice(1);
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end("forbidden");
    return;
  }
  try {
    if (!statSync(target).isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "content-type": contentTypes[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`NodeGraph demo: http://127.0.0.1:${port}${openPath}\n`);
});
