from dataclasses import dataclass


@dataclass(frozen=True)
class TrustResult:
    score: float
    breakdown: dict[str, float]


def calculate_trust(*, pii: dict, injection: dict, toxicity: dict, verification: str, action: str, use_case: str, compounding_risk: float = 0) -> TrustResult:
    privacy = 100.0 if pii.get("count", 0) == 0 else max(30.0, 100.0 - pii.get("count", 0) * 22)
    safety = max(0.0, 100.0 - injection.get("confidence", 0) * 72 - toxicity.get("confidence", 0) * (15 if toxicity.get("level") != "LOW" else 0))
    accuracy = {"SUPPORTED": 96.0, "PARTIALLY_SUPPORTED": 78.0, "UNSUPPORTED": 35.0, "UNVERIFIABLE": 72.0}.get(verification, 70.0)
    policy_fit = {"ALLOW": 96.0, "EDIT": 91.0, "SANITIZE": 87.0, "FLAG": 75.0, "HUMAN_REVIEW": 42.0, "BLOCK": 8.0}.get(action, 70.0)
    if action == "HUMAN_REVIEW" and use_case == "decision_support":
        accuracy = min(accuracy, 35.0)
        policy_fit = min(policy_fit, 30.0)
    if action == "BLOCK":
        privacy = min(privacy, 35.0) if pii.get("count", 0) else privacy
        safety = min(safety, 12.0) if injection.get("level") in {"HIGH", "MEDIUM"} else safety
    weights = {"customer_support": {"privacy": .30, "safety": .32, "accuracy": .20, "policy_fit": .18}, "internal_knowledge": {"privacy": .22, "safety": .25, "accuracy": .28, "policy_fit": .25}, "decision_support": {"privacy": .18, "safety": .30, "accuracy": .32, "policy_fit": .20}}.get(use_case, {"privacy": .25, "safety": .25, "accuracy": .25, "policy_fit": .25})
    breakdown = {"privacy": round(privacy, 1), "safety": round(safety, 1), "accuracy": round(accuracy, 1), "policy_fit": round(policy_fit, 1), "compounding_risk": round(compounding_risk, 1)}
    score = sum(breakdown[key] * weight for key, weight in weights.items()) - compounding_risk * .18
    return TrustResult(round(max(0, min(score, 100)), 1), breakdown)
