# NodeGraph Integrations

NodeGraph produces a semantic property graph: typed nodes, typed edges, statuses,
weights, refs, and metadata. That maps cleanly to Neo4j-style graph concepts, but
NodeGraph is not itself a Neo4j database, Cypher runtime, or graph persistence
engine.

## Neo4j-Style Mapping

Use this mapping when exporting NodeGraph data to Neo4j, NVL, NeoVis, Graphistry,
Streamlit components, or another graph renderer:

| NodeGraph field | Property-graph equivalent |
| --- | --- |
| `node.id` | Stable node key |
| `node.kind` | Primary label, such as `Company`, `Person`, or `Source` |
| `node.label` | Human-readable display label |
| `node.status` | Review or evidence state |
| `node.refs` | Provenance properties |
| `node.meta` | Additional properties |
| `edge.kind` | Relationship type, such as `RESEARCHED` or `SUPPORTED_BY` |
| `edge.label` | Relationship display label |
| `edge.refs` | Relationship provenance |

The package includes a driver-neutral Neo4j adapter:

```ts
import {
  buildNeo4jSyncPlan,
  buildSemanticGraph,
  executeNeo4jSyncPlan,
  exportNodeGraphDocument,
} from "nodegraph";

const graph = buildSemanticGraph({ roomId, artifacts, traces, proposals, decks });
const document = exportNodeGraphDocument(graph, {
  graphId: roomId,
  provenance: { source: "noderoom", sourceId: roomId },
});
const plan = buildNeo4jSyncPlan(document, previousDocument, { pruneMissing: true });
await executeNeo4jSyncPlan(neo4jSession, plan);
```

The plan keeps raw NodeGraph ids as immutable keys, scopes every node and
relationship by `graphId`, derives labels and relationship types from the
closed NodeGraph kind unions, and passes all user data as `$rows` parameters.
It uses only standard `UNWIND`, `MERGE`, `MATCH`, and `SET` clauses, so APOC is
not required. Provenance refs and metadata are preserved as JSON properties;
applications can promote them to dedicated provenance nodes when their schema
requires that topology.

The non-destructive `buildNeo4jUpsertPlan` remains available for full upserts.
Incremental sync defaults to retaining missing records; `pruneMissing: true`
adds explicit stale relationship and node batches. Every synchronized record
includes the NodeGraph revision, sync timestamp, and document provenance.
Inspect either plan before execution when an approval boundary is required.

## Portable Import And In-Memory Storage

`nodegraph.document` v1 is the renderer- and database-neutral interchange
format. `exportNodeGraphDocument` and `parseNodeGraphDocument` validate stable
ids, relationship endpoints, deterministic revisions, source provenance, and
optional persisted positions/pins. `InMemoryNodeGraphAdapter` stores the same
documents and returns an incremental receipt for every import or sync.

## Decks And Relevant Paths

Pass collaborative deck storyboards through the optional `decks` input. The
graph models decks, slides, claims, source artifacts, evidence, traces,
proposals, and unresolved evidence gaps. `selectSemanticNeighborhood` returns
ranked `paths` in addition to sectioned neighbors; these paths prioritize
researched, source-backed, and review-relevant routes and are bounded to four
hops for responsive UI use.

## Streamlit

The Streamlit example uses the same NodeGraph JSON shape and renders it with
`st-link-analysis`, a Cytoscape.js community component for link analysis. It
supports draggable nodes, pan/zoom controls, fullscreen exploration, layout
refresh, neighborhood highlighting, and selected-element metadata. A PyVis
physics renderer remains available in the sidebar as a fallback.

The Streamlit integration is intentionally separate from the core TypeScript
package. Its NodeAgent panel calls an HTTP bridge so Python does not need to
import the TypeScript runtime directly. The bundled bridge uses the exported
`runNodeGraphNodeAgent` contract and can be replaced by a NodeRoom-hosted
endpoint through `NODEGRAPH_NODEAGENT_URL`.

Start the local bridge from the repo root:

```bash
npm run build
npm run streamlit:agent
```

Then start Streamlit in another terminal:

```bash
cd examples/streamlit
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

On macOS or Linux, activate the virtual environment with:

```bash
source .venv/bin/activate
```

The example reads `examples/streamlit/nodegraph-showcase.json`, so it can also
be used with exported NodeRoom graph JSON. The page includes a NodeRoom-style
NodeAgent chat lane with session-local message history, `@nodeagent` prompts,
quick buttons for evidence/people/review gaps, and a per-reply tool trace
expander.

The Streamlit view also supports lightweight URL state for deterministic demos:

```text
http://localhost:8501/?focus=company:cardionova
http://localhost:8501/?query=source&focus=source:pitchbook-cardionova&evidence=1
```

From the repo root, generate the Streamlit demo GIF with:

```bash
npm run streamlit:capture
```

The generated file is `docs/media/nodegraph-streamlit-showcase.gif`.

## README Proof Clips

NodeGraph's README clips are maintained with the same operating standard as
`feature-proof-studio`: deterministic browser setup, scripted state changes,
captured intermediate states, and ffmpeg palette encoding. The capture scripts
remain local to this repo so contributors can regenerate the clips with one npm
command per surface.

```bash
npm run showcase:capture
npm run streamlit:capture
```

The React showcase proves draggable React Flow nodes, selected-neighborhood
highlighting, evidence filtering, and the graph agent panel. The Streamlit
showcase proves the community graph component path, NodeAgent bridge, chat lane,
and per-reply tool trace.
