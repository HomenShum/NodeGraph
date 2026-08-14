# Web-quality audit — gate condition 8

**Producer:** [`promotion/scripts/audit-web-quality.mjs`](../../scripts/audit-web-quality.mjs)
**Regenerate:** `npm run audit:web-quality` (exit 0 = no major finding)

## What a stranger should take from this directory

Someone deciding whether to put this renderer in front of their users wants to
know two different things, and it is easy to answer one and pretend you
answered both. The first is *does the page hold up to the standard tools* —
contrast, semantics, load behaviour, Core Web Vitals. The second is *can the
person actually use it while an agent is streaming into it*. This directory is
the first question. The second is [`../wig/`](../wig), and the two are kept
apart on purpose: a Lighthouse score is not a Web Interface Guidelines review,
and quoting one for the other is the specific dishonesty the gate warns about.

## The files

| File | What it is |
|---|---|
| `web-quality.json` | The summary the scorecard row cites: verdict, the list of majors, the axe violations, the Lighthouse scores and Core Web Vitals for both form factors, and the interaction-latency measurement. |
| `lighthouse-mobile.json` | Full Lighthouse 13.4.1 report, mobile default (412x823, 4x CPU throttle). |
| `lighthouse-desktop.json` | Full Lighthouse 13.4.1 report, `--preset=desktop`. |
| `axe.json` | Full axe-core 4.13.0 CLI report. A second engine, so a clean sheet is not one tool agreeing with itself. |

## The verdict rule, stated before the numbers

MAJOR is any axe violation of impact `serious` or `critical`, or a Lighthouse
accessibility score below 0.90. Everything else is recorded with its severity
and does not fail the gate on its own. The rule is in the producer's header so
it cannot be relaxed after a number comes back inconvenient.

## What it found, and what it did not

The first run of this audit, against the tree as it stood, was not clean: axe
reported `color-contrast` (serious) on the counter under the stage and
`heading-order` (moderate) on the component's own heading, Lighthouse mobile
scored accessibility 0.88, SEO 0.90, best-practices 0.96, and logged a browser
error for a 404 favicon. Those are fixed, and the committed reports are from
the fixed tree.

Two things this audit reports but does not resolve:

- **Mobile performance sits in the 0.7s, not the 0.9s.** The blocking time is
  a hundred and forty entities force-laid-out and streamed on a 4x-throttled
  phone; the desktop preset scores 0.99 on the same page. Whether that
  *obstructs* anyone is a different measurement, which is why the
  `interaction` block exists: worst key-to-readout latency unthrottled, worst
  throttled, and how long the field takes to go still.
- **Lighthouse numbers vary run to run** on a loaded machine — mobile
  performance moved between 0.68 and 0.85, and desktop between 0.80 and 1.00,
  across consecutive runs of an identical tree. The accessibility,
  best-practices and SEO scores and the axe result did not move at all. Read the committed report as one honest sample, not a
  constant, and re-run before treating a change of a few points as a
  regression.
