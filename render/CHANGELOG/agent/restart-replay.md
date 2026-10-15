# Changelog — MCP restart recovery

> **Surface**: An agent adds findings while a user watches the graph.
> **Append rule**: Add entries; preserve earlier observations.

## 2026-10-15 — Preserve conflict checks after an agent restarts

Before, a new writer forgot event identities in its retained file. It could
accept a changed retry that stalled the viewer and hid later valid findings.
Startup now restores the same bounded session before reading requests, so the
conflicting call is refused and the next valid finding can be replayed.

Replay streams records with a 1 MiB per-record limit and a 30-second I/O and
cooperative budget. Bad history stops startup without rewriting evidence.
The real-process regressions cover queued calls, both tools, damaged histories,
UTF-8 size admission, bursts and FIFO receipt expiry after more than 5,000 calls.
The viewer, core session, dependencies and CI gates are unchanged.

**Commit**: resolve with `git log -- render/mcp/server.mjs`.
**Author**: Homen Shum + Codex.
**Touches**: `render/mcp/server.mjs`, `render/tests/mcp-restart.test.mjs`,
`render/README.md`, `.tours/02-agent-execution.tour`, `docs/START_HERE.md`.

Historical-log repair, concurrent writers, append-failure atomicity and hard CPU
preemption remain outside this patch. Local proof is not production certification.
