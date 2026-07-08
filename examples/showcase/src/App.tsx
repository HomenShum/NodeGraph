import { useMemo, useState, type CSSProperties } from "react";
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { Search, Sparkles } from "lucide-react";
import {
  EntityGraphDetailPanel,
  NodeGraphAgentPanel,
  applySemanticGraphFilters,
  buildSemanticGraph,
  createNodeGraphAgentTools,
  layoutSemanticGraph,
  selectSemanticNeighborhood,
  type NodeGraphAgentPanelRequest,
  type SemanticGraphNodeKind,
} from "../../../src";
import { agent, companyResearch, members, notebook, proposals, traceEvents } from "./demoData";

const COLORS: Record<string, string> = {
  company: "#5fd0a0",
  person: "#ff9e6a",
  agent_job: "#ff9e6a",
  funding: "#e07060",
  source: "#ffd16a",
  evidence_fact: "#ffd16a",
  artifact: "#6aa9ff",
  spreadsheet_row: "#6aa9ff",
  notebook_block: "#b794f4",
  trace_step: "#60d0e0",
  proposal: "#c060d0",
  open_question: "#f0a040",
  project: "#60d0e0",
  achievement: "#f6d365",
  event: "#f0a040",
};

const FILTER_KINDS: SemanticGraphNodeKind[] = ["company", "person", "funding", "source", "evidence_fact", "trace_step", "open_question", "agent_job"];

function GraphNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; kind: string; color: string; dimmed: boolean; selected: boolean };
  return (
    <div className={`ng-node ${d.selected ? "selected" : ""}`} style={{ "--ng-color": d.color, opacity: d.dimmed ? 0.18 : 1 } as CSSProperties}>
      <Handle id="target" type="target" position={Position.Left} />
      <span className="dot" />
      <span>{d.label}</span>
      <em>{d.kind.replace(/_/g, " ")}</em>
      <Handle id="source" type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { semantic: GraphNode };

export function ShowcaseApp() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [evidenceOnly, setEvidenceOnly] = useState(false);
  const graph = useMemo(() => buildSemanticGraph({
    roomId: "showcase-room",
    artifacts: [companyResearch, notebook],
    members,
    traces: traceEvents,
    proposals,
    sessions: [{ id: "session-1", roomId: "showcase-room", agentId: agent.id, agentName: agent.name, scope: "public", status: "working", lastAction: "verifying CardioNova evidence", updatedAt: 12 }],
    maxRowsPerSheet: 24,
  }), []);
  const filtered = useMemo(() => applySemanticGraphFilters(graph, { query, evidenceBackedOnly: evidenceOnly }), [graph, query, evidenceOnly]);
  const nodeIds = useMemo(() => new Set(filtered.nodes.map((node) => node.id)), [filtered]);
  const selected = nodeIds.has(selectedId ?? "") ? selectedId : filtered.nodes.find((node) => node.kind === "company" && node.label === "CardioNova")?.id ?? null;
  const fullSelection = useMemo(() => selectSemanticNeighborhood(filtered, selected, 2), [filtered, selected]);
  const renderGraph = useMemo(() => {
    if (fullSelection.nodeIds.size === 0) return filtered;
    const keep = new Set([...fullSelection.nodeIds].slice(0, 34));
    const nodesForRender = filtered.nodes.filter((node) => keep.has(node.id));
    const edgesForRender = filtered.edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target));
    const edgeIds = new Set(edgesForRender.map((edge) => edge.id));
    return {
      ...filtered,
      nodes: nodesForRender,
      edges: edgesForRender,
      clusters: filtered.clusters.map((cluster) => ({
        ...cluster,
        nodeIds: cluster.nodeIds.filter((nodeIdValue) => keep.has(nodeIdValue)),
        edgeIds: cluster.edgeIds.filter((edgeIdValue) => edgeIds.has(edgeIdValue)),
      })).filter((cluster) => cluster.nodeIds.length > 1),
      stats: { ...filtered.stats, visibleNodes: nodesForRender.length, visibleEdges: edgesForRender.length },
    };
  }, [filtered, fullSelection]);
  const selection = useMemo(() => selectSemanticNeighborhood(renderGraph, selected, 2), [renderGraph, selected]);
  const positions = useMemo(() => layoutSemanticGraph(renderGraph, { selectedId: selected }), [renderGraph, selected]);

  const nodes: Node[] = renderGraph.nodes.map((node) => {
    const label = node.label.length > 32 ? `${node.label.slice(0, 29).trim()}...` : node.label;
    return {
      id: node.id,
      type: "semantic",
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        label,
        kind: node.kind,
        color: COLORS[node.kind] ?? "#94a3b8",
        dimmed: selection.nodeIds.size > 0 && !selection.nodeIds.has(node.id),
        selected: selected === node.id,
      },
      draggable: true,
    };
  });

  const edges: Edge[] = renderGraph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: "source",
    targetHandle: "target",
    label: selection.edgeIds.has(edge.id) ? edge.label : undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(190,198,208,.6)" },
    style: {
      stroke: "rgba(190,198,208,.52)",
      opacity: selection.edgeIds.size === 0 || selection.edgeIds.has(edge.id) ? 0.72 : 0.12,
      strokeWidth: selection.edgeIds.has(edge.id) ? 1.5 : 1,
    },
    labelStyle: { fill: "#aab4c2", fontSize: 10, fontWeight: 800 },
    labelBgStyle: { fill: "#14181d", fillOpacity: 0.92 },
  }));

  const focus = (label: string) => {
    setQuery(label);
    window.setTimeout(() => {
      const node = graph.nodes.find((item) => item.label.toLowerCase().includes(label.toLowerCase()));
      setSelectedId(node?.id ?? null);
    }, 40);
  };
  const runShowcaseNodeAgent = async (request: NodeGraphAgentPanelRequest) => {
    const tools = createNodeGraphAgentTools({
      getGraph: () => request.graph,
      onFocusNode: setSelectedId,
      onApplyFilters: (filters) => {
        if (filters.query !== undefined) setQuery(filters.query);
        if (filters.evidenceBackedOnly !== undefined) setEvidenceOnly(filters.evidenceBackedOnly);
      },
    });
    const promptLower = request.prompt.toLowerCase();
    const companyNodeId = request.graph.nodes.find((node) => node.kind === "company")?.id;
    const selectedNode = request.selectedNodeId ?? companyNodeId ?? request.graph.nodes[0]?.id;
    const choose = (name: string) => tools.find((tool) => tool.name === name)!;
    const planned = /review|gap|open question|blocker/.test(promptLower)
      ? { tool: choose("nodegraph_open_questions"), args: { limit: 8 } }
      : /evidence|source|support|citation/.test(promptLower)
        ? { tool: choose("nodegraph_evidence_summary"), args: { nodeId: selectedNode, limit: 10 } }
        : /who|researched|agent|changed|trace/.test(promptLower)
          ? { tool: choose("nodegraph_search"), args: { query: "Maya", limit: 10 } }
          : { tool: choose("nodegraph_select_neighborhood"), args: { nodeId: selectedNode, hops: 2 } };
    const result = await planned.tool.execute(planned.args, {});
    return {
      finalText: summarizeShowcaseAgentResult(planned.tool.name, result),
      trace: [{ tool: planned.tool.name, result }],
      raw: result,
    };
  };

  return (
    <main className="showcase" data-testid="nodegraph-showcase">
      <section className="hero">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> NodeGraph</span>
          <h1>Evidence-backed entity maps for agent rooms.</h1>
          <p>Derive people, companies, spreadsheet rows, notebook blocks, traces, proposals, and sources from working product data.</p>
        </div>
        <div className="heroStats">
          <strong>{graph.stats.nodes}</strong><span>nodes</span>
          <strong>{graph.stats.edges}</strong><span>semantic links</span>
          <strong>{graph.stats.backedFacts}</strong><span>source-backed facts</span>
        </div>
      </section>

      <section className="workspace">
        <aside className="rail">
          <label className="search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search CardioNova, Maya, source..." />
          </label>
          <div className="chips">
            {FILTER_KINDS.map((kind) => (
              <button key={kind} type="button" onClick={() => setQuery(kind === "company" ? "" : kind.replace(/_/g, " "))}>
                <span style={{ background: COLORS[kind] }} /> {kind.replace(/_/g, " ")}
              </button>
            ))}
          </div>
          <button className={evidenceOnly ? "toggle on" : "toggle"} type="button" onClick={() => setEvidenceOnly((value) => !value)}>Evidence-backed only</button>
          <div className="story">
            <button type="button" onClick={() => focus("CardioNova")}>CardioNova diligence map</button>
            <button type="button" onClick={() => focus("Maya")}>Who researched the company?</button>
            <button type="button" onClick={() => focus("Series A")}>Show funding evidence</button>
            <button type="button" onClick={() => focus("HIPAA")}>Open risk questions</button>
          </div>
        </aside>

        <div className="graphPane">
          <ReactFlow
            key={`${query}-${evidenceOnly}-${selected ?? "none"}-${renderGraph.nodes.length}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.22, maxZoom: 1.18 }}
            minZoom={0.15}
            maxZoom={1.7}
            nodesConnectable={false}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls position="top-right" showInteractive={false} />
            <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => String(node.data.color ?? "#64748b")} />
          </ReactFlow>
        </div>

        <aside className="rightStack">
          <EntityGraphDetailPanel
            selection={selection}
            onClose={() => setSelectedId(null)}
            onOpenArtifact={(artifactId) => focus(artifactId)}
          />
          <NodeGraphAgentPanel
            graph={renderGraph}
            selectedNodeId={selected}
            onRunAgent={runShowcaseNodeAgent}
          />
        </aside>
      </section>
    </main>
  );
}

function summarizeShowcaseAgentResult(toolName: string, result: unknown): string {
  const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
  if (toolName === "nodegraph_open_questions") {
    const questions = Array.isArray(data.questions) ? data.questions.length : 0;
    return `NodeAgent found ${questions} review item${questions === 1 ? "" : "s"} in the graph. Use the listed node ids and refs to decide what evidence still needs to be attached.`;
  }
  if (toolName === "nodegraph_evidence_summary") {
    const backed = Array.isArray(data.sourceBackedNodes) ? data.sourceBackedNodes.length : 0;
    const review = Array.isArray(data.needsReviewNodes) ? data.needsReviewNodes.length : 0;
    return `NodeAgent found ${backed} source-backed node${backed === 1 ? "" : "s"} and ${review} needs-review node${review === 1 ? "" : "s"} around the current focus.`;
  }
  if (toolName === "nodegraph_search") {
    const total = typeof data.totalMatches === "number" ? data.totalMatches : 0;
    return `NodeAgent searched the graph and found ${total} matching node${total === 1 ? "" : "s"}, including people, agent trace context, and connected evidence.`;
  }
  const selected = data.selected && typeof data.selected === "object" ? data.selected as { label?: string } : undefined;
  return `NodeAgent selected ${selected?.label ?? "the graph focus"} and expanded its semantic neighborhood using NodeGraph tools.`;
}
