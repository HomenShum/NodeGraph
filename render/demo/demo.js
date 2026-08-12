import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { GraphSession } from "../dist/index.js";
import { NodeGraph } from "../dist/react.js";

const session = new GraphSession({ maxNodes: 80, maxEdges: 160, maxSeen: 320 });
session.observe(
  [{ kind: "condition", label: "unmeasured cohort" }],
  undefined,
  { eventId: "seed:unknown" },
);
session.observe(
  [{ kind: "condition", label: "measured empty cohort" }],
  0,
  { eventId: "seed:zero" },
);

const receipt = {
  source: "Reactome",
  release: "v97",
  subjectId: "R-HSA-6802912",
  objectId: "R-HSA-6802957",
  url: "https://reactome.org/content/detail/R-HSA-6802912",
};

let branch = 0;
function addBranch() {
  branch += 1;
  const suffix = branch === 1 ? "" : ` ${branch}`;
  const condition = { kind: "condition", label: `melanoma${suffix}` };
  const intervention = { kind: "intervention", label: `pembrolizumab${suffix}` };
  window.setTimeout(
    () => session.observe([condition, intervention], 120, { eventId: `evidence:${branch}` }),
    150,
  );
  window.setTimeout(
    () =>
      session.observe(
        [condition, intervention, { kind: "country", label: "United States" }],
        undefined,
        { eventId: `traversal:${branch}` },
      ),
    950,
  );
  window.setTimeout(
    () =>
      session.assertEdge(
        { kind: "reaction", label: "BRAF mutants bind MAPKs" },
        { kind: "pathway", label: "Oncogenic MAPK signaling" },
        receipt,
        {
          eventId: `assertion:${branch}`,
        },
      ),
    1_750,
  );
}

function Demo() {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  return React.createElement(NodeGraph, {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    visits: session.visitsById(),
    height: 560,
  });
}

document.querySelector("#add-branch")?.addEventListener("click", addBranch);
createRoot(document.querySelector("#root")).render(React.createElement(Demo));
window.setTimeout(addBranch, 400);
