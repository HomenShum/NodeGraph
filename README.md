# NodeGraph

NodeGraph is a small TypeScript semantic graph layer extracted from NodeRoom. It turns room-like artifacts, spreadsheet rows, notebook blocks, evidence payloads, traces, proposals, sessions, and members into an evidence-backed relationship graph.

It is renderer-friendly rather than renderer-bound: the core graph derivation, filtering, selection, and layout functions are pure TypeScript. A compact React detail panel is included for apps that want the NodeRoom-style selection sidebar.

## What It Models

- People and agent jobs
- Companies and related entities
- Artifacts, spreadsheet rows, and notebook blocks
- Sources and evidence facts
- Funding, projects, achievements, and events
- Trace steps, proposals, and open questions

Edges use semantic verbs such as `researched`, `cited`, `supported_by`, `authored`, `updated`, `proposed`, `reviewed`, and `triggered`.

## Usage

```ts
import { buildSemanticGraph, selectSemanticNeighborhood } from "nodegraph";

const graph = buildSemanticGraph({
  roomId: "room-1",
  artifacts,
  members,
  traces,
  proposals,
  sessions,
});

const company = graph.nodes.find((node) => node.kind === "company");
const selection = selectSemanticNeighborhood(graph, company?.id, 2);
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Origin

This package was extracted from NodeRoom's semantic entity graph work. See `docs/semantic-entity-graph-research.md` for renderer research and design constraints.
