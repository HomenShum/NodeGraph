/**
 * The trust grammar is BINDING: evidence, assertion and traversal edges must
 * never be confusable. Prose said so; nothing measured it, so it drifted —
 * assertion and traversal shipped 6.70 CIEDE2000 apart in dark (defect D3).
 *
 * This is the cheap gate that runs in `npm test`. The browser-side proof
 * (`promotion/scripts/prove-edge-grammar.mjs`) reads the same values out of
 * the rendered demo; this one catches the regression before it is ever served.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildGraph, patchGraph } from "../dist/index.js";

/* CIEDE2000, with a self-check against Sharma's reference pairs so the numbers
 * this test rests on cannot be quietly wrong. Duplicated from the promotion
 * proof on purpose: this package ships without it, and a shared helper would
 * be a published API for a two-caller function. */

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hexToLab = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);
  const hp = (b, ap) => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hp(b1, ap1);
  const hp2 = hp(b2, ap2);
  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;
  let dhp;
  if (Cp1 * Cp2 === 0) dhp = 0;
  else if (Math.abs(hp2 - hp1) <= 180) dhp = hp2 - hp1;
  else if (hp2 - hp1 > 180) dhp = hp2 - hp1 - 360;
  else dhp = hp2 - hp1 + 360;
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dhp) / 2);
  const Lbar = (L1 + L2) / 2;
  const Cpbar = (Cp1 + Cp2) / 2;
  let hpbar;
  if (Cp1 * Cp2 === 0) hpbar = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hpbar = (hp1 + hp2) / 2;
  else if (hp1 + hp2 < 360) hpbar = (hp1 + hp2 + 360) / 2;
  else hpbar = (hp1 + hp2 - 360) / 2;
  const T =
    1 -
    0.17 * Math.cos(rad(hpbar - 30)) +
    0.24 * Math.cos(rad(2 * hpbar)) +
    0.32 * Math.cos(rad(3 * hpbar + 6)) -
    0.2 * Math.cos(rad(4 * hpbar - 63));
  const dTheta = 30 * Math.exp(-(((hpbar - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpbar ** 7 / (Cpbar ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
  const Sc = 1 + 0.045 * Cpbar;
  const Sh = 1 + 0.015 * Cpbar * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

/**
 * Floors, and where they come from.
 *
 * CIE's just-noticeable difference is ~2.3, and that is the best case: two
 * large patches, side by side, controlled light. These are 0.6-5px
 * anti-aliased strokes scattered across a stage, read at a glance, often
 * crossing each other. Roughly 6.5x the JND is the bar, which is DE_FLOOR 15.
 * For audit, the measurements it brackets: assertion vs traversal scored 6.70
 * dark / 9.44 light at commit f136ae2, and the worst pair now scores 21.83.
 *
 * GREY_FLOOR exists so no pair may depend on hue alone: a reader with no
 * colour vision must still separate all three. It is mark-against-mark, not
 * WCAG's 3:1 mark-against-background, so it is named separately rather than
 * borrowed.
 */
const DE_FLOOR = 15;
const GREY_FLOOR = 1.6;

const NODES = [
  { id: "a", label: "A", type: "condition" },
  { id: "b", label: "B", type: "intervention" },
  { id: "c", label: "C", type: "protein" },
  { id: "d", label: "D", type: "reaction" },
];
const EDGES = [
  { source: "a", target: "b", weight: 120, type: "evidence" },
  { source: "b", target: "c", weight: 7, type: "traversal" },
  {
    source: "c",
    target: "d",
    weight: 1,
    type: "assertion",
    receipt: {
      source: "Reactome",
      release: "v97",
      subjectId: "R-HSA-6802913",
      objectId: "R-HSA-6802957",
      url: "https://reactome.org/content/detail/R-HSA-6802913",
    },
  },
];

test("CIEDE2000 self-check against Sharma's published reference pairs", () => {
  for (const [lab1, lab2, expected] of [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, -1, 2], [50, 0, 0], 2.3669],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ]) {
    assert.ok(Math.abs(deltaE2000(lab1, lab2) - expected) < 1e-3);
  }
});

for (const dark of [true, false]) {
  const theme = dark ? "dark" : "light";
  test(`no two trust classes are confusable in ${theme}`, () => {
    const g = buildGraph(NODES, EDGES, { dark });
    const ink = {};
    g.forEachEdge((_k, a) => (ink[a.edgeType] = a.color));
    assert.deepEqual(Object.keys(ink).sort(), ["assertion", "evidence", "traversal"]);

    const names = Object.keys(ink).sort();
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [x, y] = [names[i], names[j]];
        const de = deltaE2000(hexToLab(ink[x]), hexToLab(ink[y]));
        const grey = contrastRatio(ink[x], ink[y]);
        assert.ok(
          de >= DE_FLOOR,
          `${theme}: ${x} (${ink[x]}) and ${y} (${ink[y]}) are ${de.toFixed(2)} CIEDE2000 apart, floor ${DE_FLOOR}`,
        );
        assert.ok(
          grey >= GREY_FLOOR,
          `${theme}: ${x} (${ink[x]}) and ${y} (${ink[y]}) separate by hue only — greyscale ${grey.toFixed(2)}:1, floor ${GREY_FLOOR}`,
        );
      }
    }
  });
}

test("the trust grammar survives a patch: an edge that arrives later keeps its class ink", () => {
  // patchGraph writes edge attributes through the same helper as buildGraph.
  // A streamed assertion must not arrive wearing traversal's ink.
  const g = buildGraph(NODES.slice(0, 2), [EDGES[0]], { dark: true });
  const built = buildGraph(NODES, EDGES, { dark: true });
  const expected = {};
  built.forEachEdge((_k, a) => (expected[a.edgeType] = a.color));

  patchGraph(g, NODES, EDGES, { dark: true });
  const after = {};
  g.forEachEdge((_k, a) => (after[a.edgeType] = a.color));
  assert.deepEqual(after, expected);
});
