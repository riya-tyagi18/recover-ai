from fastapi import FastAPI
from pydantic import BaseModel

from stopping import MAX_AUTOMATED_ATTEMPTS, RECOVERY_PROBABILITY_THRESHOLD
from schema import Payment, Customer, FailureEvent
from graph import build_graph

app = FastAPI(title="Recover AI Agent", version="0.1.0")

graph = build_graph()

class ProcessRequest(BaseModel):
    payment: Payment
    customer: Customer
    failure: FailureEvent

@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": "recover-ai-agent",
        "phase": 1,
        "max_automated_attempts": MAX_AUTOMATED_ATTEMPTS,
        "probability_threshold": RECOVERY_PROBABILITY_THRESHOLD,
        "llm": "mock",
        "executor": "simulation",
    }

@app.post("/process")
def process_payment(request: ProcessRequest) -> dict:
    initial_state = {
        "payment": request.payment.model_dump(),
        "customer": request.customer.model_dump(),
        "failure": request.failure.model_dump(),
    }
    
    final_state = graph.invoke(initial_state)
    return final_state
