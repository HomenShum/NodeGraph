import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeChange, type NodeProps } from "@xyflow/react";
import { Download, Pin, PinOff, RotateCcw, Search, Sparkles, Upload } from "lucide-react";
import {
  EntityGraphDetailPanel,
  NodeGraphAgentPanel,
  applySemanticGraphFilters,
  buildNeo4jSyncPlan,
  buildSemanticGraph,
  createNodeGraphAgentTools,
  exportNodeGraphDocument,
  layoutSemanticGraph,
  neo4jSyncPlanJson,
  nodeGraphDocumentJson,
  parseNodeGraphDocument,
  selectSemanticNeighborhood,
  type NodeGraphAgentPanelRequest,
  type NodeGraphDocument,
  type SemanticGraphPosition,
  type SemanticGraphNodeKind,
} from "../../../src";
import { agent, companyResearch, members, notebook, proposals, storyboard, traceEvents } from "./demoData";

const COLORS: Record<string, string> = {
  company: "#5fd0a0",
  person: "#ff9e6a",
  agent_job: "#ff9e6a",
  funding: "#e07060",
  source: "#ffd16a",
  evidence_fact: "#ffd16a",
  artifact: "#6aa9ff",
  deck: "#f38b6d",
  deck_slide: "#f2b36f",
  deck_claim: "#e8d36f",
  spreadsheet_row: "#6aa9ff",
  notebook_block: "#b794f4",
  trace_step: "#60d0e0",
  proposal: "#c060d0",
  open_question: "#f0a040",
  project: "#60d0e0",
  achievement: "#f6d365",
  event: "#f0a040",
};

const FILTER_KINDS: SemanticGraphNodeKind[] = ["company", "person", "deck", "deck_claim", "source", "evidence_fact", "trace_step", "open_question", "agent_job"];
const LAYOUT_STORAGE_KEY = "nodegraph:showcase:layout:v1";

type SavedLayout = { positions: Record<string, SemanticGraphPosition>; pinnedNodeIds: string[] };

function loadSavedLayout(): SavedLayout {
  if (typeof window === "undefined") return { positions: {}, pinnedNodeIds: [] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "null") as Partial<SavedLayout> | null;
    return {
      positions: parsed?.positions && typeof parsed.positions === "object" ? parsed.positions : {},
      pinnedNodeIds: Array.isArray(parsed?.pinnedNodeIds) ? parsed.pinnedNodeIds.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return { positions: {}, pinnedNodeIds: [] };
  }
}

