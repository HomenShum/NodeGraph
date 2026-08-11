"use client";

/**
 * Sigma.js renderer over the Graphology typed-edge model.
 *
 * THE NO-REMOUNT CONTRACT: one graph per mount (per theme). Prop growth is
 * PATCHED into the live graph (`patchGraph`); Sigma reflects Graphology
 * mutations without a rebuild, so new elements simply appear. Keying a remount
 * on every ingestion tears down the Sigma instance — five canvases and the
 * layout — and replays the whole lifecycle per update, which reads as flicker.
 * Mutations do not change the graph's object identity, so identity-keyed memos
 * would go stale; a `rev` counter is the invalidation the mutation cannot
 * provide.
 *
 * MOTION: the steady state is still. The cinematic overlay (birth flares,
 * comets on newborn edges, breath halos) runs ONLY inside the live window an
 * ingestion opens (`liveUntil`), and the rAF loop exits when it closes.
 * Animation means "the system did this just now" — it never encodes magnitude,
 * and `prefers-reduced-motion` skips it entirely.
 *
 * TRUST SURFACE: `visits` (revisits) is interaction frequency, not evidence
 * strength, and is rendered as labelled text only — never as size, colour or
 * opacity, which are where measured magnitudes live. Same rule inside the
 * model: only `evidence` weights get the edge width channel.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Sigma from "sigma";
// Ringed nodes — a light disc with a coloured border — read as ENTITIES;
// a filled disc reads as a scatter point. Official sigma program.
import { NodeBorderProgram } from "@sigma/node-border";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker.js";
import {
  buildGraph,
  patchGraph,
  EDGE_TYPE_ATTR,
  edgeTypeCounts,
  edgeTypesPresent,
  isEvidenceEdgeType,
  type AssertionReceipt,
  type GraphEdge,
  type GraphNode,
} from "./graph-model.js";

export type NodeClickMessage = {
  source: "nodegraph";
  kind: "node";
  id: string;
  label: string;
  nodeKind: string;
  /** Absent means no measurement; zero is a real measured value. */
  count?: number;
  edges: {
    other: string;
    weight: number;
    type: string;
    receipt?: AssertionReceipt;
  }[];
};

export type ContextMessage = {
  source: "nodegraph";
  intent: "context";
  kind: "node";
  label: string;
  nodeKind: string;
};

export type NodeGraphProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Interaction frequency per node id. Text only. Never a visual channel. */
  visits?: Record<string, number>;
  dark?: boolean;
  height?: number;
  /** Override the ring hue per node kind. */
  kindColors?: Record<string, { light: string; dark: string }>;
  onNode?: (m: NodeClickMessage) => void;
  onContext?: (m: ContextMessage) => void;
};

/**
 * Layout settle budget. FA2 is stopped rather than left running: an
 * indefinitely drifting graph is motion nobody asked for, and a graph that
 * never stops moving cannot be clicked accurately.
 */
const settleMs = (order: number) => Math.min(1000 + order * 2, 6000);
const syncIterations = (order: number) => (order > 1200 ? 120 : 300);
const labelThreshold = (order: number) => (order <= 150 ? 0 : 8);

