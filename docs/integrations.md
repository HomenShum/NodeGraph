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

For a Neo4j import adapter, keep the raw NodeGraph ids as immutable keys and
derive Neo4j labels from `node.kind`. Relationship types should be derived from
`edge.kind.toUpperCase()`.

## Streamlit

The Streamlit example uses the same NodeGraph JSON shape and renders it with
PyVis inside Streamlit. It is intentionally separate from the core TypeScript
package.

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
be used with exported NodeRoom graph JSON.

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
