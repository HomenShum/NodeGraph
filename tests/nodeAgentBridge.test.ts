import { describe, expect, it } from "vitest";
import type { Actor, Artifact, DataframeColumn, Element, Proposal, TraceEvent } from "../src/types";
import { buildSemanticGraph } from "../src/semanticGraph";
import {
  NODEGRAPH_AGENT_SYSTEM_PROMPT,
  buildNodeGraphAgentContext,
  createNodeGraphAgentTools,
  runNodeGraphNodeAgent,
  type NodeGraphAgentToolLike,
} from "../src/nodeAgentBridge";

const human: Actor = { kind: "user", id: "u-maya", name: "Maya" };
const agent: Actor = { kind: "agent", id: "room-nodeagent", name: "Room NodeAgent", scope: "public" };
const columns: DataframeColumn[] = [
  { id: "company", label: "Company", order: 0 },
  { id: "owner", label: "Owner", order: 1 },
  { id: "funding", label: "Funding", order: 2 },
  { id: "risk", label: "Risk", order: 3 },
];

const cell = (id: string, value: unknown, updatedBy: Actor = human): Element => ({
  id,
  value,
  updatedBy,
  version: 1,
  updatedAt: 1,
});

const sheet: Artifact = {
  id: "company-research",
  roomId: "room-1",
  kind: "sheet",
  title: "Company research",
  version: 2,
  createdBy: human,
  updatedAt: 2,
  order: ["r1__company", "r1__owner", "r1__funding", "r1__risk"],
  elements: {
    "r1__company": cell("r1__company", "CardioNova"),
    "r1__owner": cell("r1__owner", "Maya"),
    "r1__funding": cell("r1__funding", {
      value: "$14M Series A",
      status: "complete",
      evidence: [{ id: "ev-series-a", kind: "source", label: "Series A source", url: "https://source.example/cardionova" }],
    }, agent),
    "r1__risk": cell("r1__risk", { value: "Needs HIPAA evidence", status: "needs_review" }, agent),
  },
  meta: { dataframe: { columns, rowCount: 1 } },
};

const trace: TraceEvent = {
  id: "trace-cardionova",
  roomId: "room-1",
  ts: 4,
  actor: agent,
  type: "agent_status",
  summary: "Room NodeAgent researched CardioNova evidence",
  refs: { artifactId: "company-research", elementId: "r1__funding" },
};

const proposal: Proposal = {
  id: "proposal-hipaa",
  roomId: "room-1",
  artifactId: "company-research",
  op: { opId: "op-hipaa", artifactId: "company-research", elementId: "r1__risk", kind: "set", value: "HIPAA source attached", baseVersion: 1 },
  author: agent,
  status: "pending",
  createdAt: 5,
};

const graph = buildSemanticGraph({ roomId: "room-1", artifacts: [sheet], traces: [trace], proposals: [proposal] });

describe("NodeAgent bridge", () => {
  it("creates NodeAgent-compatible tools for overview, search, evidence, selection, and open questions", async () => {
    const focused: string[] = [];
    const tools = createNodeGraphAgentTools({ getGraph: () => graph, onFocusNode: (nodeId) => { focused.push(nodeId); } });
    expect(tools.map((tool) => tool.name)).toEqual([
      "nodegraph_overview",
      "nodegraph_search",
      "nodegraph_select_neighborhood",
      "nodegraph_evidence_summary",
      "nodegraph_open_questions",
    ]);

    const search = await requiredTool(tools, "nodegraph_search").execute({ query: "CardioNova", limit: 5 }, {});
    expect(JSON.stringify(search)).toContain("CardioNova");

    const company = graph.nodes.find((node) => node.kind === "company" && node.label === "CardioNova");
    expect(company).toBeTruthy();
    const selection = await requiredTool(tools, "nodegraph_select_neighborhood").execute({ nodeId: company!.id, hops: 2 }, {});
    expect(JSON.stringify(selection)).toContain("Series A source");
    expect(focused).toContain(company!.id);

    const questions = await requiredTool(tools, "nodegraph_open_questions").execute({ limit: 5 }, {});
    expect(JSON.stringify(questions)).toContain("Needs HIPAA evidence");
  });

  it("builds compact NodeAgent context and runs through a NodeAgent-compatible runner", async () => {
    const context = await buildNodeGraphAgentContext({ getGraph: () => graph }, "Explain graph risks");
    expect(context[0].role).toBe("user");
    expect(context[0].content).toContain("NodeGraph context");

    const result = await runNodeGraphNodeAgent({
      runAgent: async (opts) => {
        expect(opts.systemPrompt).toBe(NODEGRAPH_AGENT_SYSTEM_PROMPT);
        const messages = await opts.contextBuilder?.(opts.rt, opts.goal);
        expect(messages?.[0]?.content).toContain("Explain graph risks");
        const tool = requiredTool(opts.tools, "nodegraph_open_questions");
        const output = await tool.execute({ limit: 3 }, opts.rt);
        return { finalText: "NodeAgent bridge complete", output };
      },
      rt: {},
      model: { name: "scripted-nodeagent" },
      goal: "Explain graph risks",
      getGraph: () => graph,
    });

    expect(result.finalText).toBe("NodeAgent bridge complete");
    expect(JSON.stringify(result.output)).toContain("HIPAA");
  });
});

function requiredTool(tools: NodeGraphAgentToolLike[], name: string): NodeGraphAgentToolLike {
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}