export function NodeGraph({
  nodes,
  edges,
  visits,
  dark = false,
  height = 480,
  kindColors,
  onNode,
  onContext,
}: NodeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  // Read through a ref inside the Sigma handlers: re-subscribing the renderer
  // every time a parent re-renders would drop clicks mid-gesture.
  const layoutRef = useRef<FA2Layout | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The cinematic layer's working state. Births carry timestamps so each
  // flare decays on its own clock; liveUntil bounds the whole ambience — when
  // it passes, the rAF loop exits and the canvas is exactly the calm steady
  // state again. Refs, not state: the loop reads them per frame.
  const births = useRef<{ nodes: Map<string, number>; edges: Map<string, number> }>({
    nodes: new Map(),
    edges: new Map(),
  });
  const liveUntil = useRef(0);
  const cineCanvas = useRef<HTMLCanvasElement>(null);
  const handlers = useRef({ onNode, onContext });
  handlers.current = { onNode, onContext };

  // ONE graph per mount (per theme); growth is patched in below.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initial build only
  const graph = useMemo(
    () => buildGraph(nodes, edges, { dark, visits, kindColors }),
    [dark],
  );
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const patch = patchGraph(graph, nodes, edges, { dark, visits, kindColors });
    const added = patch.added;
    for (const id of patch.removedNodeIds) births.current.nodes.delete(id);
    for (const key of patch.removedEdgeKeys) births.current.edges.delete(key);
    if (added > 0) {
      const now = performance.now();
      for (const id of patch.addedNodeIds) births.current.nodes.set(id, now);
      for (const e of patch.addedEdges) births.current.edges.set(e.key, now);
      // The ambience window: streaming plus a tail. Extended per ingestion, so
      // a multi-part update reads as one live moment.
      liveUntil.current = now + 3200;
      // A short settle folds the newcomers in; positions of existing nodes
      // are already good, so this is a moment of worker time, not a re-layout
      // from the circle. Reduced motion: place-and-stop, no drift.
      layoutRef.current?.start();
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(
        () => layoutRef.current?.stop(),
        Math.min(600 + added * 40, 2000),
      );
    }
    if (patch.added > 0 || patch.removed > 0) setRev((r) => r + 1);
    sigmaRef.current?.setSetting("labelRenderedSizeThreshold", labelThreshold(graph.order));
    sigmaRef.current?.refresh();
  }, [graph, nodes, edges, dark, visits, kindColors]);
  const types = useMemo(() => edgeTypesPresent(graph), [graph, rev]);
  const counts = useMemo(() => edgeTypeCounts(graph), [graph, rev]);
  const [on, setOn] = useState<Set<string>>(() => new Set(types));
  const [selected, setSelected] = useState<NodeClickMessage | null>(null);

  // A rebuilt graph brings a different set of types; keep every one switched
  // on rather than carrying a stale filter across a payload change.
  useEffect(() => setOn(new Set(types)), [types]);

  /**
   * Which elements the current filter hides. Computed once per filter change
   * (O(V+E)) instead of inside the reducers, which Sigma calls per element per
   * frame. A node is hidden when the filter left it with no visible edge AND
   * it had edges to begin with — an isolated node was never joined to
   * anything, so hiding it would be an unrelated claim about the data.
   */
  const hidden = useMemo(() => {
    const hiddenEdges = new Set<string>();
    const degree = new Map<string, number>();
    const visibleDegree = new Map<string, number>();
    graph.forEachEdge((key, attr, s, t) => {
      degree.set(s, (degree.get(s) ?? 0) + 1);
      degree.set(t, (degree.get(t) ?? 0) + 1);
      if (on.has(attr[EDGE_TYPE_ATTR] as string)) {
        visibleDegree.set(s, (visibleDegree.get(s) ?? 0) + 1);
        visibleDegree.set(t, (visibleDegree.get(t) ?? 0) + 1);
      } else {
        hiddenEdges.add(key);
      }
    });
    const hiddenNodes = new Set<string>();
    graph.forEachNode((n) => {
      if ((degree.get(n) ?? 0) > 0 && (visibleDegree.get(n) ?? 0) === 0) {
        hiddenNodes.add(n);
      }
    });
    return { hiddenEdges, hiddenNodes };
  }, [graph, on, rev]);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Topology-only layout. `getEdgeWeight: null` on purpose: with the default
    // ("weight") a traversal count — telemetry — would pull the geometry
    // exactly as hard as a measured evidence weight, turning an interaction
    // frequency into a spatial claim.
    const settings = forceAtlas2.inferSettings(graph);
    if (reduced) {
      forceAtlas2.assign(graph, {
        iterations: syncIterations(graph.order),
        settings,
        getEdgeWeight: null,
      });
    }

    // Hover isolation: the hovered node's neighbourhood keeps its ink,
    // everything else drops to a whisper. A ref, not state — reducers run per
    // frame and a setState per hover would re-render React for every pixel
    // the cursor crosses.
    const hoverRef = { current: null as string | null };
    const DIM = dark ? "#2a2e33" : "#e2e5e7";

    const renderer = new Sigma(graph, el, {
      renderLabels: true,
      // At a few thousand nodes every label is noise and a per-frame cost.
      labelRenderedSizeThreshold: labelThreshold(graph.order),
      labelFont: "ui-sans-serif, system-ui, sans-serif",
      labelSize: 13,
      labelWeight: "600",
      labelColor: { color: dark ? "#e2e6e9" : "#15181a" },
      // The assertion badge: assertion edges carry their receipted release as
      // the edge label; other types carry no label, so nothing else changes.
      renderEdgeLabels: true,
      edgeLabelSize: 10,
      edgeLabelColor: { color: dark ? "#9aa4ad" : "#5a626a" },
      edgeLabelFont: "ui-sans-serif, system-ui, sans-serif",
      // Room between the graph's bounding box and the frame, so nodes and
      // labels never kiss the border.
      stagePadding: 44,
      defaultNodeColor: dark ? "#7f868c" : "#697077",
      // Ringed nodes: light disc, kind-coloured border. graph-model supplies
      // borderColor per kind and a card-toned fill, so the ring carries the
      // categorical channel.
      defaultNodeType: "border",
      nodeProgramClasses: { border: NodeBorderProgram },
      nodeReducer: (n, data) => {
        if (hiddenRef.current.hiddenNodes.has(n)) return { ...data, hidden: true };
        const h = hoverRef.current;
        if (h && n !== h && !graph.areNeighbors(n, h)) {
          // Dim, never hide: a node that vanishes on hover reads as data
          // disappearing.
          return { ...data, color: DIM, borderColor: DIM, label: "", zIndex: 0 };
        }
        return { ...data, zIndex: 1 };
      },
      edgeReducer: (e, data) => {
        if (hiddenRef.current.hiddenEdges.has(e)) return { ...data, hidden: true };
        const h = hoverRef.current;
        if (h && !graph.hasExtremity(e, h)) return { ...data, color: DIM, zIndex: 0 };
        return { ...data, zIndex: 1 };
      },
    });
    renderer.on("enterNode", ({ node }) => {
      hoverRef.current = node;
      renderer.refresh();
    });
    renderer.on("leaveNode", () => {
      hoverRef.current = null;
      renderer.refresh();
    });
    sigmaRef.current = renderer;

    const emitNode = (id: string) => {
      const a = graph.getNodeAttributes(id);
      const msg: NodeClickMessage = {
        source: "nodegraph",
        kind: "node",
        id,
        label: a.label as string,
        nodeKind: a.kind as string,
        ...(typeof a.count === "number" ? { count: a.count } : {}),
        edges: graph
          .edges(id)
          .filter((e) => !hiddenRef.current.hiddenEdges.has(e))
          .map((e) => ({
            other: graph.getNodeAttribute(graph.opposite(id, e), "label") as string,
            weight: graph.getEdgeAttribute(e, "weight") as number,
            type: graph.getEdgeAttribute(e, EDGE_TYPE_ATTR) as string,
            ...(graph.getEdgeAttribute(e, "receipt")
              ? { receipt: graph.getEdgeAttribute(e, "receipt") as AssertionReceipt }
              : {}),
          })),
      };
      setSelected(msg);
      handlers.current.onNode?.(msg);
    };

    renderer.on("clickNode", ({ node }) => emitNode(node));
    renderer.on("doubleClickNode", ({ node, event }) => {
      // Without this Sigma zooms the camera on every double click, which
      // would move the graph out from under the reader at the exact moment
      // they asked to keep an entity.
      event.preventSigmaDefault();
      const a = graph.getNodeAttributes(node);
      const msg: ContextMessage = {
        source: "nodegraph",
        intent: "context",
        kind: "node",
        label: a.label as string,
        nodeKind: a.kind as string,
      };
      handlers.current.onContext?.(msg);
    });
    renderer.on("clickStage", () => setSelected(null));

    // DRAG. A held node follows the pointer; the layout pauses so physics
    // does not fight the hand, and it stays paused after release — a reader
    // who placed a node has expressed an opinion the next settle should not
    // overrule. Camera disabled during the hold so the stage cannot pan out
    // from under the gesture. Positions are layout, never meaning: dragging
    // has no semantic effect.
    let dragged: string | null = null;
    renderer.on("downNode", (e) => {
      dragged = e.node;
      layoutRef.current?.stop();
      if (settleTimer.current) clearTimeout(settleTimer.current);
      renderer.getCamera().disable();
      graph.setNodeAttribute(dragged, "highlighted", true);
    });
    renderer.getMouseCaptor().on("mousemovebody", (e) => {
      if (!dragged) return;
      const pos = renderer.viewportToGraph(e);
      graph.setNodeAttribute(dragged, "x", pos.x);
      graph.setNodeAttribute(dragged, "y", pos.y);
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });
    const endDrag = () => {
      if (!dragged) return;
      graph.removeNodeAttribute(dragged, "highlighted");
      dragged = null;
      renderer.getCamera().enable();
    };
    renderer.getMouseCaptor().on("mouseup", endDrag);
    renderer.getMouseCaptor().on("mouseleave", endDrag);

    // The worker is the point: FA2 on the main thread freezes every click and
    // pan for the whole settle, which at a few thousand nodes is seconds.
    let layout: FA2Layout | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!reduced) {
      layout = new FA2Layout(graph, { settings, getEdgeWeight: null });
      layoutRef.current = layout;
      layout.start();
      timer = setTimeout(() => {
        layout?.stop();
        // Re-centre once the geometry is final. FA2 can carry the settled
        // graph away from where the seed circle sat, and a drag during the
        // settle leaves the camera wherever it was dropped.
        // duration 0: a cut, not a glide.
        renderer.getCamera().animatedReset({ duration: 0 });
      }, settleMs(graph.order));
    }

    // Sigma caches its container size; without this the canvas draws at the
    // old size and hit-tests against the new one, and clicks land on nothing.
    const ro = new ResizeObserver(() => renderer.refresh());
    ro.observe(el);

    return () => {
      if (timer) clearTimeout(timer);
      layoutRef.current = null;
      layout?.kill();
      ro.disconnect();
      renderer.kill();
      sigmaRef.current = null;
    };
  }, [graph, dark]);

  // THE CINEMATIC STREAMING LAYER.
  //
  // The grounds are checkable: (1) it runs ONLY inside the live window a real
  // ingestion opens (liveUntil), and the rAF loop exits when it closes — the
  // steady state is exactly the still canvas the trust rules require; (2)
  // every effect is keyed to a data event (a birth flare is THIS node
  // arriving; a comet is THIS edge arriving); (3) this canvas overlays the
  // WebGL stage only; (4) uniform treatment: flare radius follows the size
  // channel that already encodes count, comet brightness is constant, so the
  // ambience adds no new visual channel; (5) prefers-reduced-motion skips the
  // loop entirely.
  useEffect(() => {
    const cv = cineCanvas.current;
    const el = containerRef.current;
    const sig = sigmaRef.current;
    if (!cv || !el || !sig) return;
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      performance.now() > liveUntil.current
    ) {
      births.current.nodes.clear();
      births.current.edges.clear();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = el.clientWidth * dpr;
    cv.height = el.clientHeight * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const FLARE_MS = 1400;
    const COMET_MS = 2400;
    let raf = 0;

    const draw = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
      if (now > liveUntil.current) {
        births.current.nodes.clear();
        births.current.edges.clear();
        return; // window closed: leave the canvas clean and stop scheduling.
      }

      // Ambient breath on every node while live: a soft halo that follows the
      // ring colour and the EXISTING size channel. Phase-offset per index so
      // the field shimmers instead of pumping in unison.
      let i = 0;
      graph.forEachNode((id, a) => {
        const p = sig.graphToViewport({ x: a.x as number, y: a.y as number });
        const size = Number(a.size ?? 8);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(size) || size <= 0) {
          i += 1;
          return;
        }
        const breath = 0.1 + 0.06 * Math.sin(now / 420 + i * 1.7);
        const born = births.current.nodes.get(id);
        const flare = born ? Math.max(0, 1 - (now - born) / FLARE_MS) : 0;
        const alpha = Math.min(0.5, breath + 0.4 * flare);
        const r = size * (1.6 + 1.6 * flare);
        const g = ctx.createRadialGradient(p.x, p.y, size * 0.4, p.x, p.y, r);
        const c = (a.borderColor as string) ?? "#888";
        g.addColorStop(0, c + "00");
        g.addColorStop(0.55, c + Math.round(alpha * 255).toString(16).padStart(2, "0"));
        g.addColorStop(1, c + "00");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        i += 1;
      });

      // Comets on newborn edges: a bright head with a fading tail travelling
      // source -> target, twice, then gone. Constant brightness — the edge's
      // width already carries its weight, and the comet must not.
      for (const [key, born] of births.current.edges) {
        const age = now - born;
        if (age > COMET_MS || !graph.hasEdge(key)) continue;
        const [s, tgt] = graph.extremities(key);
        const a1 = graph.getNodeAttributes(s);
        const a2 = graph.getNodeAttributes(tgt);
        const p1 = sig.graphToViewport({ x: a1.x as number, y: a1.y as number });
        const p2 = sig.graphToViewport({ x: a2.x as number, y: a2.y as number });
        if (
          !Number.isFinite(p1.x) ||
          !Number.isFinite(p1.y) ||
          !Number.isFinite(p2.x) ||
          !Number.isFinite(p2.y)
        ) continue;
        const t01 = (age % (COMET_MS / 2)) / (COMET_MS / 2);
        const ease = t01 * t01 * (3 - 2 * t01);
        const hx = p1.x + (p2.x - p1.x) * ease;
        const hy = p1.y + (p2.y - p1.y) * ease;
        if (!Number.isFinite(hx) || !Number.isFinite(hy)) continue;
        const fade = 1 - age / COMET_MS;
        ctx.save();
        ctx.globalAlpha = 0.85 * fade;
        ctx.shadowBlur = 12;
        ctx.shadowColor = dark ? "#8ad8ff" : "#1f7ac2";
        ctx.fillStyle = dark ? "#cdeeff" : "#2a8fe0";
        ctx.beginPath();
        ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
        ctx.fill();
        // tail
        const tx = p1.x + (p2.x - p1.x) * Math.max(0, ease - 0.22);
        const ty = p1.y + (p2.y - p1.y) * Math.max(0, ease - 0.22);
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
          ctx.restore();
          continue;
        }
        const tg = ctx.createLinearGradient(tx, ty, hx, hy);
        tg.addColorStop(0, "rgba(140,200,255,0)");
        tg.addColorStop(1, dark ? "rgba(205,238,255,0.7)" : "rgba(42,143,224,0.55)");
        ctx.strokeStyle = tg;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rev reopens the
    // loop per ingestion; graph identity and theme cover the rest.
  }, [graph, dark, rev]);

  // Filters are a reducer refresh, not a rebuild: the graph, the layout and
  // the camera all survive switching a type off and on again.
  useEffect(() => {
    sigmaRef.current?.refresh();
  }, [hidden]);

  const visibleEdges = graph.size - hidden.hiddenEdges.size;

  // Theme tokens. Inline, so the component carries no CSS dependency.
  const ink = dark ? "#e2e6e9" : "#15181a";
  const muted = dark ? "#9aa4ad" : "#5a626a";
  const border = dark ? "#2a2e33" : "#e2e5e7";
  const card = dark ? "#141619" : "#ffffff";

  return (
    <section
      data-testid="nodegraph"
      style={{
        border: `1px solid ${border}`,
        borderRadius: 8,
        background: card,
        color: ink,
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          marginBottom: 8,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          columnGap: 12,
          rowGap: 4,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Relationship graph</h3>
        <p style={{ margin: 0, fontSize: 12, color: muted }}>
          {graph.order.toLocaleString()} entities · {visibleEdges.toLocaleString()} of{" "}
          {graph.size.toLocaleString()} relationships shown
        </p>
      </header>

      <div
        data-testid="edge-type-filters"
        style={{
          marginBottom: 8,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Recovery affordance: a dragged camera has no other way home, and a
            view that can be scrolled off-frame with no way back reads as
            broken rather than as mispointed. */}
        <button
          type="button"
          data-testid="nodegraph-fit"
          onClick={() => sigmaRef.current?.getCamera().animatedReset({ duration: 0 })}
          style={{
            border: `1px solid ${border}`,
            borderRadius: 6,
            background: "transparent",
            color: muted,
            padding: "2px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          fit
        </button>
        {types.map((t) => (
          <label
            key={t}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
          >
            <input
              type="checkbox"
              data-filter-type={t}
              checked={on.has(t)}
              onChange={(e) =>
                setOn((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(t);
                  else next.delete(t);
                  return next;
                })
              }
            />
            <span>{t}</span>
            <span style={{ color: muted }}>({counts[t]})</span>
            {/* The reader is told which weights are evidence and which are
                not, in words, next to the control that shows them. */}
            {!isEvidenceEdgeType(t) && (
              <span
                style={{ color: muted }}
                title={
                  t === "assertion"
                    ? "curated claim, not a measurement"
                    : "interaction frequency, not evidence strength"
                }
              >
                · {t === "assertion" ? "curated" : "local"}
              </span>
            )}
          </label>
        ))}
      </div>

      {/* Wrapper, because Sigma clears its container's children on init — an
          overlay INSIDE the sigma div is silently wiped before the painter
          ever finds it. Siblings survive. */}
      <div
        style={{
          position: "relative",
          borderRadius: 6,
          border: `1px solid ${border}`,
          height: Math.min(height, 260 + nodes.length * 22),
          width: "100%",
          // A faint static dot grid: honest decoration — a static pattern
          // encodes nothing, so no rule about channels or motion is spent on
          // it.
          backgroundImage: `radial-gradient(${
            dark ? "rgba(226,230,233,0.07)" : "rgba(21,24,26,0.06)"
          } 1px, transparent 1px)`,
          backgroundSize: "22px 22px",
        }}
      >
        <div
          ref={containerRef}
          data-testid="nodegraph-canvas"
          style={{ position: "absolute", inset: 0 }}
        />
        {/* The cinematic streaming layer. Canvas2D over WebGL, as a SIBLING of
            the sigma container. Pointer-events none, so every click still
            lands on Sigma; painted ONLY while the live window is open, so the
            steady state costs zero frames. */}
        <canvas
          ref={cineCanvas}
          data-testid="cinematic-layer"
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
            zIndex: 10,
            height: "100%",
            width: "100%",
          }}
        />
      </div>

      {selected && (
        <dl
          data-testid="nodegraph-selection"
          style={{
            marginTop: 8,
            marginBottom: 0,
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 12,
            rowGap: 2,
            fontSize: 12,
          }}
        >
          <dt style={{ color: muted }}>entity</dt>
          <dd style={{ margin: 0 }}>
            {selected.label} <span style={{ color: muted }}>· {selected.nodeKind}</span>
          </dd>
          <dt style={{ color: muted }}>count</dt>
          <dd data-testid="count-readout" style={{ margin: 0 }}>
            {selected.count === undefined ? "unknown — not measured" : selected.count.toLocaleString()}
          </dd>
          <dt style={{ color: muted }}>visits</dt>
          <dd data-testid="visits-readout" style={{ margin: 0 }}>
            {(graph.getNodeAttribute(selected.id, "visits") as number) ?? 0}{" "}
            <span style={{ color: muted }}>
              — interaction frequency, not evidence strength
            </span>
          </dd>
          {selected.edges.some((e) => e.receipt) && (
            <>
              <dt style={{ color: muted }}>assertions</dt>
              <dd style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {selected.edges
                  .filter((e) => e.receipt)
                  .map((e, i) => (
                    <span
                      key={i}
                      style={{
                        border: `1px solid ${border}`,
                        borderRadius: 999,
                        padding: "1px 8px",
                        fontSize: 11,
                        color: muted,
                      }}
                      title={`${e.receipt?.subjectId} → ${e.receipt?.objectId}`}
                    >
                      {e.other} · {e.receipt?.source} {e.receipt?.release} ·{" "}
                      <a
                        href={e.receipt?.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "inherit" }}
                      >
                        receipt
                      </a>
                    </span>
                  ))}
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

export default NodeGraph;
