import { describe, expect, it } from "vitest";
import type { Actor, Artifact, DataframeColumn, Element, Proposal, TraceEvent } from "../src/types";
import { buildSemanticGraph } from "../src/semanticGraph";
import { applySemanticGraphFilters } from "../src/semanticGraphFilters";
import { selectSemanticGraphCluster, summarizeSemanticGraphClusters } from "../src/semanticGraphClusters";
import { layoutSemanticGraph } from "../src/semanticGraphLayout";
import { selectSemanticNeighborhood } from "../src/semanticGraphSelectors";
import { buildGraphRelationshipReviewPlan, graphRelationshipReviewFileName, graphRelationshipReviewJson } from "../src/relationshipReview";
import { buildNeo4jSyncPlan, buildNeo4jUpsertPlan, executeNeo4jSyncPlan, executeNeo4jUpsertPlan } from "../src/neo4jAdapter";
import { exportNodeGraphDocument, nodeGraphDocumentJson, parseNodeGraphDocument, semanticGraphFingerprint } from "../src/graphContract";
import { InMemoryNodeGraphAdapter } from "../src/inMemoryAdapter";
import type { DeckStoryboard } from "../src/semanticGraphTypes";

const human: Actor = { kind: "user", id: "u-priya", name: "Priya" };
const agent: Actor = { kind: "agent", id: "room-agent", name: "Room NodeAgent", scope: "public" };

const columns: DataframeColumn[] = [
  { id: "company", label: "Company", order: 0 },
  { id: "owner", label: "Owner", order: 1 },
  { id: "website", label: "Website", order: 2 },
  { id: "funding", label: "Funding", order: 3 },
  { id: "risk", label: "Review risk", order: 4 },
];

const cell = (id: string, value: unknown, updatedBy: Actor = human): Element => ({
  id,
  value,
  updatedBy,
  version: 1,
  updatedAt: 1,
});

const researchSheet: Artifact = {
  id: "art-research",
  roomId: "room-1",
  kind: "sheet",
  title: "Company research",
  version: 2,
  createdBy: human,
  updatedAt: 2,
  order: [
    "r1__company",
    "r1__owner",
    "r1__website",
    "r1__funding",
    "r1__risk",
  ],
  elements: {
    "r1__company": cell("r1__company", "CardioNova"),
    "r1__owner": cell("r1__owner", "Priya"),
    "r1__website": cell("r1__website", "https://cardionova.example/source"),
    "r1__funding": cell("r1__funding", {
      value: "$14M Series A",
      status: "complete",
      evidence: [{
        id: "ev-funding",
        kind: "source",
        label: "Series A source",
        url: "https://pitchbook.example/cardionova",
        snippet: "CardioNova raised a $14M Series A.",
      }],
    }, agent),
    "r1__risk": cell("r1__risk", { value: "Needs HIPAA evidence review", status: "needs_review" }, agent),
  },
  meta: { dataframe: { columns, rowCount: 1 } },
};

const notebook: Artifact = {
  id: "art-note",
  roomId: "room-1",
  kind: "note",
  title: "Capture Notebook",
  version: 1,
  createdBy: human,
  updatedAt: 3,
  order: ["b1"],
  elements: {
    b1: cell("b1", { text: "Priya researched CardioNova and found the PitchBook source." }),
  },
};

const trace: TraceEvent = {
  id: "trace-1",
  roomId: "room-1",
  ts: 4,
  actor: agent,
  type: "agent_status",
  summary: "Researched CardioNova funding and reconciled source evidence",
  refs: { artifactId: "art-research", elementId: "r1__funding" },
};

const proposal: Proposal = {
  id: "proposal-1",
  roomId: "room-1",
  artifactId: "art-research",
  op: { opId: "op-1", artifactId: "art-research", elementId: "r1__risk", kind: "set", value: "HIPAA source added", baseVersion: 1 },
  author: agent,
  status: "pending",
  createdAt: 5,
};

