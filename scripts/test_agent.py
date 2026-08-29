import os
import sys

# Add services/agent to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../services/agent')))

from graph import build_graph

def test():
    graph = build_graph()
    
    # Mock data
    initial_state = {
        "payment": {
            "id": "pay_123",
            "customerId": "cust_123",
            "batchId": "batch_1",
            "subscriptionId": "sub_1",
            "amountPaise": 99900,
            "currency": "INR",
            "paymentMethod": "card",
            "bank": "HDFC",
            "retryCount": 0,
            "priorFailureCount": 0,
            "status": "failed",
            "recoveredAmountPaise": 0,
            "subscriptionValuePaise": 99900,
            "failedAt": "2026-08-29T10:00:00Z",
            "assignedStrategy": "immediate_retry"
        },
        "customer": {
            "id": "cust_123",
            "name": "Riya Sharma",
            "segment": "standard",
            "priorSuccessCount": 5,
            "priorSuccessRate": 1.0,
            "paymentMethod": "card",
            "bank": "HDFC",
            "createdAt": "2026-01-01T10:00:00Z"
        },
        "failure": {
            "id": "fail_123",
            "paymentId": "pay_123",
            "reason": "Insufficient funds",
            "category": "insufficient_funds",
            "occurredAt": "2026-08-29T10:00:00Z"
        }
    }
    
    result = graph.invoke(initial_state)
    
    import json
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    test()
