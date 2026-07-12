import {
  diffNodeGraphDocuments,
  exportNodeGraphDocument,
  nodeGraphDocumentJson,
  parseNodeGraphDocument,
  type NodeGraphDelta,
  type NodeGraphDocument,
  type NodeGraphLayoutState,
  type NodeGraphProvenance,
} from "./graphContract";
import type { SemanticGraphViewModel } from "./semanticGraphTypes";

export type NodeGraphSyncReceipt = {
  adapter: "memory";
  graphId: string;
  previousRevision?: string;
  revision: string;
  appliedAt: number;
  provenance: NodeGraphProvenance;
  delta: NodeGraphDelta;
};

export class InMemoryNodeGraphAdapter {
  private readonly documents = new Map<string, NodeGraphDocument>();

  constructor(initialDocuments: Array<NodeGraphDocument | string> = []) {
    for (const document of initialDocuments) this.importDocument(document);
  }

  listGraphIds(): string[] {
    return [...this.documents.keys()].sort();
  }

  read(graphId: string): NodeGraphDocument | undefined {
    const document = this.documents.get(graphId);
    return document ? parseNodeGraphDocument(nodeGraphDocumentJson(document)) : undefined;
  }

  importDocument(input: NodeGraphDocument | string): NodeGraphSyncReceipt {
    const next = parseNodeGraphDocument(input);
    return this.apply(next);
  }

  sync(graph: SemanticGraphViewModel, options: {
    graphId: string;
    provenance: Omit<NodeGraphProvenance, "generatedAt"> & { generatedAt?: number };
    layout?: NodeGraphLayoutState;
    generatedAt?: number;
  }): NodeGraphSyncReceipt {
    return this.apply(exportNodeGraphDocument(graph, options));
  }

  exportJson(graphId: string): string {
    const document = this.documents.get(graphId);
    if (!document) throw new Error("nodegraph_not_found");
    return nodeGraphDocumentJson(document);
  }

  private apply(next: NodeGraphDocument): NodeGraphSyncReceipt {
    const previous = this.documents.get(next.graphId);
    const delta = diffNodeGraphDocuments(previous, next);
    this.documents.set(next.graphId, parseNodeGraphDocument(next));
    return {
      adapter: "memory",
      graphId: next.graphId,
      previousRevision: previous?.revision,
      revision: next.revision,
      appliedAt: next.generatedAt,
      provenance: next.provenance,
      delta,
    };
  }
}
