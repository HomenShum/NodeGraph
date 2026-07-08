import type { Actor, Artifact, DataframeColumn, Element, Proposal, TraceEvent } from "../../../src/types";

export const maya: Actor = { kind: "user", id: "u-maya", name: "Maya" };
export const priya: Actor = { kind: "user", id: "u-priya", name: "Priya" };
export const agent: Actor = { kind: "agent", id: "room-nodeagent", name: "Room NodeAgent", scope: "public" };

const columns: DataframeColumn[] = [
  { id: "company", label: "Company", order: 0 },
  { id: "owner", label: "Owner", order: 1 },
  { id: "website", label: "Website", order: 2 },
  { id: "funding", label: "Funding", order: 3 },
  { id: "product", label: "Product / project", order: 4 },
  { id: "risk", label: "Open question", order: 5 },
];

const cell = (id: string, value: unknown, updatedBy: Actor): Element => ({
  id,
  value,
  updatedBy,
  version: 1,
  updatedAt: 1,
});

export const companyResearch: Artifact = {
  id: "company-research",
  roomId: "showcase-room",
  kind: "sheet",
  title: "Company research",
  version: 4,
  createdBy: maya,
  updatedAt: 4,
  order: [
    "r1__company", "r1__owner", "r1__website", "r1__funding", "r1__product", "r1__risk",
    "r2__company", "r2__owner", "r2__website", "r2__funding", "r2__product", "r2__risk",
    "r3__company", "r3__owner", "r3__website", "r3__funding", "r3__product", "r3__risk",
  ],
  elements: {
    "r1__company": cell("r1__company", "CardioNova", maya),
    "r1__owner": cell("r1__owner", "Maya", maya),
    "r1__website": cell("r1__website", "https://cardionova.com", agent),
    "r1__funding": cell("r1__funding", {
      value: "$14M Series A led by Meridian Health Ventures",
      status: "complete",
      evidence: [
        { id: "ev-series-a", kind: "source", label: "Series A filing", url: "https://pitchbook.com/cardionova", snippet: "CardioNova raised $14M." },
        { id: "ev-meridian", kind: "source", label: "Meridian investor profile", url: "https://meridian.example/portfolio/cardionova" },
      ],
    }, agent),
    "r1__product": cell("r1__product", "AI triage for hospital cardiology teams", priya),
    "r1__risk": cell("r1__risk", { value: "Needs HIPAA/security evidence before board memo", status: "needs_review" }, agent),

    "r2__company": cell("r2__company", "FluxNova", priya),
    "r2__owner": cell("r2__owner", "Priya", priya),
    "r2__website": cell("r2__website", "https://fluxnova.example", agent),
    "r2__funding": cell("r2__funding", "$9M seed", priya),
    "r2__product": cell("r2__product", "Revenue intelligence workbench", priya),
    "r2__risk": cell("r2__risk", "Clear", priya),

    "r3__company": cell("r3__company", "NeuroNova", maya),
    "r3__owner": cell("r3__owner", "Room NodeAgent", agent),
    "r3__website": cell("r3__website", "https://neuronova.example", agent),
    "r3__funding": cell("r3__funding", { value: "Funding source pending", status: "gap" }, agent),
    "r3__product": cell("r3__product", "Clinical workflow automation", agent),
    "r3__risk": cell("r3__risk", { value: "Evidence gap: cap table source missing", status: "needs_review" }, agent),
  },
  meta: { dataframe: { columns, rowCount: 3 } },
};

export const notebook: Artifact = {
  id: "capture-notebook",
  roomId: "showcase-room",
  kind: "note",
  title: "Capture Notebook",
  version: 2,
  createdBy: priya,
  updatedAt: 5,
  order: ["b1", "b2", "b3"],
  elements: {
    b1: cell("b1", { text: "Maya researched CardioNova and tied the Series A source to the board memo." }, maya),
    b2: cell("b2", { text: "Priya asked Room NodeAgent to verify HIPAA/security evidence for CardioNova." }, priya),
    b3: cell("b3", { text: "FluxNova can wait; CardioNova has the strongest source-backed diligence thread." }, agent),
  },
};

export const traceEvents: TraceEvent[] = [
  {
    id: "trace-cardionova-enrich",
    roomId: "showcase-room",
    ts: 10,
    actor: agent,
    type: "agent_status",
    summary: "Researched CardioNova funding, product, and HIPAA evidence gaps",
    detail: "fetch source -> cite evidence -> mark risk needs_review",
    refs: { artifactId: "company-research", elementId: "r1__funding" },
  },
  {
    id: "trace-neuronova-gap",
    roomId: "showcase-room",
    ts: 11,
    actor: agent,
    type: "edit_proposed",
    summary: "Proposed NeuroNova cap table follow-up because evidence was missing",
    refs: { artifactId: "company-research", elementId: "r3__risk" },
  },
];

export const proposals: Proposal[] = [
  {
    id: "proposal-hipaa",
    roomId: "showcase-room",
    artifactId: "company-research",
    op: { opId: "op-hipaa", artifactId: "company-research", elementId: "r1__risk", kind: "set", value: "Security evidence attached", baseVersion: 1 },
    author: agent,
    status: "pending",
    createdAt: 12,
  },
];

export const members = [
  { id: "u-maya", roomId: "showcase-room", name: "Maya", role: "host" as const, anon: false, color: "#ff9e6a", lastSeenAt: 12 },
  { id: "u-priya", roomId: "showcase-room", name: "Priya", role: "member" as const, anon: false, color: "#6aa9ff", lastSeenAt: 12 },
];
