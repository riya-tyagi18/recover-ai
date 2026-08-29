from typing import Literal, TypedDict, Any, List
from pydantic import BaseModel, Field

# Pydantic models for incoming payload (from types.ts)
class Customer(BaseModel):
    id: str
    name: str
    segment: str
    priorSuccessCount: int
    priorSuccessRate: float
    paymentMethod: str
    bank: str
    createdAt: str

class Payment(BaseModel):
    id: str
    customerId: str
    batchId: str
    subscriptionId: str
    amountPaise: int
    currency: str
    paymentMethod: str
    bank: str
    retryCount: int
    priorFailureCount: int
    status: str
    recoveredAmountPaise: int
    recoveredAt: str | None = None
    stopReason: str | None = None
    subscriptionValuePaise: int
    failedAt: str
    assignedStrategy: str

class FailureEvent(BaseModel):
    id: str
    paymentId: str
    reason: str
    category: str
    occurredAt: str

# Graph State TypedDict
class AgentState(TypedDict):
    payment: dict[str, Any]
    customer: dict[str, Any]
    failure: dict[str, Any]
    
    # Node outputs
    diagnosis: dict[str, Any]
    probability: int | None
    probability_breakdown: dict[str, Any]
    strategy: str | None
    retry_timing: str | None
    action_result: dict[str, Any]
    
    # Stopping
    is_stopped: bool
    stop_reason: str | None
    
    # Audit log
    audit_logs: List[dict[str, Any]]
