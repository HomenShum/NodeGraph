import test from "node:test";
import assert from "node:assert/strict";

import { GraphSession, buildGraph, patchGraph } from "../dist/index.js";

const runShift = () => {
  const session = new GraphSession({ maxNodes: 6, maxEdges: 4, maxSeen: 5 });
  for (let turn = 0; turn < 100; turn += 1) {
    session.observe(
      [
        { kind: "condition", label: `condition-${turn}` },
        { kind: "intervention", label: `drug-${turn}` },
      ],
      turn,
      { eventId: `turn:${turn}` },
    );
  }
  return session;
};

test("sustained path: a day-long stream stays bounded and evicts deterministically", () => {
  const first = runShift();
  const second = runShift();
  assert.deepEqual(first.stats(), {
    maxNodes: 6,
    maxEdges: 4,
    maxSeen: 5,
    nodes: 6,
    edges: 3,
    seen: 5,
  });
  assert.deepEqual(first.getSnapshot(), second.getSnapshot());
  assert.deepEqual(
    first.getSnapshot().nodes.map((node) => node.label),
    [
      "condition-97",
      "drug-97",
      "condition-98",
      "drug-98",
      "condition-99",
      "drug-99",
    ],
  );

  const before = first.getSnapshot();
  first.observe(
    [
      { kind: "condition", label: "condition-99" },
      { kind: "intervention", label: "drug-99" },
    ],
    99,
    { eventId: "turn:99" },
  );
  assert.strictEqual(first.getSnapshot(), before, "a recent retry does not emit or mutate");

  first.observe(
    [
      { kind: "condition", label: "condition-0" },
      { kind: "intervention", label: "drug-0" },
    ],
    0,
    { eventId: "turn:0" },
  );
  assert.equal(first.getSnapshot().turns, 101, "deduplication is an explicit bounded window");
  assert.ok(first.stats().nodes <= first.stats().maxNodes);
  assert.ok(first.stats().edges <= first.stats().maxEdges);
  assert.ok(first.stats().seen <= first.stats().maxSeen);
});

test("sustained render path: deterministic session eviction also removes stale live-graph state", () => {
  const session = new GraphSession({ maxNodes: 6, maxEdges: 4, maxSeen: 8 });
  const graph = buildGraph([], []);
  for (let turn = 0; turn < 100; turn += 1) {
    session.observe(
      [
        { kind: "condition", label: `condition-${turn}` },
        { kind: "intervention", label: `drug-${turn}` },
      ],
      turn,
      { eventId: `render:${turn}` },
    );
    const snapshot = session.getSnapshot();
    patchGraph(graph, snapshot.nodes, snapshot.edges);
    assert.ok(graph.order <= 6);
    assert.ok(graph.size <= 4);
  }
  assert.equal(graph.order, session.stats().nodes);
  assert.equal(graph.size, session.stats().edges);
  assert.deepEqual(
    graph.nodes().sort(),
    session.getSnapshot().nodes.map((node) => node.id).sort(),
  );
});

test("degraded path: invalid capacity fails at construction instead of becoming an unbounded fallback", () => {
  assert.throws(() => new GraphSession({ maxNodes: 0 }), /maxNodes/);
  assert.throws(() => new GraphSession({ maxEdges: -1 }), /maxEdges/);
  assert.throws(() => new GraphSession({ maxSeen: Number.POSITIVE_INFINITY }), /maxSeen/);
});