function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function GraphNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; kind: string; color: string; dimmed: boolean; selected: boolean; pinned: boolean };
  return (
    <div className={`ng-node ${d.selected ? "selected" : ""}${d.pinned ? " pinned" : ""}`} style={{ "--ng-color": d.color, opacity: d.dimmed ? 0.18 : 1 } as CSSProperties}>
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
  const [importedDocument, setImportedDocument] = useState<NodeGraphDocument | null>(null);
  const initialLayout = useMemo(loadSavedLayout, []);
  const [manualPositions, setManualPositions] = useState<Record<string, SemanticGraphPosition>>(initialLayout.positions);
  const [pinnedNodeIds, setPinnedNodeIds] = useState<Set<string>>(() => new Set(initialLayout.pinnedNodeIds));
  const importInputRef = useRef<HTMLInputElement>(null);
  const baseGraph = useMemo(() => buildSemanticGraph({
    roomId: "showcase-room",
    artifacts: [companyResearch, notebook],
    members,
    traces: traceEvents,
    proposals,
    decks: [storyboard],
    sessions: [{ id: "session-1", roomId: "showcase-room", agentId: agent.id, agentName: agent.name, scope: "public", status: "working", lastAction: "verifying CardioNova evidence", updatedAt: 12 }],
    maxRowsPerSheet: 24,
  }), []);
  const graph = importedDocument?.graph ?? baseGraph;
  useEffect(() => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ positions: manualPositions, pinnedNodeIds: [...pinnedNodeIds].sort() }));
  }, [manualPositions, pinnedNodeIds]);
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
      position: manualPositions[node.id] ?? positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        label,
        kind: node.kind,
        color: COLORS[node.kind] ?? "#94a3b8",
        dimmed: selection.nodeIds.size > 0 && !selection.nodeIds.has(node.id),
        selected: selected === node.id,
        pinned: pinnedNodeIds.has(node.id),
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
  const exportDocument = () => exportNodeGraphDocument(graph, {
    graphId: importedDocument?.graphId ?? "showcase-room",
    generatedAt: Date.now(),
    provenance: { source: "nodegraph_showcase", sourceId: "react-showcase" },
    layout: { positions: manualPositions, pinnedNodeIds: [...pinnedNodeIds] },
  });
  const onNodesChange = (changes: NodeChange[]) => {
    const positionChanges = changes.filter((change): change is Extract<NodeChange, { type: "position" }> => change.type === "position" && Boolean(change.position));
    if (!positionChanges.length) return;
    setManualPositions((previous) => ({
      ...previous,
      ...Object.fromEntries(positionChanges.map((change) => [change.id, { x: change.position!.x, y: change.position!.y }])),
    }));
    setPinnedNodeIds((previous) => new Set([...previous, ...positionChanges.map((change) => change.id)]));
  };
  const toggleSelectedPin = () => {
    if (!selected) return;
    setPinnedNodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(selected)) {
        next.delete(selected);
        setManualPositions((positionsValue) => Object.fromEntries(Object.entries(positionsValue).filter(([nodeId]) => nodeId !== selected)));
      } else {
        next.add(selected);
        const selectedPosition = positions.get(selected);
        if (selectedPosition) setManualPositions((positionsValue) => ({ ...positionsValue, [selected]: selectedPosition }));
      }
      return next;
    });
  };
  const importGraph = async (file: File | undefined) => {
    if (!file) return;
    const document = parseNodeGraphDocument(await file.text());
    setImportedDocument(document);
    setManualPositions(document.layout?.positions ?? {});
    setPinnedNodeIds(new Set(document.layout?.pinnedNodeIds ?? []));
    setSelectedId(null);
    setQuery("");
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
          <p>Derive people, companies, deck claims, spreadsheet rows, notebook blocks, traces, proposals, and sources from working product data.</p>
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
            <button type="button" onClick={() => focus("CardioNova funding evidence")}>Trace the deck claim</button>
          </div>
        </aside>

        <div className="graphPane">
          <div className="graphToolbar" role="toolbar" aria-label="NodeGraph data and layout controls">
            <button type="button" onClick={() => downloadText("nodegraph-showcase.json", nodeGraphDocumentJson(exportDocument()))} title="Export NodeGraph JSON"><Download size={14} /> JSON</button>
            <button type="button" onClick={() => downloadText("nodegraph-neo4j-sync.json", neo4jSyncPlanJson(buildNeo4jSyncPlan(exportDocument())))} title="Export Neo4j sync plan"><Download size={14} /> Neo4j</button>
            <button type="button" onClick={() => importInputRef.current?.click()} title="Import NodeGraph JSON"><Upload size={14} /> Import</button>
            <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void importGraph(event.target.files?.[0]); event.target.value = ""; }} />
            <button type="button" onClick={toggleSelectedPin} disabled={!selected} title={selected && pinnedNodeIds.has(selected) ? "Unpin selected node" : "Pin selected node"} aria-label={selected && pinnedNodeIds.has(selected) ? "Unpin selected node" : "Pin selected node"}>
              {selected && pinnedNodeIds.has(selected) ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            <span>{pinnedNodeIds.size} pinned</span>
            <button type="button" onClick={() => { setManualPositions({}); setPinnedNodeIds(new Set()); }} title="Reset saved layout" aria-label="Reset saved graph layout"><RotateCcw size={14} /></button>
          </div>
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
            onNodesChange={onNodesChange}
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
