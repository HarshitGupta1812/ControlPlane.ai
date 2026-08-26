from dataclasses import dataclass


@dataclass(frozen=True)
class PolicyProfile:
    key: str
    version: int
    name: str
    use_case: str
    geography: str
    sector: str
    rules: dict


POLICIES = (
    PolicyProfile("CP-CS-14", 14, "Customer Support Guardrails", "customer_support", "Global", "Consumer", {"high_injection": "BLOCK", "privacy": "SANITIZE", "unverifiable": "FLAG", "fusion": {"privacy+hallucination": "BLOCK", "injection+privacy": "BLOCK", "toxicity+minor": "BLOCK"}}),
    PolicyProfile("CP-IK-07", 7, "Internal Knowledge Balanced", "internal_knowledge", "US / EU", "Enterprise", {"high_injection": "BLOCK", "privacy": "FLAG", "unverifiable": "FLAG", "fusion": {"privacy+hallucination": "FLAG", "injection+privacy": "BLOCK", "bias+decision": "HUMAN_REVIEW", "hallucination+decision": "HUMAN_REVIEW"}}),
    PolicyProfile("CP-DS-11", 11, "Decision Support Strict", "decision_support", "Global", "Financial Services", {"high_injection": "BLOCK", "privacy": "BLOCK", "unverifiable": "HUMAN_REVIEW", "unsupported": "BLOCK", "fusion": {"privacy+hallucination": "BLOCK", "injection+privacy": "BLOCK", "bias+decision": "HUMAN_REVIEW", "hallucination+decision": "HUMAN_REVIEW", "toxicity+minor": "BLOCK"}}),
)
POLICY_BY_KEY = {policy.key: policy for policy in POLICIES}
