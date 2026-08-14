# Web Interface Guidelines review — gate condition 7

**Producer:** [`promotion/scripts/review-wig.mjs`](../../scripts/review-wig.mjs)
**Regenerate:** `npm run review:wig` (exit 0 = no major finding)
**Guidelines:** Vercel's Web Interface Guidelines, <https://vercel.com/design/guidelines>, fetched 2026-08-13

## What this is, and what it is not

Condition 7 is a *review*. It asks whether a person can operate this surface —
reach it by keyboard, see where focus is, be told when something changed,
recognise every state they can land in — against a published checklist. It is
not a tool score. Condition 8 runs Lighthouse and axe and lives in
[`../web-quality/`](../web-quality); this directory never quotes those scores as
if they answered this question. Where a guideline overlaps a rule axe already
measures in place (text contrast), the row cites the axe report rather than
re-deriving the number, and says so in the row.

## The files

| File | What it is |
|---|---|
| `wig-review.json` | Every guideline checked, with the measurement that decided it, the verdict, and — for the rows that are not applicable — the reason. Also `invariantConflicts`, below. |
| `desktop-1440.png` | The surface at 1440x900, settled. |
| `responsive-390.png`, `responsive-768.png` | The same surface at phone and tablet width. |
| `keyboard-focus-ring.png` | The focus ring on the graph stage and on a scenario chip. |
| `keyboard-selection.png` | The readout opened by ArrowRight, with no mouse involved. |
| `state-error.png` | The error state: an assertion arriving with an empty release, refused whole, said in words. |
| `reduced-motion.png` | The same ingestion under `prefers-reduced-motion: reduce`. |

## How a row is decided

Each row carries `how` — the literal measurement — so the verdict can be
re-derived. A row is a FINDING when the measurement fails, and its
`severityIfFailed` decides whether that blocks the condition. Only `major`
findings block. The two open `minor` findings are named in the JSON with what
closing them would take.

## Where the guidelines lose

This repo's binding rule is the trust grammar: evidence, assertion and
traversal edges must never look alike; motion never encodes magnitude; position
is layout only; unknown is never drawn as zero. Three guidelines pull against
it, and in each case the invariant wins — most sharply "optimistic updates",
which this surface refuses outright, because an optimistically drawn edge is a
claim the system has not confirmed wearing the ink of one it has. The conflicts
are listed in `wig-review.json` under `invariantConflicts` rather than resolved
silently, because a rule you quietly declined to follow is indistinguishable
from one you forgot.

## One thing done in the open

The `graph-fits-mobile` row originally scored the SUM of ink in all four edges
of the label canvas ring and read FINDING at 37 pixels. Split, after seeing
where the ink actually was: all of it on the right edge, which is a label
truncated by the frame, not a field overflowing its stage. The framing half
passes (top, bottom and left are 0, and were not before); the truncation half
is its own `minor` row, `label-truncation-mobile`, still open at 47 pixels. The
split is recorded in the row's own `note` because changing a check after seeing
its result is exactly the move a reader should be suspicious of.
