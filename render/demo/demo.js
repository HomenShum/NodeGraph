import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { GraphSession } from "../dist/index.js";
import { NodeGraph } from "../dist/react.js";

/**
 * Scenario gallery. Each scenario builds a FRESH session and streams events on
 * timers, so every run replays the ingestion window honestly: flares and
 * comets while events land, stillness after. Switching scenarios cancels the
 * previous one's timers.
 */

let session = new GraphSession({ maxNodes: 400, maxEdges: 900, maxSeen: 2000 });
let timers = [];
let nonce = 0;
const later = (ms, fn) => timers.push(window.setTimeout(fn, ms));
const resetSession = (opts) => {
  for (const t of timers) window.clearTimeout(t);
  timers = [];
  nonce += 1;
  session = new GraphSession(opts ?? { maxNodes: 400, maxEdges: 900, maxSeen: 2000 });
  rerender();
};
const id = (s) => `${nonce}:${s}`;

const ent = (kind, label) => ({ kind, label });
const receipt = (subjectId, objectId, release = "v97") => ({
  source: "Reactome",
  release,
  subjectId,
  objectId,
  url: `https://reactome.org/content/detail/${subjectId}`,
});

/* ------------------------------------------------------------------ */
const SCENARIOS = [
  {
    name: "Unknown vs zero",
    caption:
      "The two loneliest states, distinguished on purpose: a cohort nobody measured says " +
      "“unknown — not measured”; a cohort measured at 0 says so. A renderer that " +
      "confuses them invents a fact.",
    run() {
      resetSession();
      later(200, () => session.observe([ent("condition", "unmeasured cohort")], undefined, { eventId: id("u") }));
      later(900, () => session.observe([ent("condition", "measured empty cohort")], 0, { eventId: id("z") }));
    },
  },
  {
    name: "Evidence lands",
    caption:
      "A measured conjunction arrives: melanoma × pembrolizumab, weight 120 from a counted " +
      "source. Evidence edges own the width channel — nothing else may ride it.",
    run() {
      resetSession();
      later(200, () => session.observe([ent("condition", "melanoma")], 3743, { eventId: id("c") }));
      later(1000, () => session.observe([ent("condition", "melanoma"), ent("intervention", "pembrolizumab")], 120, { eventId: id("e1") }));
      later(1900, () => session.observe([ent("condition", "melanoma"), ent("intervention", "ipilimumab")], 362, { eventId: id("e2") }));
      later(2800, () => session.observe([ent("condition", "melanoma"), ent("intervention", "nivolumab")], 231, { eventId: id("e3") }));
    },
  },
  {
    name: "Deep traversal",
    caption:
      "A chain deepens one hop at a time — drug to target to pathway to disease family — " +
      "each hop staggered so growth reads as a wavefront walking the structure, not a popped-in " +
      "diagram. Multi-entity turns draw faint traversal history, never invented pair counts.",
    run() {
      resetSession();
      const chain = [
        ["intervention", "pembrolizumab"], ["protein", "PD-1"], ["pathway", "co-inhibition"],
        ["pathway", "TCR signaling"], ["process", "T-cell activation"], ["condition", "melanoma"],
        ["condition", "NSCLC"], ["organ", "skin"], ["organ", "lung"],
      ];
      chain.forEach(([k, l], i) => {
        later(300 + i * 650, () => {
          session.observe([ent(k, l)], undefined, { eventId: id(`n${i}`) });
          if (i > 0) {
            const [pk, pl] = chain[i - 1];
            session.observe([ent(pk, pl), ent(k, l), ent("session", "hop trace")], undefined, { eventId: id(`t${i}`) });
          }
        });
      });
      later(300 + chain.length * 650 + 400, () =>
        session.assertEdge(ent("protein", "PD-1"), ent("pathway", "co-inhibition"),
          receipt("R-HSA-389948", "R-HSA-389948"), { eventId: id("a") }));
    },
  },
  {
    name: "Hub burst",
    caption:
      "One hub, thirty-six spokes, cascading in. The stagger is ordinal — it encodes arrival " +
      "order, never magnitude — and the layout opens as density climbs.",
    run() {
      resetSession();
      later(200, () => session.observe([ent("condition", "melanoma")], 3743, { eventId: id("hub") }));
      const kinds = ["intervention", "sponsor", "country", "phase", "biomarker", "site"];
      for (let i = 0; i < 36; i++) {
        const k = kinds[i % kinds.length];
        later(700 + i * 120, () =>
          session.observe([ent("condition", "melanoma"), ent(k, `${k} ${i + 1}`)], 20 + ((i * 37) % 300), { eventId: id(`s${i}`) }));
      }
    },
  },
  {
    name: "Dense constellation",
    caption:
      "Twelve clusters, ~140 entities, seven kinds of node — hue is a categorical channel " +
      "for KIND, never a value. Watch the field breathe while ingesting, then settle to stillness.",
    run() {
      resetSession();
      const kinds = ["condition", "intervention", "sponsor", "protein", "pathway", "country", "biomarker"];
      for (let c = 0; c < 12; c++) {
        const hubKind = kinds[c % kinds.length];
        const hub = ent(hubKind, `${hubKind} hub ${c + 1}`);
        later(200 + c * 420, () => session.observe([hub], 100 + c * 53, { eventId: id(`h${c}`) }));
        for (let s = 0; s < 10; s++) {
          const k = kinds[(c + s + 1) % kinds.length];
          later(420 + c * 420 + s * 90, () =>
            session.observe([hub, ent(k, `${k[0]}${c}-${s}`)], 5 + ((s * 91 + c * 17) % 240), { eventId: id(`c${c}s${s}`) }));
        }
        // Mesh, not a chain: each hub bridges to TWO earlier hubs (a path
        // graph force-layouts into a line — measured on the first capture).
        for (const back of [1, 3]) {
          if (c - back < 0) continue;
          const prevKind = kinds[(c - back) % kinds.length];
          later(700 + c * 420 + back * 40, () =>
            session.observe(
              [ent(prevKind, `${prevKind} hub ${c - back + 1}`), hub], 3 + ((c * back * 29) % 90),
              { eventId: id(`b${c}-${back}`) },
            ));
        }
        // A few long-range spoke ties so clusters interlock.
        if (c >= 2 && c % 2 === 0) {
          const k1 = kinds[(c + 1) % kinds.length];
          const k2 = kinds[(c + 3) % kinds.length];
          later(900 + c * 420, () =>
            session.observe([ent(k1, `${k1[0]}${c}-2`), ent(k2, `${k2[0]}${c - 2}-5`)], 2 + (c % 40), { eventId: id(`x${c}`) }));
        }
      }
    },
  },
  {
    name: "Assertion chain",
    caption:
      "Curated claims join the measured field: violet assertion edges, each carrying a full " +
      "replay receipt (source, release, both stable ids, a literal URL) and badged with its " +
      "release. A claim can never pass as a measurement.",
    run() {
      resetSession();
      later(200, () => session.observe([ent("intervention", "vemurafenib")], 412, { eventId: id("v") }));
      const hops = [
        [ent("intervention", "vemurafenib"), ent("protein", "BRAF V600E"), "R-HSA-6802912", "R-HSA-6802913"],
        [ent("protein", "BRAF V600E"), ent("reaction", "BRAF mutants bind MAPKs"), "R-HSA-6802913", "R-HSA-6802957"],
        [ent("reaction", "BRAF mutants bind MAPKs"), ent("pathway", "Oncogenic MAPK signaling"), "R-HSA-6802957", "R-HSA-6802955"],
        [ent("pathway", "Oncogenic MAPK signaling"), ent("pathway", "Diseases of signal transduction"), "R-HSA-6802955", "R-HSA-5663202"],
      ];
      hops.forEach(([a, b, s, o], i) =>
        later(1000 + i * 900, () => session.assertEdge(a, b, receipt(s, o), { eventId: id(`a${i}`) })));
      later(1000 + hops.length * 900 + 500, () =>
        session.observe([ent("condition", "melanoma"), ent("intervention", "vemurafenib")], 89, { eventId: id("m") }));
    },
  },
  {
    name: "Rapid fire",
    caption:
      "Twenty-four events in under four seconds — the ingestion window extends per event, " +
      "comets cascade down the arrival order, and the moment the stream stops, the canvas earns " +
      "its stillness back.",
    run() {
      resetSession();
      const kinds = ["condition", "intervention", "sponsor", "country"];
      for (let i = 0; i < 24; i++) {
        const a = ent(kinds[i % 4], `${kinds[i % 4]} ${(i % 8) + 1}`);
        const b = ent(kinds[(i + 1) % 4], `${kinds[(i + 1) % 4]} ${((i + 3) % 8) + 1}`);
        later(150 + i * 150, () => session.observe([a, b], ((i * 53) % 400) + 3, { eventId: id(`r${i}`) }));
      }
    },
  },
  {
    name: "Bounded memory",
    caption:
      "This session keeps at most 60 entities; the stream sends 90. Oldest-inserted leave first " +
      "— deterministic FIFO eviction, disclosed, never a silent leak. The panel is working " +
      "state, not the filing cabinet.",
    run() {
      resetSession({ maxNodes: 60, maxEdges: 140, maxSeen: 500 });
      for (let i = 0; i < 90; i++) {
        later(150 + i * 90, () =>
          session.observe([ent("entity", `wave ${Math.floor(i / 10) + 1}`), ent("item", `item ${i + 1}`)], (i % 40) + 1, { eventId: id(`w${i}`) }));
      }
    },
  },
  {
    name: "Drag playground",
    caption:
      "A settled field to push around. Dragging pauses the layout so physics never fights your " +
      "hand — and moving a node changes nothing the system believes. Positions are layout, " +
      "never meaning.",
    run() {
      resetSession();
      const kinds = ["condition", "intervention", "sponsor", "protein", "pathway"];
      for (let i = 0; i < 30; i++) {
        const a = ent(kinds[i % 5], `${kinds[i % 5]} ${(i % 6) + 1}`);
        const b = ent(kinds[(i + 2) % 5], `${kinds[(i + 2) % 5]} ${((i + 4) % 6) + 1}`);
        later(100 + i * 60, () => session.observe([a, b], ((i * 71) % 350) + 2, { eventId: id(`d${i}`) }));
      }
    },
  },
  {
    name: "Calm by contract",
    caption:
      "The anti-morpho scenario, on purpose: after one small ingestion the field goes COMPLETELY " +
      "still — zero lit overlay pixels, measured in this repo's tests. Animation means " +
      "“the system did this just now”, never “the system is thinking”. Under " +
      "prefers-reduced-motion, even the window's motion is skipped.",
    run() {
      resetSession();
      later(300, () => session.observe([ent("condition", "melanoma"), ent("intervention", "placebo")], 120, { eventId: id("p") }));
    },
  },
];

/* ------------------------------------------------------------------ */
let rerender = () => {};
function Demo() {
  const snapshot = useSyncExternalStore(
    (l) => session.subscribe(l),
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );
  const stats = document.querySelector("#stats");
  if (stats) stats.textContent = `${snapshot.nodes.length} entities · ${snapshot.edges.length} edges`;
  return React.createElement(NodeGraph, {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    visits: session.visitsById(),
    height: 620,
    dark: true,
  });
}

function App() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  rerender = force;
  return React.createElement(Demo);
}

const bar = document.querySelector("#scenarios");
const caption = document.querySelector("#caption");
const buttons = SCENARIOS.map((s, i) => {
  const b = document.createElement("button");
  b.textContent = s.name;
  b.addEventListener("click", () => {
    for (const other of buttons) other.classList.remove("active");
    b.classList.add("active");
    caption.textContent = s.caption;
    s.run();
  });
  bar.appendChild(b);
  return b;
});

createRoot(document.querySelector("#root")).render(React.createElement(App));
buttons[4].click(); // open on the dense constellation — the field, alive
