import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const graphPath = join(here, "nodegraph-showcase.json");
const port = Number.parseInt(process.env.NODEGRAPH_NODEAGENT_PORT ?? "8787", 10);
const host = process.env.NODEGRAPH_NODEAGENT_HOST ?? "127.0.0.1";

const graphPromise = readJson(graphPath);
const bridgePromise = import(pathToFileURL(join(repoRoot, "dist", "index.js")).href).catch((error) => {
  throw new Error(`NodeGraph dist is not built. Run "npm run build" first.\n${error instanceof Error ? error.message : String(error)}`);
});

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      writeJson(res, 200, { ok: true, service: "nodegraph-nodeagent" });
      return;
    }

    if (req.method !== "POST" || req.url !== "/agent") {
      writeJson(res, 404, { ok: false, error: "Not found" });
      return;
    }

    const body = await readBody(req);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const selectedNodeId = typeof body.selectedNodeId === "string" && body.selectedNodeId ? body.selectedNodeId : undefined;
    if (!prompt) {
      writeJson(res, 400, { ok: false, error: "prompt is required" });
      return;
    }

    const graph = await graphPromise;
    const { runNodeGraphNodeAgent } = await bridgePromise;
    const result = await runNodeGraphNodeAgent({
      getGraph: () => graph,
      selectedNodeId,
      rt: { selectedNodeId, graph },
      model: { id: "nodegraph-demo-agent" },
      goal: prompt,
      maxSteps: 4,
      runAgent: runDemoNodeAgent,
    });
    writeJson(res, 200, { ok: true, ...result });
  } catch (error) {
    writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`NodeGraph NodeAgent bridge listening on http://${host}:${port}`);
});

async function runDemoNodeAgent({ rt, goal, tools, contextBuilder }) {
  const context = contextBuilder ? await contextBuilder(rt, goal) : [];
  const text = [goal, ...context.map((message) => message.content)].join("\n").toLowerCase();
  const selectedNodeId = typeof rt?.selectedNodeId === "string" ? rt.selectedNodeId : defaultCompanyNodeId(rt?.graph);
  const chosen = chooseToolPlan(text, tools, selectedNodeId);
  const startedAt = performance.now();
  const result = await chosen.tool.execute(chosen.args, rt);
  const ms = Math.round(performance.now() - startedAt);
  return {
    finalText: summarizeAgentResult(chosen.tool.name, result),
    trace: [{ tool: chosen.tool.name, ms, result }],
    raw: result,
  };
}

function chooseToolPlan(text, tools, selectedNodeId) {
  const choose = (name) => {
    const tool = tools.find((item) => item.name === name);
    if (!tool) throw new Error(`Missing NodeGraph tool: ${name}`);
    return tool;
  };
  if (/review|gap|blocker|open question|risk|missing/.test(text)) {
    return { tool: choose("nodegraph_open_questions"), args: { limit: 10 } };
  }
  if (/who|person|people|researched|agent|changed|trace|touched/.test(text)) {
    return { tool: choose("nodegraph_search"), args: { query: "Maya", limit: 12 } };
  }
  if (/evidence|source|citation|support|backed|prove/.test(text)) {
    return { tool: choose("nodegraph_evidence_summary"), args: { nodeId: selectedNodeId, limit: 12 } };
  }
  return { tool: choose("nodegraph_select_neighborhood"), args: { nodeId: selectedNodeId, hops: 2 } };
}

function summarizeAgentResult(toolName, result) {
  const data = result && typeof result === "object" ? result : {};
  if (toolName === "nodegraph_open_questions") {
    const questions = Array.isArray(data.questions) ? data.questions.length : 0;
    return `NodeAgent found ${questions} review item${questions === 1 ? "" : "s"} in the graph. Treat needs_review relationships as blockers until a source or trace receipt is attached.`;
  }
  if (toolName === "nodegraph_evidence_summary") {
    const backed = Array.isArray(data.sourceBackedNodes) ? data.sourceBackedNodes.length : 0;
    const review = Array.isArray(data.needsReviewNodes) ? data.needsReviewNodes.length : 0;
    return `NodeAgent found ${backed} source-backed node${backed === 1 ? "" : "s"} and ${review} needs-review node${review === 1 ? "" : "s"} around the current focus.`;
  }
  if (toolName === "nodegraph_search") {
    const total = typeof data.totalMatches === "number" ? data.totalMatches : 0;
    return `NodeAgent searched people and agent context and found ${total} matching node${total === 1 ? "" : "s"}. This is the path for person-to-company research, agent trace links, and each person's project or achievement clusters.`;
  }
  const selected = data.selected && typeof data.selected === "object" ? data.selected : undefined;
  const sections = Array.isArray(data.sections) ? data.sections.length : 0;
  return `NodeAgent expanded ${selected?.label ?? "the graph focus"} across ${sections} relationship section${sections === 1 ? "" : "s"}, including nearby evidence, people, traces, projects, achievements, and open questions when present.`;
}

function defaultCompanyNodeId(graph) {
  return graph?.nodes?.find((node) => node.kind === "company")?.id ?? graph?.nodes?.[0]?.id ?? "company:cardionova";
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function writeJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(payload));
}
