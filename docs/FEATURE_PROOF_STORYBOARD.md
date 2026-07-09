# NodeGraph Feature Proof Storyboard

This storyboard is the first step before refreshing the NodeGraph README clips.

## Premise

NodeGraph should prove that a NodeRoom-style semantic graph is more than a static diagram. It should show evidence-backed entities, people, projects, achievements, traces, and review gaps as an interactive working surface that NodeAgent can query.

## Viewer Question

Can a user inspect a company, see who researched it, identify supporting evidence, and ask NodeAgent for relevant graph context without leaving the graph surface?

## Comparison Axis

NodeGraph has two public demo surfaces:

1. React graph showcase: packaged TypeScript/React primitives with draggable React Flow nodes and a graph-side NodeAgent panel.
2. Streamlit showcase: Python-friendly graph exploration with a community Cytoscape-style component and a NodeAgent HTTP bridge.

## Conflict

Graph UIs often become pretty node clouds. This proof must show that NodeGraph preserves useful relationships: person researched company, source supports fact, trace updated row, proposal reviewed question, and review gaps remain visible.

## Evidence

The React clip must show:

- Focused CardioNova neighborhood.
- Draggable graph nodes and relationship labels.
- Evidence-backed filtering.
- Person/company/source/trace/project clusters.
- Graph agent panel prompts for evidence, review gaps, and who researched the company.

The Streamlit clip must show:

- The Cytoscape-style graph renderer.
- Focus/query URL states.
- NodeAgent quick prompt.
- Chat response with tool trace.
- Relationship table with statuses such as `source_backed`, `needs_review`, and `graph_inferred`.

## Verdict

NodeGraph works as a reusable semantic graph layer and as a product-facing graph exploration surface. It can be embedded in React apps or adapted into Streamlit while keeping the same graph and NodeAgent concepts.

## Exit Decision

A viewer should choose the React package path when embedding NodeGraph in an app, or the Streamlit path when they want a fast local graph explorer with NodeAgent Q&A.

## Capture Sequences

React showcase:

```text
CardioNova diligence map -> who researched -> funding evidence -> risk questions -> source search -> evidence-only filter
```

Streamlit showcase:

```text
Company focus -> person focus -> agent job focus -> funding evidence -> source query -> review question query
```

## Reproduce

```bash
npm run typecheck
npm test
npm run build
npm run showcase:capture
npm run streamlit:capture
```
