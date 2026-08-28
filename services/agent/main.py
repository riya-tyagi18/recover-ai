from fastapi import FastAPI

from stopping import MAX_AUTOMATED_ATTEMPTS, RECOVERY_PROBABILITY_THRESHOLD

app = FastAPI(title="Recover AI Agent", version="0.1.0")


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
