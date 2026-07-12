import type { SemanticGraphEdge, SemanticGraphNode, SemanticGraphViewModel } from "./semanticGraphTypes";
import { diffNodeGraphDocuments, parseNodeGraphDocument, type NodeGraphDelta, type NodeGraphDocument } from "./graphContract";

export interface Neo4jQueryBatch {
  purpose: "metadata" | "nodes" | "relationships" | "delete_relationships" | "delete_nodes";
  kind: string;
  statement: string;
  parameters: { rows: Array<Record<string, unknown>> };
}

export interface Neo4jUpsertPlan {
  adapterVersion: 1;
  graphId: string;
  nodeCount: number;
  relationshipCount: number;
  batches: Neo4jQueryBatch[];
}

export interface Neo4jSessionLike {
  run(statement: string, parameters?: Record<string, unknown>): Promise<unknown>;
}

export interface Neo4jSyncPlan {
  adapterVersion: 2;
  graphId: string;
  previousRevision?: string;
  revision: string;
  pruneMissing: boolean;
  nodeCount: number;
  relationshipCount: number;
  delta: NodeGraphDelta;
  batches: Neo4jQueryBatch[];
}

function cypherToken(value: string): string {
  const token = value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
  if (!token || !/^[A-Z_][A-Z0-9_]*$/.test(token)) throw new Error(`Unsafe Neo4j token: ${value}`);
  return token;
}

function nodeLabel(node: SemanticGraphNode): string {
  return cypherToken(node.kind);
}

function relationshipType(edge: SemanticGraphEdge): string {
  return cypherToken(edge.kind);
}

function compactRecord(value: Record<string, string | number | boolean | undefined> | undefined): string | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined);
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : undefined;
}

function nodeRow(graphId: string, node: SemanticGraphNode): Record<string, unknown> {
  return {
    graphId,
    id: node.id,
    properties: {
      label: node.label,
      subtitle: node.subtitle ?? null,
      kind: node.kind,
      status: node.status,
      weight: node.weight,
      clusterIds: node.clusterIds,
      refsJson: JSON.stringify(node.refs),
      metaJson: compactRecord(node.meta) ?? null,
      actorJson: node.actor ? JSON.stringify(node.actor) : null,
    },
  };
}

function relationshipRow(graphId: string, edge: SemanticGraphEdge): Record<string, unknown> {
  return {
    graphId,
    id: edge.id,
    sourceId: edge.source,
    targetId: edge.target,
    properties: {
      label: edge.label,
      kind: edge.kind,
      status: edge.status,
      weight: edge.weight,
      refsJson: JSON.stringify(edge.refs),
    },
  };
}

function syncProperties(document: NodeGraphDocument): Record<string, unknown> {
  return {
    revision: document.revision,
    syncedAt: document.generatedAt,
    provenanceJson: JSON.stringify(document.provenance),
  };
}

function syncNodeRow(document: NodeGraphDocument, node: SemanticGraphNode): Record<string, unknown> {
  const row = nodeRow(document.graphId, node);
  return { ...row, properties: { ...(row.properties as Record<string, unknown>), ...syncProperties(document) } };
}

function syncRelationshipRow(document: NodeGraphDocument, edge: SemanticGraphEdge): Record<string, unknown> {
  const row = relationshipRow(document.graphId, edge);
  return { ...row, properties: { ...(row.properties as Record<string, unknown>), ...syncProperties(document) } };
}

function grouped<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

export function buildNeo4jUpsertPlan(graph: SemanticGraphViewModel, graphId = "semantic-graph"): Neo4jUpsertPlan {
  if (!graphId.trim()) throw new Error("graphId is required");
  const batches: Neo4jQueryBatch[] = [];
  for (const [label, nodes] of grouped(graph.nodes, nodeLabel)) {
    batches.push({
      purpose: "nodes",
      kind: label,
      statement: `UNWIND $rows AS row\nMERGE (node:NodeGraphNode:${label} {graphId: row.graphId, id: row.id})\nSET node += row.properties`,
      parameters: { rows: nodes.map((node) => nodeRow(graphId, node)) },
    });
  }
  for (const [type, edges] of grouped(graph.edges, relationshipType)) {
    batches.push({
      purpose: "relationships",
      kind: type,
      statement: `UNWIND $rows AS row\nMATCH (source:NodeGraphNode {graphId: row.graphId, id: row.sourceId})\nMATCH (target:NodeGraphNode {graphId: row.graphId, id: row.targetId})\nMERGE (source)-[relationship:${type} {graphId: row.graphId, id: row.id}]->(target)\nSET relationship += row.properties`,
      parameters: { rows: edges.map((edge) => relationshipRow(graphId, edge)) },
    });
  }
  return {
    adapterVersion: 1,
    graphId,
    nodeCount: graph.nodes.length,
    relationshipCount: graph.edges.length,
    batches,
  };
}

