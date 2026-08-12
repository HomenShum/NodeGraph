import test from "node:test";
import assert from "node:assert/strict";

import {
  GraphSession,
  buildGraph,
  edgeKey,
  patchGraph,
} from "../dist/index.js";

const receipt = {
  source: "Reactome",
  release: "v97",
  subjectId: "R-HSA-6802912",
  objectId: "R-HSA-6802957",
  url: "https://reactome.org/content/detail/R-HSA-6802912",
};

test("happy path: an analyst can distinguish unknown, measured zero, evidence, and a receipted assertion", () => {
  const session = new GraphSession();
  session.observe(
    [{ kind: "condition", label: "not measured" }],
    undefined,
    { eventId: "unknown" },
  );
  session.observe(
    [{ kind: "condition", label: "measured empty" }],
    0,
    { eventId: "zero" },
  );
  session.observe(
    [
      { kind: "condition", label: "melanoma" },
      { kind: "intervention", label: "placebo" },
    ],
    0,
    { eventId: "zero-conjunction" },
  );
  session.assertEdge(
    { kind: "reaction", label: "BRAF mutants bind MAPKs" },
    { kind: "pathway", label: "Oncogenic MAPK signaling" },
    receipt,
    { eventId: "reactome-assertion" },
  );

  const snapshot = session.getSnapshot();
  const unknown = snapshot.nodes.find((node) => node.label === "not measured");
  const zero = snapshot.nodes.find((node) => node.label === "measured empty");
  assert.equal(Object.hasOwn(unknown, "count"), false);
  assert.equal(zero.count, 0);
  assert.equal(
    snapshot.edges.find((edge) => edge.type === "evidence")?.weight,
    0,
  );
  assert.deepEqual(
    snapshot.edges.find((edge) => edge.type === "assertion")?.receipt,
    receipt,
  );

  const graph = buildGraph(snapshot.nodes, snapshot.edges);
  assert.equal(graph.getNodeAttribute(unknown.id, "countState"), "unknown");
  assert.equal(graph.getNodeAttribute(zero.id, "countState"), "measured");
  assert.equal(graph.getNodeAttribute(zero.id, "count"), 0);
});

test("adversarial path: unknown edge types and incomplete assertion receipts fail before mutation", () => {
  const nodes = [
    { id: "a", label: "A", type: "condition" },
    { id: "b", label: "B", type: "intervention" },
  ];
  const graph = buildGraph(nodes, []);

  assert.throws(
    () =>
      patchGraph(graph, nodes, [
        { source: "a", target: "b", weight: 7, type: "prediction" },
      ]),
    /Unknown edge type/,
  );
  assert.equal(graph.size, 0, "a rejected patch must not paint a partial edge");
  assert.throws(() => edgeKey("a", "b", undefined), /Unknown edge type/);
  assert.notEqual(
    edgeKey("a|b", "c", "evidence"),
    edgeKey("a", "b|c", "evidence"),
    "delimiter-bearing ids cannot collapse two relationships into one key",
  );

  const session = new GraphSession();
  assert.throws(
    () =>
      session.ingest({
        entities: nodes,
        relationships: [
          { source: "a", target: "b", weight: 1, type: "assertion" },
        ],
      }),
    /assertion receipt is required/,
  );
  assert.deepEqual(session.getSnapshot(), { nodes: [], edges: [], turns: 0 });

  session.observe(
    [
      { kind: "a::b", label: "c" },
      { kind: "a", label: "b::c" },
    ],
    1,
  );
  assert.equal(session.getSnapshot().nodes.length, 2);
  assert.equal(session.getSnapshot().edges.length, 1);
});

test("recovery path: exact retries are idempotent and an event id cannot hide changed content", () => {
  const session = new GraphSession();
  const pair = [
    { kind: "condition", label: "melanoma" },
    { kind: "intervention", label: "placebo" },
  ];
  session.observe(pair, 120, { eventId: "tool-call-17" });
  session.observe([...pair].reverse(), 120, { eventId: "tool-call-17" });
  assert.equal(session.getSnapshot().turns, 1);
  assert.equal(session.getSnapshot().edges[0].weight, 120);

  assert.throws(
    () => session.observe(pair, 3_743, { eventId: "tool-call-17" }),
    /reused with different content/,
  );
  assert.equal(session.getSnapshot().edges[0].weight, 120);

  const first = {
    entities: [
      { id: "c", type: "condition", label: "lung cancer" },
      { id: "i", type: "intervention", label: "placebo" },
    ],
    relationships: [{ source: "c", target: "i", weight: 10, type: "evidence" }],
  };
  session.ingest(first);
  session.ingest({
    ...first,
    relationships: [{ source: "c", target: "i", weight: 11, type: "evidence" }],
  });
  assert.equal(
    session.getSnapshot().edges.find((edge) => edge.source.includes("lung cancer"))?.weight,
    11,
    "same ids and relationship count with changed evidence is not a false duplicate",
  );
});
