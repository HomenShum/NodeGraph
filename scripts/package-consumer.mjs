// Runs from an isolated installation of the two tarballs. Every import here
// uses a public package export; no source or dist path from this repo is visible.
import assert from "node:assert/strict";
import { buildSemanticGraph, exportNodeGraphDocument, parseNodeGraphDocument, nodeGraphDocumentJson, InMemoryNodeGraphAdapter } from "@homenshum/nodegraph";
import { GraphSession, buildGraph, patchGraph } from "@homenshum/nodegraph-live";
import { GraphSession as CoreSession } from "@homenshum/nodegraph-live/core";

assert.equal(GraphSession, CoreSession);
const author = { kind: "user", id: "reviewer", name: "Reviewer" };
const graph = buildSemanticGraph({
  roomId: "handoff",
  artifacts: [{ id: "research-note", roomId: "handoff", kind: "note", title: "Research handoff", version: 1, createdBy: author, updatedAt: 1,
    order: ["finding"], elements: { finding: { id: "finding", value: { text: "Supplier evidence needs review." }, version: 1, updatedBy: author, updatedAt: 1 } } }],
});
assert.ok(graph.nodes.some((node) => node.kind === "artifact"));
assert.ok(graph.edges.length > 0);
const document = exportNodeGraphDocument(graph, { graphId: "handoff", provenance: { source: "custom", generatedAt: 1 }, generatedAt: 1 });
const memory = new InMemoryNodeGraphAdapter();
memory.importDocument(nodeGraphDocumentJson(document));
assert.deepEqual(memory.read("handoff"), parseNodeGraphDocument(nodeGraphDocumentJson(document)));
assert.throws(() => parseNodeGraphDocument('{"schema":"unsupported"}'), /unsupported_nodegraph_document/);

// A reviewer receives bursty, retrying tool results throughout a session.
// Replays do not inflate evidence; late invalid input cannot erase accepted data.
const session = new GraphSession({ maxNodes: 20, maxEdges: 30, maxSeen: 40 });
const rendered = buildGraph([], []);
for (let wave = 0; wave < 10; wave++) {
  for (let event = 0; event < 20; event++) {
    const n = wave * 20 + event;
    const entities = [{ kind: "supplier", label: `supplier-${n}` }, { kind: "source", label: `source-${n}` }];
    session.observe(entities, n, { eventId: `result-${n}` });
    const accepted = session.getSnapshot();
    session.observe(entities, n, { eventId: `result-${n}` });
    assert.equal(session.getSnapshot(), accepted);
    assert.throws(() => session.observe(entities, n + 1, { eventId: `result-${n}` }));
    assert.equal(session.getSnapshot(), accepted);
    patchGraph(rendered, accepted.nodes, accepted.edges);
    assert.ok(rendered.order <= 20 && rendered.size <= 30 && session.stats().seen <= 40);
  }
}
const accepted = session.getSnapshot();
assert.throws(() => session.assertEdge({ kind: "supplier", label: "unverified" }, { kind: "source", label: "missing" }, { source: "fixture", release: "" }));
assert.equal(session.getSnapshot(), accepted);
assert.equal(session.getSnapshot().turns, 200);
console.log(JSON.stringify({ publicExports: ["model", "renderer", "core"], modelNodes: graph.nodes.length, events: 200, retries: 200, rejectedChanges: 200, finalStats: session.stats(), status: "PASS" }));