export async function executeNeo4jUpsertPlan(session: Neo4jSessionLike, plan: Neo4jUpsertPlan): Promise<void> {
  for (const batch of plan.batches) await session.run(batch.statement, batch.parameters);
}

export function buildNeo4jSyncPlan(
  nextInput: NodeGraphDocument,
  previousInput?: NodeGraphDocument,
  options: { pruneMissing?: boolean } = {},
): Neo4jSyncPlan {
  const next = parseNodeGraphDocument(nextInput);
  const previous = previousInput ? parseNodeGraphDocument(previousInput) : undefined;
  if (previous && previous.graphId !== next.graphId) throw new Error("nodegraph_graph_id_mismatch");
  const pruneMissing = options.pruneMissing === true;
  const delta = diffNodeGraphDocuments(previous, next);
  const batches: Neo4jQueryBatch[] = [{
    purpose: "metadata",
    kind: "NODEGRAPH_GRAPH",
    statement: "UNWIND $rows AS row\nMERGE (graph:NodeGraphGraph {graphId: row.graphId})\nSET graph += row.properties",
    parameters: { rows: [{
      graphId: next.graphId,
      properties: {
        revision: next.revision,
        syncedAt: next.generatedAt,
        provenanceJson: JSON.stringify(next.provenance),
        statsJson: JSON.stringify(next.graph.stats),
        generatedFromJson: JSON.stringify(next.graph.generatedFrom),
      },
    }] },
  }];

  if (pruneMissing && delta.removeEdgeIds.length) {
    batches.push({
      purpose: "delete_relationships",
      kind: "STALE",
      statement: "UNWIND $rows AS row\nMATCH ()-[relationship {graphId: row.graphId, id: row.id}]->()\nDELETE relationship",
      parameters: { rows: delta.removeEdgeIds.map((id) => ({ graphId: next.graphId, id })) },
    });
  }
  if (pruneMissing && delta.removeNodeIds.length) {
    batches.push({
      purpose: "delete_nodes",
      kind: "STALE",
      statement: "UNWIND $rows AS row\nMATCH (node:NodeGraphNode {graphId: row.graphId, id: row.id})\nDETACH DELETE node",
      parameters: { rows: delta.removeNodeIds.map((id) => ({ graphId: next.graphId, id })) },
    });
  }
  for (const [label, nodes] of grouped(delta.upsertNodes, nodeLabel)) {
    batches.push({
      purpose: "nodes",
      kind: label,
      statement: `UNWIND $rows AS row\nMERGE (node:NodeGraphNode:${label} {graphId: row.graphId, id: row.id})\nSET node += row.properties`,
      parameters: { rows: nodes.map((node) => syncNodeRow(next, node)) },
    });
  }
  for (const [type, edges] of grouped(delta.upsertEdges, relationshipType)) {
    batches.push({
      purpose: "relationships",
      kind: type,
      statement: `UNWIND $rows AS row\nMATCH (source:NodeGraphNode {graphId: row.graphId, id: row.sourceId})\nMATCH (target:NodeGraphNode {graphId: row.graphId, id: row.targetId})\nMERGE (source)-[relationship:${type} {graphId: row.graphId, id: row.id}]->(target)\nSET relationship += row.properties`,
      parameters: { rows: edges.map((edge) => syncRelationshipRow(next, edge)) },
    });
  }
  return {
    adapterVersion: 2,
    graphId: next.graphId,
    previousRevision: previous?.revision,
    revision: next.revision,
    pruneMissing,
    nodeCount: next.graph.nodes.length,
    relationshipCount: next.graph.edges.length,
    delta,
    batches,
  };
}

export async function executeNeo4jSyncPlan(session: Neo4jSessionLike, plan: Neo4jSyncPlan): Promise<void> {
  for (const batch of plan.batches) await session.run(batch.statement, batch.parameters);
}

export function neo4jSyncPlanJson(plan: Neo4jSyncPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function neo4jUpsertPlanJson(plan: Neo4jUpsertPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
