import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { isAbsolute, extname, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm",
};

// The verifier uses this exact HTTP handler on an OS-assigned port. It never
// grades a pre-existing process or exposes the repository's private dotfiles.
export async function startDemoServer({ root = defaultRoot, port = 0 } = {}) {
  const servedRoot = realpathSync(root);
  const server = createServer((request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { allow: "GET, HEAD" }).end("method not allowed");
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const name = pathname === "/" ? "demo/index.html"
        : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
      const parts = name.split(/[\\/]/);
      // The MCP viewer deliberately tails this one accepted-event artifact.
      // Other dotfiles, including credentials and Git metadata, remain private.
      const eventLog = name === ".nodegraph/events.jsonl";
      if ((!eventLog && parts.some((part) => part.startsWith(".") || part.includes(":"))) || !contentTypes[extname(name)]) {
        response.writeHead(403).end("forbidden");
        return;
      }
      const target = realpathSync(resolve(servedRoot, name));
      const within = relative(servedRoot, target);
      if (isAbsolute(within) || within.startsWith(`..${sep}`) || within === ".." || !statSync(target).isFile()) {
        response.writeHead(403).end("forbidden");
        return;
      }
      const stream = createReadStream(target);
      stream.once("error", () => {
        if (!response.headersSent) response.writeHead(404).end("not found");
        else response.destroy();
      });
      stream.once("open", () => {
        response.writeHead(200, {
          "content-type": contentTypes[extname(target)],
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        if (request.method === "HEAD") { stream.destroy(); response.end(); }
        else pipeline(stream, response, () => {}); // pipeline destroys both ends on a read/write failure
      });
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  await new Promise((ready, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", ready);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done, reject) => {
      server.close((error) => error ? reject(error) : done());
      server.closeAllConnections();
    }),
  };
}

// The optional second argument only changes the printed URL; it does not
// remap relative module paths. Compose needs the deliberately wider repo root.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [rootArg, openArg] = process.argv.slice(2);
  const server = await startDemoServer({ root: rootArg ?? defaultRoot, port: Number(process.env.NODEGRAPH_DEMO_PORT ?? 4173) });
  process.stdout.write(`NodeGraph demo: ${server.url}${openArg ?? "/"}\n`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => void server.close());
}
