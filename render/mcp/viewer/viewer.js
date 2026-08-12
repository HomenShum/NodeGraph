import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { GraphSession } from "../../dist/index.js";
import { NodeGraph } from "../../dist/react.js";

// Replays the server's accepted-event log through a browser session; the
// eventId dedupe makes re-polling idempotent, so this is a true tail.
const session = new GraphSession({ maxNodes: 1000, maxEdges: 3000, maxSeen: 5000 });
let applied = 0;

async function tail() {
  try {
    const res = await fetch("/.nodegraph/events.jsonl", { cache: "no-store" });
    if (res.ok) {
      const lines = (await res.text()).trim().split("\n").filter(Boolean);
      for (const line of lines.slice(applied)) {
        const ev = JSON.parse(line);
        if (ev.type === "observe") {
          session.observe(ev.entities, ev.measuredCount, { eventId: ev.eventId });
        } else if (ev.type === "assert_edge") {
          session.assertEdge(ev.a, ev.b, ev.receipt, { eventId: ev.eventId });
        }
        applied += 1;
      }
      const log = document.querySelector("#log");
      if (log) {
        const s = session.getSnapshot();
        log.textContent = `${applied} accepted events replayed · ${s.nodes.length} entities · ${s.edges.length} edges`;
      }
    }
  } catch {
    /* server not up yet; keep polling */
  }
  window.setTimeout(tail, 1000);
}

function App() {
  const snap = useSyncExternalStore(
    (l) => session.subscribe(l),
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );
  return React.createElement(NodeGraph, {
    nodes: snap.nodes,
    edges: snap.edges,
    height: 620,
    dark: true,
  });
}

createRoot(document.querySelector("#root")).render(React.createElement(App));
tail();
