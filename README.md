# NodeGraph

NodeGraph is a small TypeScript semantic graph layer extracted from NodeRoom. It turns room-like artifacts, spreadsheet rows, notebook blocks, evidence payloads, traces, proposals, sessions, and members into an evidence-backed relationship graph.

It is renderer-friendly rather than renderer-bound: the core graph derivation, filtering, selection, and layout functions are pure TypeScript. A compact React detail panel is included for apps that want the NodeRoom-style selection sidebar.

![NodeGraph product showcase](docs/media/nodegraph-showcase.gif)

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

## Example App

The local showcase app demonstrates the same graph relationships NodeRoom uses: people researching companies, evidence-backed rows, traces, proposals, sessions, and clustered project or achievement context.

```bash
npm run example:dev
```

Then open [http://127.0.0.1:5174](http://127.0.0.1:5174).

```bash
npm run example:build
npm run showcase:capture
```

`npm run showcase:capture` writes the README GIF to `docs/media/nodegraph-showcase.gif` and expects `ffmpeg` to be available on `PATH`.

## Streamlit And Neo4j-Style Graphs

NodeGraph already uses a Neo4j-style property graph shape: stable node ids, typed node kinds, typed edge relationships, properties, statuses, and provenance refs. It is not a Neo4j database or Cypher runtime, but its output can be adapted to Neo4j, NVL, NeoVis, PyVis, or Streamlit.

![NodeGraph Streamlit showcase](docs/media/nodegraph-streamlit-showcase.gif)

```bash
cd examples/streamlit
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

Generate the Streamlit README/demo GIF from the repo root:

```bash
npm run streamlit:capture
```

See `docs/integrations.md` for the Streamlit example and Neo4j-style mapping.

## Origin

This package was extracted from NodeRoom's semantic entity graph work. See `docs/semantic-entity-graph-research.md` for renderer research and design constraints.
