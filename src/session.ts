/**
 * A session store that accumulates a typed-edge graph as an agent (or user)
 * works, with `useSyncExternalStore` semantics: `subscribe` + `getSnapshot`
 * are stable bound methods, and the snapshot is cached until the next mutation.
 *
 * The honesty line between the two ingestion rules is PARTICIPANT COUNT:
 *
 *   - EXACTLY TWO participants observed together with a measured count
 *     -> an `evidence` edge carrying that count. The count IS the pair's
 *     conjunction, measured, so it may use the width channel.
 *   - THREE OR MORE participants -> `traversal` edges only. A measured count
 *     belongs to the whole conjunction, and drawing it on any single pair
 *     would claim a pair count nothing measured.
 *
 * Nodes are keyed on (kind, label), so the same entity arriving from different
 * sources (a filter, a subgraph payload) lands on ONE node rather than two.
 * Node `count` is the last measured value; `visits` is interaction frequency
 * and is rendered as text only, never as a visual channel.
 */

import {
  DEFAULT_EDGE_TYPE,
  type GraphEdge,
  type GraphNode,
} from "./graph-model";

export type EntityRef = {
  /** Entity kind — any string ("person", "condition", "repo", ...). */
  kind: string;
  label: string;
  /** A measured magnitude for this entity alone, if one was observed. */
  count?: number;
};

export type SessionNode = GraphNode & { visits: number };

export type SessionSnapshot = {
  nodes: SessionNode[];
  edges: GraphEdge[];
  turns: number;
};

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return String(h);
};

export class GraphSession {
  private nodes = new Map<string, SessionNode>();
  private edges = new Map<string, GraphEdge>();
  private turns = 0;
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot | null = null;
  /** Idempotence: strict-mode double renders and re-mounts of old messages
   *  must not double-count, so every ingest is keyed by a content hash. */
  private seen = new Set<string>();

  private emit() {
    this.snapshot = null;
    this.listeners.forEach((l) => l());
  }

  private nodeId(kind: string, label: string) {
    return `${kind}::${label}`;
  }

  private upsertNode(kind: string, label: string, count?: number): string {
    const id = this.nodeId(kind, label);
    const existing = this.nodes.get(id);
    if (existing) {
      existing.visits += 1;
      // A measured count supersedes an older one; an observation with no
      // count for this entity leaves the last measured value alone.
      if (count !== undefined) existing.count = count;
    } else {
      this.nodes.set(id, { id, label, type: kind, count: count ?? 0, visits: 1 });
    }
    return id;
  }

  private edgeMapKey(a: string, b: string, type: string) {
    return a < b ? `${a}|${b}|${type}` : `${b}|${a}|${type}`;
  }

  private upsertEdge(
    a: string,
    b: string,
    type: string,
    weight?: number,
    releaseTag?: string,
  ) {
    const key = this.edgeMapKey(a, b, type);
    const existing = this.edges.get(key);
    if (existing) {
      // Traversal accumulates co-visits; measured/curated weights are the
      // latest value, never a sum this store invented.
      if (type === "traversal") existing.weight += 1;
      else if (weight !== undefined) existing.weight = weight;
      if (releaseTag !== undefined) existing.releaseTag = releaseTag;
    } else {
      this.edges.set(key, {
        source: a,
        target: b,
        weight: type === "traversal" ? 1 : (weight ?? 0),
        type,
        ...(releaseTag !== undefined ? { releaseTag } : {}),
      });
    }
  }

  /**
   * The participant-count rule. One entity with a measured count sets that
   * node's magnitude; two entities with a measured conjunction get an
   * `evidence` edge carrying it; three or more (or a pair with nothing
   * measured) get pairwise `traversal` edges — "these were worked on
   * together", telemetry, not evidence.
   */
  observe(entities: readonly EntityRef[], measuredCount?: number): void {
    if (entities.length === 0) return;
    const key = hash(JSON.stringify([entities, measuredCount ?? null]));
    if (this.seen.has(key)) return;
    this.seen.add(key);

    const ids = entities.map((e) =>
      this.upsertNode(e.kind, e.label, e.count ?? (entities.length === 1 ? measuredCount : undefined)),
    );
    if (ids.length === 2 && measuredCount !== undefined && measuredCount > 0) {
      this.upsertEdge(ids[0], ids[1], "evidence", measuredCount);
    } else {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          this.upsertEdge(ids[i], ids[j], "traversal");
    }
    this.turns += 1;
    this.emit();
  }

  /** A curated claim between two entities, optionally tagged with the release
   *  that introduced it. Rendered as a badge, never as width. */
  assertEdge(
    a: EntityRef,
    b: EntityRef,
    opts: { weight?: number; releaseTag?: string } = {},
  ): void {
    const ia = this.upsertNode(a.kind, a.label, a.count);
    const ib = this.upsertNode(b.kind, b.label, b.count);
    this.upsertEdge(ia, ib, "assertion", opts.weight ?? 1, opts.releaseTag);
    this.emit();
  }

  /**
   * Ingest a whole subgraph payload: `{entities, relationships}`. Relationship
   * endpoints reference entity `id`s from the same payload; internally the
   * store re-keys on (kind, label) so the same entity arriving from different
   * sources is ONE node. Relationships to entities the payload did not
   * describe are dropped rather than invented.
   *
   * Does not increment `turns`: when every turn also calls `observe`, counting
   * here too would make one answer read as two.
   */
  ingest(data: {
    entities: readonly GraphNode[];
    relationships: readonly GraphEdge[];
  }): void {
    const key = hash(
      JSON.stringify([data.entities.map((n) => n.id), data.relationships.length]),
    );
    if (this.seen.has(key)) return;
    this.seen.add(key);

    const idMap = new Map<string, string>();
    for (const n of data.entities) {
      idMap.set(n.id, this.upsertNode(n.type, n.label, n.count));
    }
    for (const e of data.relationships) {
      const a = idMap.get(e.source);
      const b = idMap.get(e.target);
      if (a && b) this.upsertEdge(a, b, e.type ?? DEFAULT_EDGE_TYPE, e.weight, e.releaseTag);
    }
    this.emit();
  }

  getSnapshot = (): SessionSnapshot => {
    if (!this.snapshot)
      this.snapshot = {
        nodes: [...this.nodes.values()],
        edges: [...this.edges.values()],
        turns: this.turns,
      };
    return this.snapshot;
  };

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  /** Interaction frequency per node id, for the renderer's `visits` prop. */
  visitsById(): Record<string, number> {
    return Object.fromEntries([...this.nodes.values()].map((n) => [n.id, n.visits]));
  }
}
