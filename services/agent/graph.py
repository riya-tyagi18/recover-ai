from datetime import datetime, timezone
import random
from langgraph.graph import StateGraph, END
from schema import AgentState
from stopping import should_stop

def _audit(state: AgentState, action: str, reason: str, detail: dict) -> AgentState:
    if "audit_logs" not in state or state["audit_logs"] is None:
        state["audit_logs"] = []
    
    state["audit_logs"].append({
        "at": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "reason": reason,
        "detail": detail
    })
    return state

def diagnose(state: AgentState) -> AgentState:
    failure = state["failure"]
    category = failure.get("category", "")
    
    # Simple deterministic rules
    permanent_categories = ["card_expired", "incorrect_details"]
    is_permanent = category in permanent_categories
    
    diagnosis = {
        "is_permanent": is_permanent,
        "confidence": 0.95,
        "recommended_window": "none" if is_permanent else "2-24h",
        "reasoning": f"Category '{category}' is considered {'permanent' if is_permanent else 'temporary'}."
    }
    
    state["diagnosis"] = diagnosis
    return _audit(state, "diagnosed", "Completed diagnosis", diagnosis)

def calculate_probability(state: AgentState) -> AgentState:
    failure = state["failure"]
    customer = state["customer"]
    payment = state["payment"]
    diagnosis = state.get("diagnosis", {})
    
    base_prob = 50
    breakdown = {"base": 50}
    
    if diagnosis.get("is_permanent"):
        base_prob -= 50
        breakdown["permanent_failure"] = -50
    else:
        base_prob += 20
        breakdown["temporary_failure"] = +20
        
    if customer.get("priorSuccessRate", 0) > 0.8:
        base_prob += 20
        breakdown["high_prior_success"] = +20
        
    if customer.get("segment") == "at_risk":
        base_prob -= 40
        breakdown["at_risk_segment"] = -40
        
    prior_failures = payment.get("priorFailureCount", 0)
    if prior_failures > 0:
        penalty = prior_failures * 15
        base_prob -= penalty
        breakdown["prior_failures_penalty"] = -penalty
        
    retry_count = payment.get("retryCount", 0)
    if retry_count > 0:
        penalty = retry_count * 15
        base_prob -= penalty
        breakdown["retry_count_penalty"] = -penalty
        
    final_prob = max(0, min(100, base_prob))
    
    state["probability"] = final_prob
    state["probability_breakdown"] = breakdown
    
    return _audit(state, "probability_calculated", f"Calculated {final_prob}%", breakdown)

def select_strategy(state: AgentState) -> AgentState:
    prob = state.get("probability", 0)
    
    if prob >= 70:
        selected_strategy = "immediate_retry"
    elif prob >= 30:
        selected_strategy = "delayed_retry"
    else:
        selected_strategy = "alt_payment_request"
        
    state["strategy"] = selected_strategy
    return _audit(state, "strategy_selected", f"Selected {selected_strategy}", {"strategy": selected_strategy})

def determine_timing(state: AgentState) -> AgentState:
    strat = state.get("strategy")
    
    if strat == "immediate_retry":
        t = "now"
    elif strat == "delayed_retry":
        t = "+12h"
    else:
        t = "never"
        
    state["retry_timing"] = t
    return _audit(state, "timing_selected", f"Selected {t}", {"retry_timing": t})

def execute(state: AgentState) -> AgentState:
    # Mock SimulationExecutor
    strat = state.get("strategy")
    prob = state.get("probability", 0)
    
    action_result = {
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "source": "simulation",
        "outcome": "skipped"
    }
    
    if strat in ["immediate_retry", "delayed_retry"]:
        # Simulate success if probability is decent and we roll under it
        if prob >= 50:
            action_result["outcome"] = "success"
        else:
            action_result["outcome"] = "failed"
            
    state["action_result"] = action_result
    return _audit(state, "action_executed", f"Execution outcome: {action_result['outcome']}", action_result)

def observe(state: AgentState) -> AgentState:
    action_result = state.get("action_result", {})
    outcome = action_result.get("outcome")
    
    payment = state["payment"]
    diagnosis = state.get("diagnosis", {})
    prob = state.get("probability")
    strat = state.get("strategy")
    
    is_recovered = (outcome == "success")
    requires_alt = (strat == "alt_payment_request")
    
    is_stopped, stop_reason = should_stop(
        automated_attempts=payment.get("retryCount", 0) + 1,
        recovery_probability=prob,
        is_permanent=diagnosis.get("is_permanent", False),
        requires_alt_method=requires_alt,
        is_recovered=is_recovered,
        prior_failure_count=payment.get("priorFailureCount", 0)
    )
    
    state["is_stopped"] = is_stopped
    state["stop_reason"] = stop_reason
    
    msg = "Agent stopped" if is_stopped else "Agent continuing"
    return _audit(state, "result_observed", msg, {"is_stopped": is_stopped, "stop_reason": stop_reason})

def build_graph():
    workflow = StateGraph(AgentState)
    
    workflow.add_node("diagnose", diagnose)
    workflow.add_node("calculate_probability", calculate_probability)
    workflow.add_node("select_strategy", select_strategy)
    workflow.add_node("determine_timing", determine_timing)
    workflow.add_node("execute", execute)
    workflow.add_node("observe", observe)
    
    workflow.set_entry_point("diagnose")
    workflow.add_edge("diagnose", "calculate_probability")
    workflow.add_edge("calculate_probability", "select_strategy")
    workflow.add_edge("select_strategy", "determine_timing")
    workflow.add_edge("determine_timing", "execute")
    workflow.add_edge("execute", "observe")
    workflow.add_edge("observe", END)
    
    return workflow.compile()

