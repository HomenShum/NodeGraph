# Changelog — rendered demo gate

> **Surface**: Standalone browser demo and its falsifiable motion receipt.
>
> **Append rule**: New entries go at the top; never rewrite prior entries.

## 2026-08-13 — Make the gate measure this demo, not the one it replaced

`verify:demo` exited 1 on every fresh clone: the probe asserted the page
contained "Add another live branch" and the browser gate clicked `#add-branch`,
a control the ten-scenario gallery had deleted. Fixing that exposed three more.
The decay sample was timed for a single short ingestion and now landed 5.6s into
a 6s stream, reading 87,317 lit pixels and calling the demo broken; live-then-
still is now measured twice against "Calm by contract", a scenario with exactly
one event. A single pixel sample during a fast stream read 0 about one run in
five, because each ingestion re-runs the overlay effect and resizing the canvas
clears it one frame early; the check now takes the brightest of five samples.
And `rmSync` on the temp Chrome profile threw EBUSY on Windows after the proof
had already printed PASS, turning a green run into exit 1. Six consecutive runs
now exit 0. `serve-demo.mjs` also gained two optional arguments so it can host
`examples/compose`, which lives above this package.
**Commit**: `wave-3`. **Author**: Homen Shum + Claude.
**Touches**: `CHANGELOG/components/NodeGraph.md`

## 2026-08-11 — Ship the rendered lightning proof

Package a Chrome gate that requires live pixels during ingestion, exact zero
after decay, zero browser errors, and a readable 1280×900 evidence frame. A
fresh tarball consumer can run the same proof without the source checkout.
**Commit**: `a10d05b`. **Author**: Homen Shum + Codex.
**Touches**: `CHANGELOG/core/session-engine.md`, `CHANGELOG/components/NodeGraph.md`
