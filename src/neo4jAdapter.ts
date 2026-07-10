import type { SemanticGraphEdge, SemanticGraphNode, SemanticGraphViewModel } from "./semanticGraphTypes";

export interface Neo4jQueryBatch {
  purpose: "nodes" | "relationships";
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

export function neo4jUpsertPlanJson(plan: Neo4jUpsertPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}
