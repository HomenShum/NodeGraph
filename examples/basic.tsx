/**
 * Minimal usage: a session store feeding the renderer through
 * useSyncExternalStore. Typecheckable; mount <Basic /> in any React 18+ app.
 */

import { useSyncExternalStore } from "react";
import { GraphSession } from "../src/index.js";
import { NodeGraph } from "../src/react.js";

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
  { kind: "reaction", label: "BRAF mutants bind MAPKs" },
  { kind: "pathway", label: "Oncogenic MAPK signaling" },
  {
    source: "Reactome",
    release: "v97",
    subjectId: "R-HSA-6802912",
    objectId: "R-HSA-6802957",
    url: "https://reactome.org/content/detail/R-HSA-6802912",
  },
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
