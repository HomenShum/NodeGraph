/**
 * Bounded session memory for a live relationship graph.
 *
 * Human rule first: an analyst who leaves this panel open all day must not
 * slowly exhaust the browser, and replaying the same tool event must not make
 * a relationship look stronger. Nodes, edges and deduplication receipts are
 * therefore bounded, FIFO-evicted and deterministic.
 */

import {
  requireAssertionReceipt,
  requireEdgeType,
  type AssertionReceipt,
  type EdgeTypeName,
  type GraphEdge,
  type GraphNode,
} from "./graph-model.js";

export type EntityRef = {
  /** Entity kind — any string ("person", "condition", "repo", ...). */
  kind: string;
  label: string;
  /** A measured magnitude for this entity alone. Absent means unknown. */
  count?: number;
};

export type SessionNode = GraphNode & { visits: number };

export type SessionSnapshot = {
  nodes: SessionNode[];
  edges: GraphEdge[];
  turns: number;
};

export type SessionLimits = {
  maxNodes: number;
  maxEdges: number;
  maxSeen: number;
};

export type SessionStats = SessionLimits & {
  nodes: number;
  edges: number;
  seen: number;
};

export type EventOptions = { eventId?: string };

const DEFAULT_LIMITS: SessionLimits = {
  maxNodes: 1_000,
  maxEdges: 3_000,
  maxSeen: 5_000,
};

const requirePositiveInteger = (value: number, field: string) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
};

const requireNonNegativeInteger = (value: number, field: string) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
};

const requireText = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
};

const requireCount = (value: number | undefined, field: string) => {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new TypeError(`${field} must be a finite non-negative number or absent`);
  }
};

/** Stable JSON: object keys sort; arrays preserve their caller-defined order. */
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
};

const normalizedEntities = (entities: readonly EntityRef[]) =>
  entities
    .map((entity) => ({
      kind: entity.kind,
      label: entity.label,
      ...(entity.count === undefined ? {} : { count: entity.count }),
    }))
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));

const normalizedSubgraph = (data: {
  entities: readonly GraphNode[];
  relationships: readonly GraphEdge[];
}) => ({
  entities: [...data.entities].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
  relationships: [...data.relationships].sort((a, b) =>
    canonicalJson(a).localeCompare(canonicalJson(b)),
  ),
});

export class GraphSession {
  private nodes = new Map<string, SessionNode>();
  private edges = new Map<string, GraphEdge>();
  private turns = 0;
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot | null = null;
  /** key -> full canonical payload. A reused explicit id with new content is
   * a conflict, not a duplicate to silently ignore. */
  private seen = new Map<string, string>();
  private readonly limits: SessionLimits;

  constructor(limits: Partial<SessionLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    requirePositiveInteger(this.limits.maxNodes, "maxNodes");
    requireNonNegativeInteger(this.limits.maxEdges, "maxEdges");
    requirePositiveInteger(this.limits.maxSeen, "maxSeen");
  }

  private emit() {
    this.snapshot = null;
    this.listeners.forEach((listener) => listener());
  }

  private remember(namespace: string, payload: unknown, eventId?: string): boolean {
    if (eventId !== undefined) requireText(eventId, "eventId");
    const fingerprint = canonicalJson({ namespace, payload });
    const key = eventId === undefined ? `content:${fingerprint}` : `id:${eventId}`;
    const previous = this.seen.get(key);
    if (previous !== undefined) {
      if (previous !== fingerprint) {
        throw new Error(`eventId ${JSON.stringify(eventId)} was reused with different content`);
      }
      return false;
    }
    this.seen.set(key, fingerprint);
    while (this.seen.size > this.limits.maxSeen) {
      const oldest = this.seen.keys().next().value as string;
      this.seen.delete(oldest);
    }
    return true;
  }

  private nodeId(kind: string, label: string) {
    return JSON.stringify([kind, label]);
  }

  private evictOldestNode() {
    const id = this.nodes.keys().next().value as string | undefined;
    if (id === undefined) return;
    this.nodes.delete(id);
    for (const [key, edge] of this.edges) {
      if (edge.source === id || edge.target === id) this.edges.delete(key);
    }
  }

  private trimNodes() {
    while (this.nodes.size > this.limits.maxNodes) this.evictOldestNode();
  }

  private trimEdges() {
    while (this.edges.size > this.limits.maxEdges) {
      const oldest = this.edges.keys().next().value as string;
      this.edges.delete(oldest);
    }
  }

  private upsertNode(kind: string, label: string, count?: number): string {
    requireText(kind, "entity.kind");
    requireText(label, "entity.label");
    requireCount(count, "entity.count");
    const id = this.nodeId(kind, label);
    const existing = this.nodes.get(id);
    if (existing) {
      existing.visits += 1;
      // A measured zero is data and supersedes unknown; an observation with
      // no measurement leaves the last measurement alone.
      if (count !== undefined) existing.count = count;
    } else {
      this.nodes.set(id, {
        id,
        label,
        type: kind,
        ...(count === undefined ? {} : { count }),
        visits: 1,
      });
      this.trimNodes();
    }
    return id;
  }

  private edgeMapKey(a: string, b: string, type: EdgeTypeName) {
    return JSON.stringify(a < b ? [a, b, type] : [b, a, type]);
  }

