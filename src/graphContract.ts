import type {
  SemanticGraphCluster,
  SemanticGraphEdge,
  SemanticGraphPosition,
  SemanticGraphViewModel,
} from "./semanticGraphTypes";

export const NODEGRAPH_DOCUMENT_SCHEMA = "nodegraph.document" as const;
export const NODEGRAPH_DOCUMENT_VERSION = 1 as const;

export type NodeGraphProvenance = {
  source: "noderoom" | "nodegraph_showcase" | "streamlit" | "neo4j" | "import" | "custom";
  sourceId?: string;
  revision?: string;
  actorId?: string;
  generatedAt: number;
};

export type NodeGraphLayoutState = {
  positions: Record<string, SemanticGraphPosition>;
  pinnedNodeIds: string[];
};

export type NodeGraphDocument = {
  schema: typeof NODEGRAPH_DOCUMENT_SCHEMA;
  version: typeof NODEGRAPH_DOCUMENT_VERSION;
  graphId: string;
  revision: string;
  generatedAt: number;
  provenance: NodeGraphProvenance;
  graph: SemanticGraphViewModel;
  layout?: NodeGraphLayoutState;
};

export type NodeGraphDelta = {
  fromRevision?: string;
  toRevision: string;
  upsertNodes: SemanticGraphViewModel["nodes"];
  removeNodeIds: string[];
  upsertEdges: SemanticGraphEdge[];
  removeEdgeIds: string[];
  upsertClusters: SemanticGraphCluster[];
  removeClusterIds: string[];
  stats: SemanticGraphViewModel["stats"];
  generatedFrom: SemanticGraphViewModel["generatedFrom"];
};

type ExportNodeGraphOptions = {
  graphId: string;
  provenance: Omit<NodeGraphProvenance, "generatedAt"> & { generatedAt?: number };
  layout?: NodeGraphLayoutState;
  generatedAt?: number;
  revision?: string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableValue(item)]));
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function canonicalGraph(graph: SemanticGraphViewModel): SemanticGraphViewModel {
  const refs = <T extends { refs: unknown[] }>(item: T): T => ({
    ...item,
    refs: [...item.refs].sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
  });
  return {
    nodes: [...graph.nodes].map((node) => refs({ ...node, clusterIds: [...node.clusterIds].sort() })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...graph.edges].map((edge) => refs({ ...edge })).sort((a, b) => a.id.localeCompare(b.id)),
    clusters: [...graph.clusters].map((cluster) => ({
      ...cluster,
      nodeIds: [...cluster.nodeIds].sort(),
      edgeIds: [...cluster.edgeIds].sort(),
    })).sort((a, b) => a.id.localeCompare(b.id)),
    stats: { ...graph.stats },
    generatedFrom: { ...graph.generatedFrom },
  };
}

function canonicalLayout(layout: NodeGraphLayoutState | undefined, nodeIds: Set<string>): NodeGraphLayoutState | undefined {
  if (!layout) return undefined;
  const positions = Object.fromEntries(Object.entries(layout.positions)
    .filter(([nodeId, position]) => nodeIds.has(nodeId) && Number.isFinite(position.x) && Number.isFinite(position.y))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, position]) => [nodeId, { x: position.x, y: position.y }]));
  const pinnedNodeIds = [...new Set(layout.pinnedNodeIds)].filter((nodeId) => nodeIds.has(nodeId) && positions[nodeId]).sort();
  return { positions, pinnedNodeIds };
}

