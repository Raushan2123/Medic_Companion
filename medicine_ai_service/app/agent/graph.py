# app/agent/graph.py
import sqlite3
from pathlib import Path
from langgraph.graph import START, END, StateGraph
from langgraph.checkpoint.sqlite import SqliteSaver

from app.agent.state import AgentState
from app.agent.nodes import extract_node, plan_node, need_info_node, approval_node, execute_node, route_after_plan
from app.db.db_config import get_sqlite_connection

builder = StateGraph(AgentState)

builder.add_node("extract", extract_node)
builder.add_node("plan", plan_node)
builder.add_node("need_info", need_info_node)
builder.add_node("approval", approval_node)
builder.add_node("execute", execute_node)

builder.add_edge(START, "extract")
builder.add_edge("extract", "plan")

builder.add_conditional_edges("plan", route_after_plan, {
    "need_info": "need_info",
    "approval": "approval",
})

builder.add_edge("need_info", "plan")
builder.add_edge("approval", "execute")
builder.add_edge("execute", END)

# ✅ Use centralized DB config
conn = get_sqlite_connection()
memory = SqliteSaver(conn)

med_graph = builder.compile(checkpointer=memory)