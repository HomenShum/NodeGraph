# Changelog — React NodeGraph

> **Surface**: Browser/client renderer for measured, traversal, and assertion edges.
>
> **Append rule**: New entries go at the top; never rewrite prior entries.

## 2026-08-13 — One import form for the component

Removed the default export from `NodeGraph.tsx` and its re-export from
`react.ts`. Nothing in the repo imported the default, and two names for one
component is one decision a reader should not have to make. Named import only:
`import { NodeGraph } from "@homenshum/nodegraph-live/react"`.
**Commit**: `wave-3`. **Author**: Homen Shum + Claude.
**Touches**: `CHANGELOG/scripts/rendered-demo.md`

## 2026-08-11 — Separate visual trust classes

Render measured evidence, local traversal, and curated assertions with distinct
semantics, retain nullable magnitude, and skip transient non-finite projection
geometry without stopping the cinematic loop.
**Commit**: `a10d05b`. **Author**: Homen Shum + Codex.
**Touches**: `CHANGELOG/core/session-engine.md`, `CHANGELOG/scripts/rendered-demo.md`
