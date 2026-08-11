export {
  buildGraph,
  patchGraph,
  edgeKey,
  edgeTypesPresent,
  edgeTypeCounts,
  isEvidenceEdgeType,
  EDGE_TYPES,
  DEFAULT_EDGE_TYPE,
  EDGE_TYPE_ATTR,
  EVIDENCE_EDGE_TYPES,
  type EdgeTypeName,
  type EdgeKey,
  type GraphNode,
  type GraphEdge,
  type BuildOptions,
  type PatchResult,
} from "./graph-model";

export {
  GraphSession,
  type EntityRef,
  type SessionNode,
  type SessionSnapshot,
} from "./session";

export {
  NodeGraph,
  type NodeGraphProps,
  type NodeClickMessage,
  type ContextMessage,
} from "./NodeGraph";

export { default } from "./NodeGraph";
