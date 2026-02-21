from langgraph.graph import START, END, StateGraph
from langgraph.checkpoint.memory import InMemorySaver
from app.agent.state import AgentState
from app.agent.nodes import extract_node, plan_node, approval_node, execute_node

# Build graph
builder = StateGraph(AgentState)

builder.add_node("extract", extract_node)
builder.add_node("plan", plan_node)
builder.add_node("approval", approval_node)
builder.add_node("execute", execute_node)

builder.add_edge(START, "extract")
builder.add_edge("extract", "plan")
builder.add_edge("plan", "approval")
builder.add_edge("approval", "execute")
builder.add_edge("execute", END)

# Compile with checkpointer so interrupts can resume using thread_id (we use plan_id) :contentReference[oaicite:2]{index=2}
med_graph = builder.compile(checkpointer=InMemorySaver())