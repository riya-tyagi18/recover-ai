import os
import sys
import json

# Add services/agent to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../services/agent')))

from graph import build_graph

graph = build_graph()

def run_scenario(name, state_overrides):
    print(f"\n--- Running Scenario: {name} ---")
    
    # Base state
    initial_state = {
        "payment": {
            "id": "pay_test",
            "customerId": "cust_test",
            "batchId": "batch_1",
            "subscriptionId": "sub_1",
            "amountPaise": 50000,
            "currency": "INR",
            "paymentMethod": "card",
            "bank": "HDFC",
            "retryCount": 0,
            "priorFailureCount": 0,
            "status": "failed",
            "recoveredAmountPaise": 0,
            "subscriptionValuePaise": 50000,
            "failedAt": "2026-08-29T10:00:00Z",
            "assignedStrategy": "immediate_retry"
        },
        "customer": {
            "id": "cust_test",
            "name": "Test User",
            "segment": "standard",
            "priorSuccessCount": 5,
            "priorSuccessRate": 0.9,
            "paymentMethod": "card",
            "bank": "HDFC",
            "createdAt": "2026-01-01T10:00:00Z"
        },
        "failure": {
            "id": "fail_test",
            "paymentId": "pay_test",
            "reason": "Test reason",
            "category": "insufficient_funds",
            "occurredAt": "2026-08-29T10:00:00Z"
        }
    }
    
    # Apply overrides
    for key, overrides in state_overrides.items():
        initial_state[key].update(overrides)
        
    result = graph.invoke(initial_state)
    
    print(f"Prob: {result.get('probability')}%")
    print(f"Strategy: {result.get('strategy')}")
    print(f"Timing: {result.get('retry_timing')}")
    print(f"Result: {result.get('action_result', {}).get('outcome')}")
    print(f"Stopped: {result.get('is_stopped')}, Reason: {result.get('stop_reason')}")
    
    return result

def test_all():
    # 1. Temporary failure -> recovery strategy -> retry -> success -> STOP
    run_scenario("1. Temporary -> Success", {
        "failure": {"category": "insufficient_funds"},
        "customer": {"priorSuccessRate": 0.9} # High prob -> success
    })
    
    # 2. Temporary failure -> retry -> retry -> retry -> maximum-attempt STOP
    run_scenario("2. Max Attempts STOP", {
        "failure": {"category": "insufficient_funds"},
        "payment": {"retryCount": 2}, # Next attempt will be 3 -> max attempts
        "customer": {"priorSuccessRate": 0.5} # Lowers prob so mock execution fails
    })
    
    # 3. Permanent failure -> immediate STOP
    run_scenario("3. Permanent Failure STOP", {
        "failure": {"category": "card_expired"}
    })
    
    # 4. Low recovery probability -> STOP
    run_scenario("4. Low Probability STOP", {
        "failure": {"category": "network_temporary"}, 
        "customer": {"segment": "at_risk", "priorSuccessRate": 0.1},
        "payment": {"retryCount": 1} # Base 50 + 20 (temp) - 40 (at_risk) - 15 (retry) = 15. Wait, we want < 15.
    })
    
    # Need to make scenario 4's probability < 15
    run_scenario("4. Low Probability STOP", {
        "failure": {"category": "network_temporary"}, 
        "customer": {"segment": "at_risk", "priorSuccessRate": 0.1},
        "payment": {"retryCount": 2} # Base 50 + 20 - 40 - 30 = 0. Retry=2 < max_attempts(3). 
    })
    
    # 5. Alternative payment/manual review -> STOP
    run_scenario("5. Alt Payment / Manual Review", {
        "payment": {"priorFailureCount": 3}
    })
    
if __name__ == "__main__":
    test_all()
