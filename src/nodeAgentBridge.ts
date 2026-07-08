import { z, type ZodTypeAny } from "zod";
import { applySemanticGraphFilters } from "./semanticGraphFilters";
import { semanticNodePrimaryAction, selectSemanticNeighborhood } from "./semanticGraphSelectors";
import type {
  SemanticGraphEdge,
  SemanticGraphFilters,
  SemanticGraphNode,
  SemanticGraphSelection,
  SemanticGraphViewModel,
} from "./semanticGraphTypes";

export interface NodeGraphAgentMessageLike {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolCallId?: string;
}

export interface NodeGraphAgentToolLike {
  name: string;
  description: string;
  schema: ZodTypeAny;
  execute(args: unknown, rt: unknown): Promise<unknown>;
}

export type NodeGraphProvider = () => SemanticGraphViewModel | Promise<SemanticGraphViewModel>;

export interface NodeGraphAgentToolOptions {
  getGraph: NodeGraphProvider;
  onFocusNode?: (nodeId: string) => void | Promise<void>;
  onApplyFilters?: (filters: SemanticGraphFilters) => void | Promise<void>;
}

export interface NodeGraphAgentContextOptions {
  getGraph: NodeGraphProvider;
  selectedNodeId?: string | null;
}

export type NodeGraphNodeAgentRunFunction<TResult = unknown> = (opts: {
  rt: unknown;
  goal: string;
  model: unknown;
  tools: NodeGraphAgentToolLike[];
  maxSteps?: number;
  contextBuilder?: (rt: unknown, goal: string) => Promise<NodeGraphAgentMessageLike[]>;
  systemPrompt?: string;
}) => Promise<TResult>;

export interface RunNodeGraphNodeAgentOptions<TResult = unknown> extends NodeGraphAgentToolOptions {
  runAgent: NodeGraphNodeAgentRunFunction<TResult>;
  rt: unknown;
  model: unknown;
  goal: string;
  baseTools?: NodeGraphAgentToolLike[];
  selectedNodeId?: string | null;
  maxSteps?: number;
  systemPrompt?: string;
}

export const NODEGRAPH_AGENT_SYSTEM_PROMPT = [
  "You are NodeRoom NodeAgent working over a semantic entity graph.",
  "Use nodegraph_* tools for graph facts, provenance, neighborhoods, and open questions.",
  "Do not claim a fact is source-backed unless the node or edge status is source_backed and refs include evidence/source information.",
  "When the graph shows needs_review, explain the gap and point to the relevant node, edge, trace, proposal, or source ref.",
  "Return concise product-facing guidance and include the exact node ids or source refs that justify the answer.",
].join("\n");

const searchSchema = z.object({
  query: z.string().default(""),
  nodeKinds: z.array(z.string()).optional(),
  evidenceBackedOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).default(12),
});

const selectSchema = z.object({
  nodeId: z.string(),
  hops: z.number().int().min(1).max(4).default(2),
});

const evidenceSchema = z.object({
  nodeId: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(16),
});

const openQuestionsSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(16),
});

const overviewSchema = z.object({});

export function createNodeGraphAgentTools(options: NodeGraphAgentToolOptions): NodeGraphAgentToolLike[] {
  return [
    {
      name: "nodegraph_overview",
      description: "Summarize the semantic graph inventory, node kinds, relationship kinds, source-backed facts, open questions, and high-weight nodes.",
      schema: overviewSchema,
      async execute() {
        const graph = await resolveGraph(options.getGraph);
        return graphOverview(graph);
      },
    },
    {
      name: "nodegraph_search",
      description: "Search NodeGraph nodes and relationships by query, kind, and evidence status. Returns compact nodes and their connected edges.",
      schema: searchSchema,
      async execute(rawArgs) {
        const args = searchSchema.parse(rawArgs ?? {});
        const graph = await resolveGraph(options.getGraph);
        const filters: SemanticGraphFilters = {
          query: args.query,
          evidenceBackedOnly: args.evidenceBackedOnly,
          nodeKinds: args.nodeKinds ? new Set(args.nodeKinds as any) : undefined,
        };
        await options.onApplyFilters?.(filters);
        const filtered = applySemanticGraphFilters(graph, filters);
        const nodes = filtered.nodes.slice(0, args.limit);
        const nodeIds = new Set(nodes.map((node) => node.id));
        const edges = filtered.edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target)).slice(0, args.limit * 2);
        return {
          query: args.query,
          filters: {
            nodeKinds: args.nodeKinds ?? [],
            evidenceBackedOnly: Boolean(args.evidenceBackedOnly),
          },
          nodes: nodes.map(compactNode),
          edges: edges.map(compactEdge),
          totalMatches: filtered.nodes.length,
        };
      },
    },
    {
      name: "nodegraph_select_neighborhood",
      description: "Select a node and return its semantic neighborhood, sections, primary action, connected evidence, traces, proposals, and open questions.",
      schema: selectSchema,
      async execute(rawArgs) {
        const args = selectSchema.parse(rawArgs ?? {});
        const graph = await resolveGraph(options.getGraph);
        const selection = selectSemanticNeighborhood(graph, args.nodeId, args.hops);
        await options.onFocusNode?.(args.nodeId);
        return compactSelection(selection);
      },
    },
    {
      name: "nodegraph_evidence_summary",
      description: "Return source-backed and needs-review evidence around the whole graph or around a selected node.",
      schema: evidenceSchema,
      async execute(rawArgs) {
        const args = evidenceSchema.parse(rawArgs ?? {});
        const graph = await resolveGraph(options.getGraph);
        const selection = args.nodeId ? selectSemanticNeighborhood(graph, args.nodeId, 2) : undefined;
        const scopedNodeIds = selection?.nodeIds;
        const scopedEdgeIds = selection?.edgeIds;
        const nodes = graph.nodes
          .filter((node) => (!scopedNodeIds || scopedNodeIds.has(node.id)) && (node.status === "source_backed" || node.status === "needs_review" || node.kind === "source" || node.kind === "evidence_fact" || node.kind === "open_question"))
          .slice(0, args.limit);
        const edges = graph.edges
          .filter((edge) => (!scopedEdgeIds || scopedEdgeIds.has(edge.id)) && (edge.status === "source_backed" || edge.status === "needs_review" || edge.kind === "supported_by" || edge.kind === "cited" || edge.kind === "reviewed"))
          .slice(0, args.limit * 2);
        return {
          selectedNodeId: args.nodeId,
          sourceBackedNodes: nodes.filter((node) => node.status === "source_backed").map(compactNode),
          needsReviewNodes: nodes.filter((node) => node.status === "needs_review").map(compactNode),
          evidenceEdges: edges.map(compactEdge),
        };
      },
    },
    {
      name: "nodegraph_open_questions",
      description: "List graph open questions and needs-review blockers with connected companies, sources, traces, and proposals.",
      schema: openQuestionsSchema,
      async execute(rawArgs) {
        const args = openQuestionsSchema.parse(rawArgs ?? {});
        const graph = await resolveGraph(options.getGraph);
        const query = args.query?.trim().toLowerCase();
        const questions = graph.nodes
          .filter((node) => node.kind === "open_question" || node.status === "needs_review")
          .filter((node) => !query || `${node.label} ${node.subtitle ?? ""} ${node.kind}`.toLowerCase().includes(query))
          .slice(0, args.limit);
        return {
          query: args.query ?? "",
          questions: questions.map((node) => ({
            node: compactNode(node),
            neighborhood: compactSelection(selectSemanticNeighborhood(graph, node.id, 1)),
          })),
        };
      },
    },
  ];
}

