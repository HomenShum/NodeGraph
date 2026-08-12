import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
// The specific module, not the barrel: dist/index.js re-exports React detail
// panels that import lucide-react, which a graph-only consumer neither has
// nor wants (the audit's finding #6 — a curated index is the real fix).
import { buildSemanticGraph } from "../../dist/semanticGraph.js";
import { GraphSession } from "../../render/dist/index.js";
import { NodeGraph } from "../../render/dist/react.js";

// 1. The MODEL layer builds a semantic graph from a small research room:
//    one sheet of company research where an agent filled several cells and
//    attached sources — the fixture grammar the model's own tests use.
const human = { kind: "user", id: "u-maya", name: "Maya" };
const agent = { kind: "agent", id: "room-nodeagent", name: "Room NodeAgent", scope: "public" };
const columns = [
  { id: "company", label: "Company", order: 0 },
  { id: "owner", label: "Owner", order: 1 },
  { id: "funding", label: "Funding", order: 2 },
  { id: "risk", label: "Risk", order: 3 },
];
const cell = (id, value, updatedBy = human) => ({ id, value, updatedBy, version: 1, updatedAt: 1 });
const companies = [
  ["CardioNova", "Maya", "$14M Series A", "Needs HIPAA evidence"],
  ["HelixWorks", "Ravi", "$8M seed", "Pending SOC2"],
  ["Praxa Bio", "Maya", "$22M Series B", "Trial data unverified"],
  ["OncoLume", "Jin", "$5M seed", "Vendor lock-in"],
  ["StratosRx", "Ravi", "$41M Series C", "Regulatory review open"],
  ["VectorMed", "Jin", "$3M angel", "No revenue evidence"],
];
const elements = {};
const order = [];
companies.forEach(([company, owner, funding, risk], i) => {
  const r = `r${i + 1}`;
  order.push(`${r}__company`, `${r}__owner`, `${r}__funding`, `${r}__risk`);
  elements[`${r}__company`] = cell(`${r}__company`, company);
  elements[`${r}__owner`] = cell(`${r}__owner`, owner);
  elements[`${r}__funding`] = cell(`${r}__funding`, {
    value: funding,
    status: "complete",
    evidence: [{ id: `ev-${r}`, kind: "source", label: `${company} funding source`, url: `https://source.example/${company.toLowerCase().replace(/\s+/g, "-")}` }],
  }, agent);
  elements[`${r}__risk`] = cell(`${r}__risk`, { value: risk, status: "needs_review" }, agent);
});
const sheet = {
  id: "company-research", roomId: "compose-demo", kind: "sheet",
  title: "Company research", version: 2, createdBy: human, updatedAt: 2,
  order, elements, meta: { dataframe: { columns, rowCount: companies.length } },
};
const traces = companies.slice(0, 3).map(([company], i) => ({
  id: `trace-${i}`, roomId: "compose-demo", ts: 4 + i, actor: agent, type: "agent_status",
  summary: `Room NodeAgent researched ${company} evidence`,
  refs: { artifactId: "company-research", elementId: `r${i + 1}__funding` },
}));
const proposal = {
  id: "proposal-hipaa", roomId: "compose-demo", artifactId: "company-research",
  op: { opId: "op-hipaa", artifactId: "company-research", elementId: "r1__risk", kind: "set", value: "HIPAA source attached", baseVersion: 1 },
  author: agent, status: "pending", createdAt: 8,
};
const model = buildSemanticGraph({
  roomId: "compose-demo",
  artifacts: [sheet],
  members: [
    { id: "u-maya", name: "Maya", role: "analyst" },
    { id: "u-ravi", name: "Ravi", role: "research" },
  ],
  traces,
  proposals: [proposal],
});

// 2. The bridge — the honest ~15 lines. Model node ids pass straight
//    through; kinds become the renderer's categorical hue channel. The
//    model's `weight` is a derived relevance score, NOT a measured count,
//    so no entity claims a count and no relationship claims the evidence
//    width channel. Its refs carry a sourceUrl but no release, so nothing
//    can claim an assertion badge either. Everything renders as traversal —
//    the trust grammar refusing to over-promise is the point of the demo.
const session = new GraphSession({ maxNodes: 400, maxEdges: 900, maxSeen: 2000 });
session.ingest(
  {
    entities: model.nodes.map((n) => ({ id: n.id, type: n.kind, label: n.label })),
    relationships: model.edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: "traversal",
    })),
  },
  { eventId: "compose:company-research" },
);

// 3. The VIEW layer draws it.
function App() {
  const snap = useSyncExternalStore(
    (l) => session.subscribe(l),
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );
  const stats = document.querySelector("#stats");
  if (stats) {
    stats.textContent =
      `model: ${model.stats.nodes} nodes, ${model.stats.edges} edges, ` +
      `${model.stats.backedFacts} backed facts · rendered: ${snap.nodes.length} entities, ` +
      `${snap.edges.length} relationships (all traversal — no count was measured, ` +
      `no release-stamped receipt exists)`;
  }
  return React.createElement(NodeGraph, {
    nodes: snap.nodes,
    edges: snap.edges,
    height: 620,
    dark: true,
  });
}

createRoot(document.querySelector("#root")).render(React.createElement(App));
