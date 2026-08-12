# Changelog — core session engine

> **Surface**: Turns typed ingest events into bounded, deterministic graph state.
>
> **Append rule**: New entries go at the top; never rewrite prior entries.

## 2026-08-11 — Enforce the graph trust boundary

Bound nodes, edges, and event identities; preserve unknown versus measured
zero; reject untyped or unreceipted claims atomically. This keeps a long agent
session from turning telemetry into scientific evidence or unbounded memory.
**Commit**: `a10d05b`. **Author**: Homen Shum + Codex.
**Touches**: `CHANGELOG/components/NodeGraph.md`, `CHANGELOG/scripts/rendered-demo.md`
