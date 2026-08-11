/**
 * Minimal usage: a session store feeding the renderer through
 * useSyncExternalStore. Typecheckable; mount <Basic /> in any React 18+ app.
 */

import { useSyncExternalStore } from "react";
import { GraphSession, NodeGraph } from "../src";

const session = new GraphSession();

// Two participants with a measured conjunction -> an `evidence` edge
// carrying the measured weight (width channel allowed).
session.observe(
  [
    { kind: "condition", label: "melanoma" },
    { kind: "intervention", label: "ipilimumab" },
  ],
  362,
);

// Three participants -> pairwise `traversal` edges only. No measured pair
// count exists, so no edge may claim one.
session.observe([
  { kind: "condition", label: "melanoma" },
  { kind: "intervention", label: "ipilimumab" },
  { kind: "sponsor", label: "BMS" },
]);

// A curated claim, badged with the release that introduced it.
session.assertEdge(
  { kind: "intervention", label: "ipilimumab" },
  { kind: "intervention", label: "nivolumab" },
  { releaseTag: "v1.2" },
);

export function Basic() {
  const snap = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  return (
    <NodeGraph
      nodes={snap.nodes}
      edges={snap.edges}
      visits={session.visitsById()}
      height={480}
    />
  );
}