export function semanticGraphFingerprint(graph: SemanticGraphViewModel): string {
  const input = stableJson(canonicalGraph(graph));
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193);
  return `ng1_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function exportNodeGraphDocument(graph: SemanticGraphViewModel, options: ExportNodeGraphOptions): NodeGraphDocument {
  if (!options.graphId.trim()) throw new Error("graphId is required");
  const generatedAt = options.generatedAt ?? options.provenance.generatedAt ?? Date.now();
  const normalizedGraph = canonicalGraph(graph);
  const nodeIds = new Set(normalizedGraph.nodes.map((node) => node.id));
  return {
    schema: NODEGRAPH_DOCUMENT_SCHEMA,
    version: NODEGRAPH_DOCUMENT_VERSION,
    graphId: options.graphId,
    revision: options.revision ?? semanticGraphFingerprint(normalizedGraph),
    generatedAt,
    provenance: { ...options.provenance, generatedAt },
    graph: normalizedGraph,
    layout: canonicalLayout(options.layout, nodeIds),
  };
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
}

export function parseNodeGraphDocument(input: string | unknown): NodeGraphDocument {
  const parsed = typeof input === "string" ? JSON.parse(input) as unknown : input;
  assertRecord(parsed, "invalid_nodegraph_document");
  if (parsed.schema !== NODEGRAPH_DOCUMENT_SCHEMA || parsed.version !== NODEGRAPH_DOCUMENT_VERSION || typeof parsed.graphId !== "string" || !parsed.graphId.trim()) {
    throw new Error("unsupported_nodegraph_document");
  }
  assertRecord(parsed.graph, "invalid_nodegraph_graph");
  if (!Array.isArray(parsed.graph.nodes) || !Array.isArray(parsed.graph.edges) || !Array.isArray(parsed.graph.clusters)) throw new Error("invalid_nodegraph_graph");
  const graph = parsed.graph as unknown as SemanticGraphViewModel;
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== "string" || !node.id || nodeIds.has(node.id)) throw new Error("invalid_nodegraph_node");
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge || typeof edge.id !== "string" || !edge.id || edgeIds.has(edge.id) || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error("invalid_nodegraph_edge");
    edgeIds.add(edge.id);
  }
  const provenance = parsed.provenance;
  assertRecord(provenance, "invalid_nodegraph_provenance");
  if (typeof provenance.source !== "string" || typeof provenance.generatedAt !== "number") throw new Error("invalid_nodegraph_provenance");
  const document = exportNodeGraphDocument(graph, {
    graphId: parsed.graphId,
    revision: typeof parsed.revision === "string" && parsed.revision ? parsed.revision : undefined,
    generatedAt: typeof parsed.generatedAt === "number" ? parsed.generatedAt : provenance.generatedAt,
    provenance: provenance as NodeGraphProvenance,
    layout: parsed.layout as NodeGraphLayoutState | undefined,
  });
  if (document.revision !== semanticGraphFingerprint(document.graph)) throw new Error("nodegraph_revision_mismatch");
  return document;
}

export function nodeGraphDocumentJson(document: NodeGraphDocument): string {
  return `${JSON.stringify(parseNodeGraphDocument(document), null, 2)}\n`;
}

function changed<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const before = new Map(previous.map((item) => [item.id, stableJson(item)]));
  return next.filter((item) => before.get(item.id) !== stableJson(item));
}

function removed<T extends { id: string }>(previous: T[], next: T[]): string[] {
  const keep = new Set(next.map((item) => item.id));
  return previous.map((item) => item.id).filter((id) => !keep.has(id)).sort();
}

export function diffNodeGraphDocuments(previous: NodeGraphDocument | undefined, next: NodeGraphDocument): NodeGraphDelta {
  const before = previous?.graph ?? { nodes: [], edges: [], clusters: [] };
  return {
    fromRevision: previous?.revision,
    toRevision: next.revision,
    upsertNodes: changed(before.nodes, next.graph.nodes),
    removeNodeIds: removed(before.nodes, next.graph.nodes),
    upsertEdges: changed(before.edges, next.graph.edges),
    removeEdgeIds: removed(before.edges, next.graph.edges),
    upsertClusters: changed(before.clusters, next.graph.clusters),
    removeClusterIds: removed(before.clusters, next.graph.clusters),
    stats: { ...next.graph.stats },
    generatedFrom: { ...next.graph.generatedFrom },
  };
}