const storyboard: DeckStoryboard = {
  deckId: "deck-1",
  roomId: "room-1",
  title: "Diligence readout",
  audience: "investment committee",
  objective: "Review sourced company evidence",
  privacy: "room",
  storyboardStatus: "needs_review",
  slides: [{
    slideId: "slide-1",
    title: "CardioNova funding",
    purpose: "Explain the funding evidence",
    claims: [{
      claimId: "claim-1",
      text: "CardioNova raised a $14M Series A.",
      status: "verified",
      sourceArtifactId: "art-research",
      traceId: "trace-1",
      evidenceId: "ev-funding",
    }],
    sourceArtifactIds: ["art-research"],
    evidenceIds: ["ev-funding"],
    unresolvedGaps: ["Confirm current runway."],
    status: "needs_review",
  }],
  requiredEvidence: ["Confirm current runway."],
  unresolvedGaps: ["Confirm current runway."],
  sourceArtifactIds: ["art-research"],
  traceIds: ["trace-1"],
  proposalIds: [],
  planHash: "plan-1",
  version: 1,
};

function largeResearchSheet(rowCount: number): Artifact {
  const order: string[] = [];
  const elements: Record<string, Element> = {};
  for (let index = 1; index <= rowCount; index += 1) {
    const row = `r${index}`;
    for (const column of columns) order.push(`${row}__${column.id}`);
    elements[`${row}__company`] = cell(`${row}__company`, `Company ${index}`);
    elements[`${row}__owner`] = cell(`${row}__owner`, index % 2 === 0 ? "Priya" : "Homen");
    elements[`${row}__website`] = cell(`${row}__website`, `https://company-${index}.example/source`);
    elements[`${row}__funding`] = cell(`${row}__funding`, {
      value: `$${10 + index}M Series A`,
      status: "complete",
      evidence: [{
        id: `ev-${index}`,
        kind: "source",
        label: `Funding source ${index}`,
        url: `https://source-${index}.example/company`,
      }],
    }, agent);
    elements[`${row}__risk`] = cell(`${row}__risk`, index % 5 === 0 ? { value: "Needs review", status: "needs_review" } : "clear");
  }
  return {
    ...researchSheet,
    id: "art-large-research",
    title: "Large company research",
    order,
    elements,
    meta: { dataframe: { columns, rowCount } },
  };
}

