import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, patchGraph } from "../dist/graph-model.js";

test("a streamed chain of births is never collinear (the line-constellation bug)", () => {
  // The human situation: 142 real entities rendered as a perfectly straight
  // diagonal because every seed stepped (d, d) from its parent — and a force
  // layout preserves any collinearity it is handed. Seeds must break the
  // line BEFORE physics runs.
  const g = buildGraph([], []);
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 40; i++) {
    nodes.push({ id: `n${i}`, label: `n${i}`, type: "entity", count: i + 1 });
    if (i > 0) edges.push({ source: `n${i - 1}`, target: `n${i}`, weight: 1, type: "evidence" });
    patchGraph(g, [...nodes], [...edges], {});
  }
  const pts = [];
  g.forEachNode((_, a) => pts.push([a.x, a.y]));
  // Max perpendicular distance from the first-to-last chord. A collinear
  // walk scores ~0; the pre-fix tree measured < 1e-9 here.
  const [x1, y1] = pts[0];
  const [x2, y2] = pts[pts.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  let maxPerp = 0;
  for (const [px, py] of pts) {
    const perp = Math.abs((x2 - x1) * (y1 - py) - (x1 - px) * (y2 - y1)) / len;
    maxPerp = Math.max(maxPerp, perp);
  }
  assert.ok(maxPerp > 0.05, `seeds are collinear: max perpendicular spread ${maxPerp}`);
});
