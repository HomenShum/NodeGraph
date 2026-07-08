# NodeAgent Integration

NodeGraph does not ship its own agent runtime. NodeRoom already has the
canonical NodeAgent harness, so NodeGraph exposes a small bridge:

- `createNodeGraphAgentTools()` creates NodeAgent-compatible graph tools.
- `createNodeGraphAgentContextBuilder()` builds compact graph context.
- `runNodeGraphNodeAgent()` calls a caller-supplied NodeRoom `runAgent`.
- `NodeGraphAgentPanel` is the React panel that sends graph questions to the
  NodeAgent-backed runner.

The package stays standalone because NodeRoom passes the real runtime in from
the application boundary.

## NodeRoom Wiring

```ts
import { runAgent } from "../noderoom/src/nodeagent/core/runtime";
import { model } from "../noderoom/src/nodeagent/models/adapter";
import { InMemoryRoomTools } from "../noderoom/src/nodeagent/skills/integration/noderoomAdapter";
import {
  NodeGraphAgentPanel,
  buildSemanticGraph,
  runNodeGraphNodeAgent,
} from "nodegraph";

const graph = buildSemanticGraph({
  roomId,
  artifacts,
  members,
  traces,
  proposals,
  sessions,
});

async function askGraphAgent(prompt: string) {
  return runNodeGraphNodeAgent({
    runAgent,
    rt: new InMemoryRoomTools(engine, roomId, sheetId, actor, session),
    model: model("gemini-2.5-flash"),
    goal: prompt,
    getGraph: () => graph,
    selectedNodeId,
    maxSteps: 6,
  });
}

<NodeGraphAgentPanel
  graph={graph}
  selectedNodeId={selectedNodeId}
  onRunAgent={async ({ prompt }) => {
    const result = await askGraphAgent(prompt);
    return {
      finalText: result.finalText,
      trace: result.trace,
      raw: result,
    };
  }}
/>;
```

## NodeAgent Tools

The bridge exposes read-only graph tools:

- `nodegraph_overview`
- `nodegraph_search`
- `nodegraph_select_neighborhood`
- `nodegraph_evidence_summary`
- `nodegraph_open_questions`

These are intentionally graph-read tools. NodeRoom-owned tools remain
responsible for governed room writes, approvals, traces, CAS edits, and durable
state.

## Runtime Boundary

Do not copy NodeAgent into NodeGraph. NodeRoom should keep owning:

- model routing
- spend and time budgets
- stream events
- trace receipts
- approval/write policy
- `RoomTools`

NodeGraph owns:

- graph derivation
- graph selection/filter helpers
- graph-agent tool definitions
- graph-agent UI panel
