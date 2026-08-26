from dataclasses import dataclass


@dataclass(frozen=True)
class UseCaseProfile:
    key: str
    name: str
    risk_appetite: str
    latency_budget_ms: int
    verification: str
    pii_action: str
    model_tier: str
    keywords: tuple[str, ...]
    examples: tuple[str, ...]


PROFILES = (
    UseCaseProfile("customer_support", "Customer Support", "low", 3000, "flag_unverifiable", "sanitize", "fast", ("customer", "support", "refund", "ticket", "user", "account"), ("rewrite this support response", "help a customer with their order")),
    UseCaseProfile("internal_knowledge", "Internal Knowledge", "medium", 5000, "balanced", "flag", "balanced", ("internal", "runbook", "operations", "company", "team", "incident", "report"), ("summarize our internal report", "what changed in our runbook")),
    UseCaseProfile("decision_support", "Decision Support", "very_low", 8000, "mandatory", "block", "capable", ("approve", "applicant", "candidate", "eligibility", "risk score", "should we decide"), ("should we approve this applicant", "recommend a high stakes decision")),
)

PROFILE_BY_KEY = {profile.key: profile for profile in PROFILES}