describe("semantic entity graph", () => {
  it("derives companies, people, rows, evidence, sources, traces, proposals, and open questions from real room data", () => {
    const graph = buildSemanticGraph({
      roomId: "room-1",
      artifacts: [researchSheet, notebook],
      traces: [trace],
      proposals: [proposal],
      members: [{ id: "u-priya", roomId: "room-1", name: "Priya", role: "member", anon: false, color: "#4f7cff", lastSeenAt: 6 }],
    });

    expect(graph.generatedFrom.fallbackDemo).toBe(false);
    expect(graph.nodes.some((node) => node.kind === "company" && node.label === "CardioNova")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "person" && node.label === "Priya")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "spreadsheet_row" && node.subtitle === "CardioNova")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "evidence_fact" && node.label === "Series A source")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "source" && node.label === "pitchbook.example")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "trace_step" && node.label.includes("Researched CardioNova"))).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "proposal" && node.status === "needs_review")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "open_question" && node.status === "needs_review")).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "researched" && edge.label === "researched")).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "supported_by" && edge.label === "supported by source")).toBe(true);
  });

  it("selects a person neighborhood that includes researched companies and evidence context", () => {
    const graph = buildSemanticGraph({ roomId: "room-1", artifacts: [researchSheet, notebook], traces: [trace], proposals: [proposal] });
    const person = graph.nodes.find((node) => node.kind === "person" && node.label === "Priya");
    expect(person).toBeTruthy();

    const selection = selectSemanticNeighborhood(graph, person!.id, 2);
    const selectedLabels = [...selection.nodeIds].map((id) => graph.nodes.find((node) => node.id === id)?.label);
    expect(selectedLabels).toContain("CardioNova");
    expect(selection.sections.some((section) => section.id === "researched-companies")).toBe(true);
    expect(selection.sections.some((section) => section.id === "rows-blocks")).toBe(true);
  });

  it("builds a deterministic relationship review plan for public package consumers", () => {
    const graph = buildSemanticGraph({ roomId: "room-1", artifacts: [researchSheet, notebook], traces: [trace], proposals: [proposal] });
    const plan = buildGraphRelationshipReviewPlan(graph, "room-1:semantic-graph");
    const second = buildGraphRelationshipReviewPlan(graph, "room-1:semantic-graph");

    expect(plan.reviewVersion).toBe(1);
    expect(plan.integrityHash).toBe(second.integrityHash);
    expect(graphRelationshipReviewJson(plan)).toBe(graphRelationshipReviewJson(second));
    expect(plan.relationshipCount).toBe(graph.edges.length);
    expect(plan.confirmedCount + plan.needsConfirmationCount).toBe(plan.relationshipCount);
    expect(plan.confirmedCount).toBeGreaterThan(0);
    expect(plan.needsConfirmationCount).toBeGreaterThan(0);
    expect(plan.proposalIds).toContain("proposal-1");
    expect(plan.traceIds).toContain("trace-1");
    expect(plan.items.some((item) => item.edgeKind === "supported_by" && item.reviewStatus === "confirmed")).toBe(true);
    expect(plan.items.some((item) => item.edgeKind === "reviewed" && item.reviewStatus === "needs_confirmation")).toBe(true);
    expect(graphRelationshipReviewFileName("room-1:semantic-graph", plan.integrityHash)).toBe(`room-1-semantic-graph-relationship-review-${plan.integrityHash}.json`);
  });

  it("filters to source-backed evidence without static mock nodes", () => {
    const graph = buildSemanticGraph({ roomId: "room-1", artifacts: [researchSheet, notebook], fallbackDemo: true });
    const filtered = applySemanticGraphFilters(graph, { evidenceBackedOnly: true });

    expect(graph.generatedFrom.fallbackDemo).toBe(false);
    expect(filtered.nodes.length).toBeGreaterThan(0);
    expect(filtered.nodes.every((node) => node.status === "source_backed" || node.kind === "source" || node.kind === "evidence_fact")).toBe(true);
    expect(filtered.nodes.some((node) => node.label === "Room graph seed")).toBe(false);
  });

  it("uses fallback only for an empty room when explicitly requested", () => {
    const graph = buildSemanticGraph({ roomId: "room-empty", artifacts: [], fallbackDemo: true });
    expect(graph.generatedFrom.fallbackDemo).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "open_question")).toBe(true);
  });

  it("lays out selected semantic nodes deterministically", () => {
    const graph = buildSemanticGraph({ roomId: "room-1", artifacts: [researchSheet, notebook], traces: [trace], proposals: [proposal] });
    const company = graph.nodes.find((node) => node.kind === "company" && node.label === "CardioNova");
    expect(company).toBeTruthy();

    const first = layoutSemanticGraph(graph, { selectedId: company!.id });
    const second = layoutSemanticGraph(graph, { selectedId: company!.id });
    expect(first.get(company!.id)).toEqual({ x: 0, y: 0 });
    expect([...first.entries()]).toEqual([...second.entries()]);
  });

  it("ranks clusters and isolates a cluster with bounded neighbor expansion", () => {
    const graph = buildSemanticGraph({ roomId: "room-1", artifacts: [researchSheet, notebook], traces: [trace], proposals: [proposal] });
    const summary = summarizeSemanticGraphClusters(graph).find((cluster) => cluster.kind === "company" && cluster.label.includes("CardioNova"));
    expect(summary).toBeTruthy();

    const isolated = selectSemanticGraphCluster(graph, summary!.id, { neighborDepth: 0 });
    const expanded = selectSemanticGraphCluster(graph, summary!.id, { neighborDepth: 1, maxNodes: 40 });
    expect(isolated.nodes).toHaveLength(summary!.nodeCount);
    expect(expanded.nodes.length).toBeGreaterThanOrEqual(isolated.nodes.length);
    expect(expanded.nodes.length).toBeLessThanOrEqual(40);
    expect(expanded.edges.every((edge) => expanded.nodes.some((node) => node.id === edge.source) && expanded.nodes.some((node) => node.id === edge.target))).toBe(true);
  });

  it("keeps a 250-plus-node fixture derivable, filterable, and layoutable", () => {
    const graph = buildSemanticGraph({
      roomId: "room-scale",
      artifacts: [largeResearchSheet(90)],
      maxRowsPerSheet: 120,
      maxEvidenceFacts: 360,
    });
    expect(graph.nodes.length).toBeGreaterThanOrEqual(250);
    const layout = layoutSemanticGraph(graph);
    expect(layout.size).toBe(graph.nodes.length);
    const filtered = applySemanticGraphFilters(graph, { query: "Company 42" });
    expect(filtered.nodes.some((node) => node.label === "Company 42")).toBe(true);
  });

  it("derives deck slides, claims, evidence gaps, and ranked connection paths", () => {
    const graph = buildSemanticGraph({
      roomId: "room-1",
      artifacts: [researchSheet, notebook],
      traces: [trace],
      proposals: [proposal],
      decks: [storyboard],
    });
    const claim = graph.nodes.find((node) => node.kind === "deck_claim" && node.refs.some((ref) => ref.claimId === "claim-1"));
    expect(graph.nodes.some((node) => node.kind === "deck" && node.label === "Diligence readout")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "deck_slide" && node.label === "CardioNova funding")).toBe(true);
    expect(claim?.status).toBe("source_backed");
    expect(graph.edges.some((edge) => edge.kind === "supported_by" && edge.source === claim?.id)).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "open_question" && node.label === "Confirm current runway.")).toBe(true);

    const selection = selectSemanticNeighborhood(graph, claim?.id, 2);
    expect(selection.sections.some((section) => section.id === "deck-storyboard")).toBe(true);
    expect(selection.paths?.some((path) => path.label.includes("supported by evidence"))).toBe(true);
  });

  it("builds and executes a parameterized Neo4j upsert plan without APOC", async () => {
    const graph = buildSemanticGraph({ roomId: "room-1", artifacts: [researchSheet, notebook], traces: [trace], decks: [storyboard] });
    const plan = buildNeo4jUpsertPlan(graph, "room-1");
    expect(plan.nodeCount).toBe(graph.nodes.length);
    expect(plan.relationshipCount).toBe(graph.edges.length);
    expect(plan.batches.some((batch) => batch.purpose === "nodes" && batch.kind === "DECK_CLAIM")).toBe(true);
    expect(plan.batches.some((batch) => batch.purpose === "relationships" && batch.kind === "SUPPORTED_BY")).toBe(true);
    expect(plan.batches.every((batch) => batch.statement.includes("$rows") && !batch.statement.includes("apoc."))).toBe(true);
    const calls: Array<{ statement: string; parameters?: Record<string, unknown> }> = [];
    await executeNeo4jUpsertPlan({ run: async (statement, parameters) => { calls.push({ statement, parameters }); } }, plan);
    expect(calls).toHaveLength(plan.batches.length);
    const rowCount = plan.batches.reduce((sum, batch) => sum + batch.parameters.rows.length, 0);
    expect(rowCount).toBe(graph.nodes.length + graph.edges.length);
  });

  it("round-trips a versioned graph document with provenance and persistent pins", () => {
    const graph = buildSemanticGraph({ roomId: "room-1", artifacts: [researchSheet, notebook], traces: [trace], proposals: [proposal], decks: [storyboard] });
    const pinnedId = graph.nodes.find((node) => node.kind === "company")!.id;
    const document = exportNodeGraphDocument(graph, {
      graphId: "room-1",
      generatedAt: 1234,
      provenance: { source: "noderoom", sourceId: "room-1", revision: "room-v9" },
      layout: { positions: { [pinnedId]: { x: 120, y: -40 }, missing: { x: 1, y: 1 } }, pinnedNodeIds: [pinnedId, "missing"] },
    });
    const parsed = parseNodeGraphDocument(nodeGraphDocumentJson(document));
    expect(parsed.revision).toBe(semanticGraphFingerprint(graph));
    expect(parsed.provenance).toMatchObject({ source: "noderoom", sourceId: "room-1", revision: "room-v9", generatedAt: 1234 });
    expect(parsed.layout).toEqual({ positions: { [pinnedId]: { x: 120, y: -40 } }, pinnedNodeIds: [pinnedId] });
    expect(parsed.graph.nodes.map((node) => node.id)).toEqual([...parsed.graph.nodes.map((node) => node.id)].sort((left, right) => left.localeCompare(right)));
  });

  it("applies incremental in-memory and Neo4j synchronization with optional stale pruning", async () => {
    const graph = buildSemanticGraph({ roomId: "room-1", artifacts: [researchSheet, notebook], traces: [trace], proposals: [proposal], decks: [storyboard] });
    const initial = exportNodeGraphDocument(graph, { graphId: "room-1", generatedAt: 100, provenance: { source: "noderoom", sourceId: "room-1" } });
    const removedId = graph.nodes.find((node) => node.kind === "open_question")!.id;
    const retainedNodes = graph.nodes.filter((node) => node.id !== removedId).map((node, index) => index === 0 ? { ...node, label: `${node.label} updated` } : node);
    const retainedEdges = graph.edges.filter((edge) => edge.source !== removedId && edge.target !== removedId);
    const retainedEdgeIds = new Set(retainedEdges.map((edge) => edge.id));
    const retainedNodeIds = new Set(retainedNodes.map((node) => node.id));
    const nextGraph = {
      ...graph,
      nodes: retainedNodes,
      edges: retainedEdges,
      clusters: graph.clusters.map((cluster) => ({
        ...cluster,
        nodeIds: cluster.nodeIds.filter((id) => retainedNodeIds.has(id)),
        edgeIds: cluster.edgeIds.filter((id) => retainedEdgeIds.has(id)),
      })),
      stats: { ...graph.stats, nodes: retainedNodes.length, edges: retainedEdges.length, openQuestions: graph.stats.openQuestions - 1 },
    };
    const next = exportNodeGraphDocument(nextGraph, { graphId: "room-1", generatedAt: 200, provenance: { source: "noderoom", sourceId: "room-1" } });

    const memory = new InMemoryNodeGraphAdapter([initial]);
    const receipt = memory.importDocument(next);
    expect(receipt.previousRevision).toBe(initial.revision);
    expect(receipt.delta.removeNodeIds).toEqual([removedId]);
    expect(receipt.delta.upsertNodes).toHaveLength(1);
    expect(memory.read("room-1")?.revision).toBe(next.revision);

    const plan = buildNeo4jSyncPlan(next, initial, { pruneMissing: true });
    expect(plan.adapterVersion).toBe(2);
    expect(plan.batches.some((batch) => batch.purpose === "metadata")).toBe(true);
    expect(plan.batches.some((batch) => batch.purpose === "delete_nodes" && batch.parameters.rows.some((row) => row.id === removedId))).toBe(true);
    expect(plan.batches.filter((batch) => batch.purpose === "nodes").reduce((sum, batch) => sum + batch.parameters.rows.length, 0)).toBe(1);
    expect(plan.batches.every((batch) => !batch.statement.includes("apoc."))).toBe(true);
    const calls: Array<{ statement: string; parameters?: Record<string, unknown> }> = [];
    await executeNeo4jSyncPlan({ run: async (statement, parameters) => { calls.push({ statement, parameters }); } }, plan);
    expect(calls).toHaveLength(plan.batches.length);
  });
});