export async function buildNodeGraphAgentContext(options: NodeGraphAgentContextOptions, goal: string): Promise<NodeGraphAgentMessageLike[]> {
  const graph = await resolveGraph(options.getGraph);
  const selected = options.selectedNodeId ? graph.nodes.find((node) => node.id === options.selectedNodeId) : undefined;
  const overview = graphOverview(graph);
  return [{
    role: "user",
    content: [
      `Goal: ${goal}`,
      "NodeGraph context:",
      JSON.stringify({
        stats: overview.stats,
        nodeKinds: overview.nodeKinds,
        edgeKinds: overview.edgeKinds,
        topNodes: overview.topNodes,
        selectedNode: selected ? compactNode(selected) : undefined,
      }, null, 2),
      "Use nodegraph_* tools for details before answering.",
    ].join("\n"),
  }];
}

export function createNodeGraphAgentContextBuilder(options: NodeGraphAgentContextOptions): (rt: unknown, goal: string) => Promise<NodeGraphAgentMessageLike[]> {
  return async (_rt, goal) => buildNodeGraphAgentContext(options, goal);
}

export async function runNodeGraphNodeAgent<TResult = unknown>(options: RunNodeGraphNodeAgentOptions<TResult>): Promise<TResult> {
  const graphTools = createNodeGraphAgentTools({
    getGraph: options.getGraph,
    onFocusNode: options.onFocusNode,
    onApplyFilters: options.onApplyFilters,
  });
  return options.runAgent({
    rt: options.rt,
    goal: options.goal,
    model: options.model,
    tools: [...(options.baseTools ?? []), ...graphTools],
    maxSteps: options.maxSteps ?? 6,
    contextBuilder: createNodeGraphAgentContextBuilder({
      getGraph: options.getGraph,
      selectedNodeId: options.selectedNodeId,
    }),
    systemPrompt: options.systemPrompt ?? NODEGRAPH_AGENT_SYSTEM_PROMPT,
  });
}

async function resolveGraph(getGraph: NodeGraphProvider): Promise<SemanticGraphViewModel> {
  return getGraph();
}

function graphOverview(graph: SemanticGraphViewModel) {
  return {
    stats: graph.stats,
    generatedFrom: graph.generatedFrom,
    nodeKinds: countBy(graph.nodes, (node) => node.kind),
    edgeKinds: countBy(graph.edges, (edge) => edge.kind),
    statuses: countBy(graph.nodes, (node) => node.status),
    topNodes: [...graph.nodes]
      .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
      .slice(0, 12)
      .map(compactNode),
  };
}

function compactSelection(selection: SemanticGraphSelection) {
  return {
    selected: selection.selected ? compactNode(selection.selected) : undefined,
    selectedEdge: selection.selectedEdge ? compactEdge(selection.selectedEdge) : undefined,
    nodeIds: [...selection.nodeIds],
    edgeIds: [...selection.edgeIds],
    sections: selection.sections.map((section) => ({
      id: section.id,
      label: section.label,
      nodes: section.nodes.map(compactNode),
      edges: section.edges.map(compactEdge),
    })),
    primaryAction: selection.selected ? semanticNodePrimaryAction(selection.selected) : null,
  };
}

function compactNode(node: SemanticGraphNode) {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    subtitle: node.subtitle,
    status: node.status,
    refs: node.refs.slice(0, 6),
    clusterIds: node.clusterIds,
    weight: node.weight,
    meta: node.meta,
    primaryAction: semanticNodePrimaryAction(node),
  };
}

function compactEdge(edge: SemanticGraphEdge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: edge.kind,
    label: edge.label,
    status: edge.status,
    refs: edge.refs.slice(0, 6),
    weight: edge.weight,
  };
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyOf(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
