export type ActorKind = "user" | "agent";
export type AgentScope = "public" | "private";

export interface Actor {
  kind: ActorKind;
  id: string;
  name: string;
  scope?: AgentScope;
  ownerId?: string;
}

export interface Member {
  id: string;
  roomId: string;
  name: string;
  role: "host" | "member";
  anon: boolean;
  color: string;
  lastSeenAt: number;
}

export type ArtifactKind = "sheet" | "note" | "wall";
export type ArtifactVisibility = "private" | "room" | "public";
export type DataframeColumnMode = "manual" | "enrich" | "resolve" | "classify" | "compute";
export type CellStatus = "empty" | "running" | "complete" | "needs_review" | "failed" | "gap";

export interface CellEvidence {
  id: string;
  kind: "upload" | "source" | "computed" | "manual";
  label: string;
  source?: string;
  sourceStorageId?: string;
  sourceArtifactId?: string;
  providerFileId?: string;
  sheetName?: string;
  row?: number;
  column?: string;
  page?: number;
  bbox?: { x: number; y: number; width: number; height: number; unit?: "px" | "pt" | "normalized" };
  url?: string;
  snippet?: string;
  confidence?: number;
}

export interface CellPayload {
  value: unknown;
  status?: CellStatus;
  evidence?: CellEvidence[];
  confidence?: number;
  formula?: string;
  error?: string;
  normalizedValue?: unknown;
  attempts?: number;
  updatedByRunId?: string;
  review?: unknown;
}

export interface DataframeColumn {
  id: string;
  label: string;
  order: number;
  mode?: DataframeColumnMode;
  description?: string;
  type?: "text" | "number" | "date" | "currency" | "boolean" | "json";
  agentWritable?: boolean;
}

export interface DataframeMeta {
  columns: DataframeColumn[];
  rowCount: number;
  sourceFile?: string;
  sheetName?: string;
  sheetNames?: string[];
  parser?: string;
  truncated?: boolean;
  warnings?: string[];
}

export interface ArtifactMeta {
  dataframe?: DataframeMeta;
  summary?: string;
  tags?: string[];
  upload?: {
    fileName: string;
    mimeType: string;
    size: number;
    parsedAt: number;
    sourceStorageId?: string;
    uploadedFileId?: string;
    sha256?: string;
  };
  providerParse?: unknown;
}

export interface Element {
  id: string;
  version: number;
  value: unknown;
  updatedAt: number;
  updatedBy: Actor;
}

export interface Artifact {
  id: string;
  roomId: string;
  kind: ArtifactKind;
  title: string;
  version: number;
  elements: Record<string, Element>;
  order: string[];
  updatedAt: number;
  createdBy?: Actor;
  visibility?: ArtifactVisibility;
  meta?: ArtifactMeta;
}

export type OpKind = "set" | "create" | "delete";

export interface ChangeOp {
  opId: string;
  artifactId: string;
  elementId: string;
  kind: OpKind;
  value?: unknown;
  baseVersion: number;
}

export type ProposalStatus = "pending" | "approved" | "rejected";

export interface Proposal {
  id: string;
  roomId: string;
  artifactId: string;
  op: ChangeOp;
  author: Actor;
  status: ProposalStatus;
  createdAt: number;
  resolvedAt?: number;
  review?: {
    kind: "agent_edit" | "semantic_rebase";
    conflictId?: string;
    reviewerNote?: string;
    reason?: string;
    status?: "verified" | "needs_review" | "manual_claim" | "draft" | "rejected";
  };
}

export type TraceType =
  | "room_created" | "member_joined" | "auto_allow_toggled"
  | "lock_acquired" | "lock_released" | "lock_denied"
  | "edit_applied" | "edit_blocked" | "edit_proposed" | "proposal_resolved" | "proposal_resolve_failed"
  | "draft_created" | "draft_merged" | "draft_conflict" | "semantic_conflict"
  | "agent_session_started" | "agent_status" | "message"
  | "notebook_read_model" | "agent_work_plan_proposed" | "agent_work_plan_approved"
  | "schema_changed";

export interface TraceEvent {
  id: string;
  roomId: string;
  ts: number;
  actor: Actor;
  type: TraceType;
  summary: string;
  refs?: Record<string, string>;
  detail?: string;
}

export type AgentStatus = "idle" | "working" | "blocked" | "drafting" | "done";

export interface AgentSession {
  id: string;
  roomId: string;
  agentId: string;
  agentName: string;
  scope: AgentScope;
  ownerId?: string;
  status: AgentStatus;
  heldLockId?: string;
  lastAction: string;
  updatedAt: number;
}
