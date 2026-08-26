from app.policies.engine import evaluate_policy
from app.policies.profiles import PolicyProfile


def test_injection_privacy_fusion_blocks() -> None:
    decision = evaluate_policy(use_case="customer_support", pii={"count": 1, "types": {"email": 1}}, injection={"level": "HIGH", "confidence": .98, "signals": []}, complexity="LOW", verification="UNVERIFIABLE")
    assert decision.action == "BLOCK"
    assert "privacy" in decision.risk_tags
    assert "injection" in decision.risk_tags


def test_customer_support_unverifiable_flags_instead_of_blocking() -> None:
    decision = evaluate_policy(use_case="customer_support", pii={"count": 0}, injection={"level": "LOW", "confidence": .1, "signals": []}, complexity="LOW", verification="UNVERIFIABLE")
    assert decision.action == "FLAG"


def test_decision_support_unverifiable_requires_review() -> None:
    decision = evaluate_policy(use_case="decision_support", pii={"count": 0}, injection={"level": "LOW", "confidence": .1, "signals": []}, complexity="LOW", verification="UNVERIFIABLE")
    assert decision.action == "HUMAN_REVIEW"
    assert "decision" in decision.risk_tags


def test_toxicity_minor_fusion_blocks() -> None:
    decision = evaluate_policy(use_case="customer_support", pii={"count": 0}, injection={"level": "LOW"}, complexity="LOW", toxicity={"level": "MEDIUM"}, extra_tags=["minor"], verification="SUPPORTED")
    assert decision.action == "BLOCK"
    assert "fusion.minor+toxicity" in decision.fired_rules


def test_versioned_fusion_map_is_applied_without_weakening_injection() -> None:
    profile = PolicyProfile("CUSTOM", 2, "Custom", "customer_support", "EU", "Enterprise", {"privacy": "FLAG", "fusion": {"privacy+financial": "BLOCK"}})
    decision = evaluate_policy(use_case="customer_support", pii={"count": 1}, injection={"level": "LOW", "confidence": .1}, complexity="LOW", extra_tags=["financial"], policy_override=profile)
    assert decision.action == "BLOCK"
    assert "fusion.financial+privacy" in decision.fired_rules
