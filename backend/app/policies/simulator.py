from app.detectors.heuristics import classify_complexity, scan_injection
from app.detectors.regex_pii import scan_pii
from app.policies.engine import evaluate_policy
from app.policies.profiles import PolicyProfile
from app.usecase.classifier import detect_use_case


def _semantic_tags(prompt: str) -> list[str]:
    lower = prompt.lower()
    tags: list[str] = []
    if any(term in lower for term in ("bias", "neighborhood", "family situation", "gender", "race", "ethnicity")):
        tags.append("bias")
    if any(term in lower for term in ("hallucination", "make up", "invent a personal", "fabricate")):
        tags.append("hallucination")
    if any(term in lower for term in ("minor", "child", "underage")):
        tags.append("minor")
    if any(term in lower for term in ("financial", "loan", "credit", "investment")):
        tags.append("financial")
    if any(term in lower for term in ("decision", "approve", "applicant", "candidate", "eligibility")):
        tags.append("decision")
    return tags


def simulate(prompt: str, use_case: str | None = None, policy_key: str | None = None, policy_override: PolicyProfile | None = None) -> dict:
    pii = scan_pii(prompt)
    injection = scan_injection(prompt)
    complexity = classify_complexity(prompt)
    detected = detect_use_case(prompt, explicit=use_case)
    decision = evaluate_policy(use_case=detected.profile.key, pii=pii, injection=injection, complexity=complexity, requested_key=policy_key, extra_tags=_semantic_tags(prompt), policy_override=policy_override)
    return {"use_case": detected.profile.name, "confidence": detected.confidence, "method": detected.method, "complexity": complexity, "action": decision.action, "risk_tags": decision.risk_tags, "fired_rules": decision.fired_rules, "estimated_latency_ms": 42, "estimated_cost_usd": 0.0}
