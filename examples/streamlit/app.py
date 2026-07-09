from __future__ import annotations

import json
import os
from html import escape
from pathlib import Path
from typing import Any

import requests
import streamlit as st
import streamlit.components.v1 as components
from pyvis.network import Network
from st_link_analysis import EdgeStyle, NodeStyle, st_link_analysis


ROOT = Path(__file__).resolve().parent
GRAPH_PATH = ROOT / "nodegraph-showcase.json"
DEFAULT_AGENT_URL = "http://127.0.0.1:8787/agent"
AGENT_URL = os.environ.get("NODEGRAPH_NODEAGENT_URL", DEFAULT_AGENT_URL)

KIND_COLORS = {
    "company": "#5fd0a0",
    "person": "#ff9e6a",
    "agent_job": "#ff9e6a",
    "artifact": "#6aa9ff",
    "spreadsheet_row": "#6aa9ff",
    "notebook_block": "#b794f4",
    "source": "#ffd16a",
    "evidence_fact": "#ffd16a",
    "funding": "#e07060",
    "project": "#60d0e0",
    "achievement": "#f6d365",
    "event": "#f0a040",
    "trace_step": "#60d0e0",
    "proposal": "#c060d0",
    "open_question": "#f0a040",
}

STATUS_COLORS = {
    "source_backed": "#5fd0a0",
    "needs_review": "#f0a040",
    "running": "#60d0e0",
    "failed": "#e07060",
    "rejected": "#e07060",
    "graph_inferred": "#9aa7b5",
    "manual": "#8f9aaa",
}

KIND_ICONS = {
    "company": "business",
    "person": "person",
    "agent_job": "smartphone",
    "artifact": "description",
    "spreadsheet_row": "analytics",
    "notebook_block": "description",
    "source": "link",
    "evidence_fact": "assured_workload",
    "funding": "request_quote",
    "project": "science",
    "achievement": "badge",
    "event": "flag",
    "trace_step": "analytics",
    "proposal": "campaign",
    "open_question": "chat",
}


@st.cache_data
def load_graph() -> dict[str, Any]:
    with GRAPH_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def node_title(node: dict[str, Any]) -> str:
    refs = node.get("refs") or []
    meta = node.get("meta") or {}
    ref_lines = "".join(f"<li>{escape(json.dumps(ref, ensure_ascii=True))}</li>" for ref in refs[:4])
    meta_lines = "".join(f"<li>{escape(str(key))}: {escape(str(value))}</li>" for key, value in meta.items())
    return (
        f"<b>{escape(node['label'])}</b><br>"
        f"{escape(node.get('subtitle') or node['kind'])}<br>"
        f"status: {escape(node.get('status', 'manual'))}<br>"
        f"<ul>{meta_lines}{ref_lines}</ul>"
    )


def edge_title(edge: dict[str, Any]) -> str:
    refs = edge.get("refs") or []
    ref_lines = "".join(f"<li>{escape(json.dumps(ref, ensure_ascii=True))}</li>" for ref in refs[:4])
    return (
        f"<b>{escape(edge['label'])}</b><br>"
        f"type: {escape(edge['kind'].upper())}<br>"
        f"status: {escape(edge.get('status', 'manual'))}<br>"
        f"<ul>{ref_lines}</ul>"
    )


def matches_query(node: dict[str, Any], query: str) -> bool:
    if not query:
        return True
    text = " ".join(
        [
            node.get("id", ""),
            node.get("kind", ""),
            node.get("label", ""),
            node.get("subtitle", ""),
            node.get("status", ""),
            json.dumps(node.get("refs", []), ensure_ascii=True),
            json.dumps(node.get("meta", {}), ensure_ascii=True),
        ]
    ).lower()
    return query.lower() in text


