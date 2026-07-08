import { useMemo, useState, type FormEvent, type ReactElement } from "react";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import type { SemanticGraphNode, SemanticGraphStats, SemanticGraphViewModel } from "./semanticGraphTypes";

export interface NodeGraphAgentPanelRequest {
  prompt: string;
  graph: SemanticGraphViewModel;
  graphStats: SemanticGraphStats;
  selectedNodeId?: string | null;
  selectedNode?: SemanticGraphNode;
}

export interface NodeGraphAgentPanelResponse {
  finalText: string;
  trace?: Array<{ tool: string; ms?: number; result?: unknown }>;
  raw?: unknown;
}

export interface NodeGraphAgentPanelProps {
  graph: SemanticGraphViewModel;
  selectedNodeId?: string | null;
  onRunAgent: (request: NodeGraphAgentPanelRequest) => Promise<NodeGraphAgentPanelResponse>;
  suggestions?: string[];
  disabled?: boolean;
  className?: string;
}

const DEFAULT_SUGGESTIONS = [
  "What evidence supports the selected entity?",
  "What needs review before this is board-ready?",
  "Who researched this company and what did the agent change?",
];

export function NodeGraphAgentPanel({
  graph,
  selectedNodeId,
  onRunAgent,
  suggestions = DEFAULT_SUGGESTIONS,
  disabled = false,
  className,
}: NodeGraphAgentPanelProps): ReactElement {
  const selectedNode = useMemo(() => graph.nodes.find((node) => node.id === selectedNodeId), [graph.nodes, selectedNodeId]);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<NodeGraphAgentPanelResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async (nextPrompt: string) => {
    const trimmed = nextPrompt.trim();
    if (!trimmed || running || disabled) return;
    setPrompt(trimmed);
    setRunning(true);
    setError(null);
    try {
      const response = await onRunAgent({
        prompt: trimmed,
        graph,
        graphStats: graph.stats,
        selectedNodeId,
        selectedNode,
      });
      setAnswer(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(prompt);
  };

  return (
    <aside className={className ? `ng-agent-panel ${className}` : "ng-agent-panel"} aria-label="NodeGraph NodeAgent panel">
      <div className="ng-agent-head">
        <div>
          <span className="ng-agent-eyebrow"><Bot size={14} /> NodeAgent</span>
          <h2>Graph agent</h2>
        </div>
        <span className="ng-agent-state">{running ? "working" : "ready"}</span>
      </div>

      <div className="ng-agent-context">
        <span>{graph.stats.nodes} nodes</span>
        <span>{graph.stats.edges} links</span>
        <span>{graph.stats.backedFacts} backed facts</span>
        {selectedNode && <strong>{selectedNode.label}</strong>}
      </div>

      <div className="ng-agent-suggestions">
        {suggestions.map((item) => (
          <button key={item} type="button" onClick={() => void run(item)} disabled={running || disabled}>
            <Sparkles size={13} />
            {item}
          </button>
        ))}
      </div>

      <form className="ng-agent-form" onSubmit={submit}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask NodeAgent about evidence, relationships, traces, or review gaps..."
          disabled={running || disabled}
          rows={3}
        />
        <button type="submit" disabled={running || disabled || !prompt.trim()} aria-label="Run NodeAgent">
          {running ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
        </button>
      </form>

      {error && <div className="ng-agent-error">{error}</div>}
      {answer && (
        <div className="ng-agent-answer">
          <p>{answer.finalText}</p>
          {answer.trace?.length ? (
            <div className="ng-agent-trace">
              {answer.trace.map((item, index) => (
                <span key={`${item.tool}-${index}`}>{item.tool}</span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