  private upsertEdge(
    a: string,
    b: string,
    type: EdgeTypeName,
    weight?: number,
    receipt?: AssertionReceipt,
  ) {
    if (!this.nodes.has(a) || !this.nodes.has(b) || a === b) return;
    requireCount(weight, "edge.weight");
    const key = this.edgeMapKey(a, b, type);
    const existing = this.edges.get(key);
    if (existing) {
      if (type === "traversal") existing.weight += 1;
      else if (weight !== undefined) existing.weight = weight;
      if (type === "assertion") {
        const safeReceipt = requireAssertionReceipt(receipt);
        if (existing.type !== "assertion") throw new Error("edge type/key mismatch");
        existing.receipt = safeReceipt;
      }
      return;
    }

    if (type === "assertion") {
      this.edges.set(key, {
        source: a,
        target: b,
        weight: weight ?? 1,
        type,
        receipt: requireAssertionReceipt(receipt),
      });
    } else {
      this.edges.set(key, {
        source: a,
        target: b,
        weight: type === "traversal" ? 1 : (weight ?? 0),
        type,
      });
    }
    this.trimEdges();
  }

  /**
   * Exactly two participants plus a measured conjunction produce evidence.
   * Three or more participants, or a pair with no measurement, produce only
   * traversal telemetry. A measured zero still produces evidence weight 0.
   */
  observe(
    entities: readonly EntityRef[],
    measuredCount?: number,
    options: EventOptions = {},
  ): void {
    if (entities.length === 0) return;
    requireCount(measuredCount, "measuredCount");
    for (const entity of entities) {
      requireText(entity.kind, "entity.kind");
      requireText(entity.label, "entity.label");
      requireCount(entity.count, "entity.count");
    }
    const payload = {
      entities: normalizedEntities(entities),
      ...(measuredCount === undefined ? {} : { measuredCount }),
    };
    if (!this.remember("observe", payload, options.eventId)) return;

    const ids = entities.map((entity) =>
      this.upsertNode(
        entity.kind,
        entity.label,
        entity.count ?? (entities.length === 1 ? measuredCount : undefined),
      ),
    );
    if (ids.length === 2 && measuredCount !== undefined) {
      this.upsertEdge(ids[0], ids[1], "evidence", measuredCount);
    } else {
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          this.upsertEdge(ids[i], ids[j], "traversal");
        }
      }
    }
    this.turns += 1;
    this.emit();
  }

  /** A curated assertion is accepted only with the complete replay receipt. */
  assertEdge(
    a: EntityRef,
    b: EntityRef,
    receipt: AssertionReceipt,
    options: EventOptions & { weight?: number } = {},
  ): void {
    requireText(a.kind, "subject.kind");
    requireText(a.label, "subject.label");
    requireText(b.kind, "object.kind");
    requireText(b.label, "object.label");
    requireCount(a.count, "subject.count");
    requireCount(b.count, "object.count");
    requireCount(options.weight, "assertion.weight");
    const safeReceipt = requireAssertionReceipt(receipt);
    const payload = { a, b, receipt: safeReceipt, weight: options.weight ?? 1 };
    if (!this.remember("assert", payload, options.eventId)) return;

    const subject = this.upsertNode(a.kind, a.label, a.count);
    const object = this.upsertNode(b.kind, b.label, b.count);
    this.upsertEdge(subject, object, "assertion", options.weight ?? 1, safeReceipt);
    this.emit();
  }

  /**
   * Ingest a subgraph atomically with respect to trust validation. Unknown edge
   * types and incomplete assertion receipts reject the complete batch before
   * any node or edge is stored.
   */
  ingest(
    data: {
      entities: readonly GraphNode[];
      relationships: readonly GraphEdge[];
    },
    options: EventOptions = {},
  ): void {
    for (const node of data.entities) {
      requireText(node.id, "node.id");
      requireText(node.type, "node.type");
      requireText(node.label, "node.label");
      requireCount(node.count, "node.count");
    }
    for (const edge of data.relationships) {
      const type = requireEdgeType((edge as { type?: unknown }).type);
      requireText(edge.source, "edge.source");
      requireText(edge.target, "edge.target");
      requireCount(edge.weight, "edge.weight");
      if (type === "assertion") {
        requireAssertionReceipt((edge as { receipt?: unknown }).receipt);
      }
    }
    const payload = normalizedSubgraph(data);
    if (!this.remember("ingest", payload, options.eventId)) return;

    const idMap = new Map<string, string>();
    for (const node of data.entities) {
      idMap.set(node.id, this.upsertNode(node.type, node.label, node.count));
    }
    for (const edge of data.relationships) {
      const source = idMap.get(edge.source);
      const target = idMap.get(edge.target);
      const type = requireEdgeType(edge.type);
      if (source && target) {
        this.upsertEdge(
          source,
          target,
          type,
          edge.weight,
          edge.type === "assertion" ? edge.receipt : undefined,
        );
      }
    }
    this.emit();
  }

  getSnapshot = (): SessionSnapshot => {
    if (!this.snapshot) {
      this.snapshot = {
        nodes: [...this.nodes.values()],
        edges: [...this.edges.values()],
        turns: this.turns,
      };
    }
    return this.snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  visitsById(): Record<string, number> {
    return Object.fromEntries([...this.nodes.values()].map((node) => [node.id, node.visits]));
  }

  stats(): SessionStats {
    return {
      ...this.limits,
      nodes: this.nodes.size,
      edges: this.edges.size,
      seen: this.seen.size,
    };
  }
}