def filter_graph(
    graph: dict[str, Any],
    query: str,
    selected_kinds: list[str],
    evidence_only: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    allowed_kinds = set(selected_kinds)
    nodes = [
        node
        for node in graph["nodes"]
        if node["kind"] in allowed_kinds
        and matches_query(node, query)
        and (not evidence_only or node.get("status") in {"source_backed", "needs_review"})
    ]
    node_ids = {node["id"] for node in nodes}
    edges = [
        edge
        for edge in graph["edges"]
        if edge["source"] in node_ids
        and edge["target"] in node_ids
        and (not evidence_only or edge.get("status") in {"source_backed", "needs_review"})
    ]
    return nodes, edges


def render_network(nodes: list[dict[str, Any]], edges: list[dict[str, Any]], focus_id: str | None) -> str:
    network = Network(
        height="720px",
        width="100%",
        directed=True,
        bgcolor="#0b0f12",
        font_color="#e6edf3",
        cdn_resources="in_line",
    )
    network.barnes_hut(
        gravity=-32000,
        central_gravity=0.18,
        spring_length=145,
        spring_strength=0.035,
        damping=0.24,
        overlap=0.35,
    )

    for node in nodes:
        selected = node["id"] == focus_id
        network.add_node(
            node["id"],
            label=node["label"],
            title=node_title(node),
            shape="dot",
            size=min(34, 14 + int(node.get("weight", 1)) * 3),
            borderWidth=4 if selected else 1,
            color={
                "background": KIND_COLORS.get(node["kind"], "#94a3b8"),
                "border": "#f5a36c" if selected else STATUS_COLORS.get(node.get("status", "manual"), "#26313c"),
                "highlight": {
                    "background": KIND_COLORS.get(node["kind"], "#94a3b8"),
                    "border": "#f5a36c",
                },
            },
        )

    for edge in edges:
        network.add_edge(
            edge["source"],
            edge["target"],
            label=edge["label"],
            title=edge_title(edge),
            arrows="to",
            width=max(1, min(5, int(edge.get("weight", 1)))),
            color=STATUS_COLORS.get(edge.get("status", "manual"), "#6f7a86"),
        )

    network.set_options(
        """
        var options = {
          "nodes": {
            "font": {"size": 15, "face": "Inter, system-ui, sans-serif", "color": "#e6edf3"},
            "shadow": {"enabled": true, "color": "rgba(0,0,0,.32)", "size": 12, "x": 0, "y": 4}
          },
          "edges": {
            "font": {"size": 11, "face": "Inter, system-ui, sans-serif", "color": "#aab4c2", "strokeWidth": 2},
            "smooth": {"type": "dynamic"},
            "arrows": {"to": {"enabled": true, "scaleFactor": 0.65}}
          },
          "interaction": {
            "hover": true,
            "tooltipDelay": 80,
            "navigationButtons": true,
            "keyboard": true
          },
          "physics": {
            "enabled": true,
            "stabilization": {"iterations": 140, "fit": true},
            "minVelocity": 0.7
          }
        }
        """
    )
    return network.generate_html(notebook=False)


def link_analysis_elements(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, list[dict[str, dict[str, Any]]]]:
    node_ids = {node["id"] for node in nodes}
    return {
        "nodes": [
            {
                "data": {
                    "id": node["id"],
                    "label": node["kind"].upper(),
                    "name": node["label"],
                    "kind": node["kind"],
                    "status": node.get("status", "manual"),
                    "subtitle": node.get("subtitle", ""),
                    "weight": node.get("weight", 1),
                    "refs": json.dumps(node.get("refs", []), ensure_ascii=True),
                    "meta": json.dumps(node.get("meta", {}), ensure_ascii=True),
                }
            }
            for node in nodes
        ],
        "edges": [
            {
                "data": {
                    "id": edge["id"],
                    "source": edge["source"],
                    "target": edge["target"],
                    "label": edge["kind"].upper(),
                    "relationship": edge["label"],
                    "status": edge.get("status", "manual"),
                    "weight": edge.get("weight", 1),
                    "refs": json.dumps(edge.get("refs", []), ensure_ascii=True),
                }
            }
            for edge in edges
            if edge["source"] in node_ids and edge["target"] in node_ids
        ],
    }


def link_analysis_node_styles(kinds: list[str]) -> list[NodeStyle]:
    return [
        NodeStyle(
            label=kind.upper(),
            color=KIND_COLORS.get(kind, "#94a3b8"),
            caption="name",
            icon=KIND_ICONS.get(kind),
        )
        for kind in kinds
    ]


def link_analysis_edge_styles(edges: list[dict[str, Any]]) -> list[EdgeStyle]:
    kinds = sorted({edge["kind"] for edge in edges})
    return [
        EdgeStyle(
            label=kind.upper(),
            color="#9aa7b5",
            caption="relationship",
            directed=True,
            curve_style="bezier",
        )
        for kind in kinds
    ]


def ask_nodeagent(prompt: str, selected_node_id: str | None) -> dict[str, Any]:
    response = requests.post(
        AGENT_URL,
        json={"prompt": prompt, "selectedNodeId": selected_node_id},
        timeout=35,
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("ok", False):
        raise RuntimeError(str(payload.get("error", "NodeAgent request failed")))
    return payload


def normalize_agent_prompt(prompt: str) -> str:
    trimmed = prompt.strip()
    if trimmed.lower().startswith("@nodeagent"):
        trimmed = trimmed[len("@nodeagent"):].strip(" :,-")
    return trimmed or "Explain the selected graph focus."


def enqueue_agent_prompt(prompt: str) -> None:
    st.session_state["nodegraph_agent_pending_prompt"] = prompt


def ensure_chat_messages() -> list[dict[str, Any]]:
    if "nodegraph_chat_messages" not in st.session_state:
        st.session_state["nodegraph_chat_messages"] = [
            {
                "role": "assistant",
                "content": "Message @nodeagent about evidence, people, traces, projects, achievements, or review gaps in the selected graph.",
                "trace": [],
            }
        ]
    return st.session_state["nodegraph_chat_messages"]


def submit_chat_turn(prompt: str, selected_node_id: str | None) -> None:
    messages = ensure_chat_messages()
    messages.append({"role": "user", "content": prompt, "trace": []})
    try:
        response_payload = ask_nodeagent(normalize_agent_prompt(prompt), selected_node_id)
        messages.append(
            {
                "role": "assistant",
                "content": response_payload.get("finalText", "NodeAgent completed."),
                "trace": response_payload.get("trace", []),
            }
        )
    except Exception as exc:  # noqa: BLE001 - Streamlit should display bridge failures in chat.
        messages.append(
            {
                "role": "assistant",
                "content": f"NodeAgent is unavailable: {exc}",
                "trace": [],
                "error": True,
            }
        )


def render_nodeagent_chat(selected_node_id: str | None) -> None:
    st.subheader("NodeAgent chat")
    st.caption("Room-style graph chat. Mention @nodeagent or just ask; each reply keeps a tool trace.")
    messages = ensure_chat_messages()
    for index, message in enumerate(messages):
        role = "user" if message.get("role") == "user" else "assistant"
        with st.chat_message(role):
            if message.get("error"):
                st.error(message["content"])
            else:
                st.markdown(message["content"])
            if message.get("trace"):
                with st.expander("Tool trace", expanded=False):
                    st.json(message["trace"], expanded=False)

    pending_prompt = st.session_state.pop("nodegraph_agent_pending_prompt", None)
    chat_prompt = st.chat_input("Message @nodeagent about evidence, people, traces, or gaps...")
    next_prompt = pending_prompt or chat_prompt
    if next_prompt:
        with st.spinner("NodeAgent is reading the graph..."):
            submit_chat_turn(next_prompt, selected_node_id)
        st.rerun()


st.set_page_config(page_title="NodeGraph Streamlit", layout="wide")
st.title("NodeGraph Streamlit Showcase")
st.caption("A Neo4j-style property graph view over NodeGraph nodes, edges, statuses, and provenance refs.")

graph_data = load_graph()
all_kinds = sorted({node["kind"] for node in graph_data["nodes"]})
node_lookup = {node["id"]: node for node in graph_data["nodes"]}
query_params = st.query_params


def query_param(name: str, default: str = "") -> str:
    value = query_params.get(name, default)
    if isinstance(value, list):
        return str(value[0]) if value else default
    return str(value)


default_query = query_param("query")
default_evidence_only = query_param("evidence").lower() in {"1", "true", "yes"}
default_focus = query_param("focus", "company:cardionova")
default_renderer = query_param("renderer", "link-analysis")

with st.sidebar:
    st.header("Graph controls")
    renderer_options = {
        "link-analysis": "Cytoscape link analysis",
        "pyvis": "PyVis physics graph",
    }
    renderer_value = st.selectbox(
        "Renderer",
        list(renderer_options),
        index=list(renderer_options).index(default_renderer) if default_renderer in renderer_options else 0,
        format_func=lambda value: renderer_options[value],
    )
    query_value = st.text_input("Search", value=default_query, placeholder="CardioNova, Maya, source...")
    selected_kind_values = st.multiselect("Node kinds", all_kinds, default=all_kinds)
    evidence_only_value = st.toggle("Evidence-backed or review nodes only", value=default_evidence_only)
    layout_value = st.selectbox("Layout", ["fcose", "cose", "dagre", "breadthfirst", "concentric", "circle"], index=0)
    focus_options = [""] + [node["id"] for node in graph_data["nodes"]]
    focus_index = focus_options.index(default_focus) if default_focus in focus_options else 1 if len(focus_options) > 1 else 0
    focus_value = st.selectbox(
        "Focus node",
        focus_options,
        index=focus_index,
        format_func=lambda value: "None" if not value else node_lookup[value]["label"],
    )
    st.divider()
    st.subheader("NodeAgent")
    st.caption(f"Endpoint: {AGENT_URL}")
    st.button(
        "Evidence",
        use_container_width=True,
        on_click=enqueue_agent_prompt,
        args=("@nodeagent explain source-backed evidence and needs-review gaps for the selected node",),
    )
    st.button(
        "People + traces",
        use_container_width=True,
        on_click=enqueue_agent_prompt,
        args=("@nodeagent show people, agent traces, projects, and achievements connected to this company",),
    )
    st.button(
        "Review gaps",
        use_container_width=True,
        on_click=enqueue_agent_prompt,
        args=("@nodeagent find blockers and open questions around this graph focus",),
    )
    if st.button("Clear chat", use_container_width=True):
        st.session_state.pop("nodegraph_chat_messages", None)
        st.session_state.pop("nodegraph_agent_pending_prompt", None)
        st.rerun()

filtered_nodes, filtered_edges = filter_graph(
    graph_data,
    query=query_value,
    selected_kinds=selected_kind_values,
    evidence_only=evidence_only_value,
)

metric_cols = st.columns(4)
metric_cols[0].metric("Nodes", len(filtered_nodes))
metric_cols[1].metric("Edges", len(filtered_edges))
metric_cols[2].metric("Sources", graph_data["stats"]["sources"])
metric_cols[3].metric("Open questions", graph_data["stats"]["openQuestions"])

if renderer_value == "link-analysis":
    selected_action = st_link_analysis(
        link_analysis_elements(filtered_nodes, filtered_edges),
        layout=layout_value,
        node_styles=link_analysis_node_styles(selected_kind_values),
        edge_styles=link_analysis_edge_styles(filtered_edges),
        height=760,
        key=f"nodegraph-link-analysis-{layout_value}",
        node_actions=["expand"],
    )
    if selected_action:
        st.caption("Last graph action")
        st.json(selected_action, expanded=False)
else:
    components.html(render_network(filtered_nodes, filtered_edges, focus_value or None), height=750, scrolling=False)

if focus_value:
    focus_node = node_lookup[focus_value]
    st.subheader(focus_node["label"])
    st.json(
        {
            "id": focus_node["id"],
            "kind": focus_node["kind"],
            "status": focus_node["status"],
            "refs": focus_node.get("refs", []),
            "meta": focus_node.get("meta", {}),
        },
        expanded=False,
    )

render_nodeagent_chat(focus_value or None)

st.dataframe(
    [
        {
            "source": edge["source"],
            "relationship": edge["kind"].upper(),
            "target": edge["target"],
            "status": edge.get("status", "manual"),
        }
        for edge in filtered_edges
    ],
    use_container_width=True,
)
