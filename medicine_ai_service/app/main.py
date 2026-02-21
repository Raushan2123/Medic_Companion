from fastapi import FastAPI
from app.api.routes_ai import router as ai_router
from app.api.routes_adherence import router as adherence_router

app = FastAPI(title="Medicine Companion (AI + LangGraph)", version="1.0")

app.include_router(ai_router)
app.include_router(adherence_router)

@app.get("/health")
def health():
    return {"ok": True}
@app.get("/")
def root():
    return {"ok": True, "service": "Medicine Companion (AI + LangGraph)"}