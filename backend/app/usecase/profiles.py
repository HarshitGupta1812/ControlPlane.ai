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
    UseCaseProfile(
        "customer_support",
        "Customer Support",
        "low",
        3000,
        "flag_unverifiable",
        "sanitize",
        "fast",
        (
            "customer", "support", "refund", "ticket", "user", "account",
            "complaint", "return", "order", "billing", "subscription",
            "cancel", "help", "service", "request", "response", "reply",
            "rewrite", "draft", "email", "message", "satisfaction", "feedback",
        ),
        (
            "rewrite this support response",
            "help a customer with their order",
            "draft a reply to a customer complaint",
            "handle a refund request from a user",
            "write a follow-up email for a support ticket",
            "respond to a billing inquiry",
        ),
    ),
    UseCaseProfile(
        "internal_knowledge",
        "Internal Knowledge",
        "medium",
        5000,
        "balanced",
        "flag",
        "balanced",
        (
            "internal", "runbook", "operations", "company", "team", "incident",
            "report", "summary", "summarize", "documentation", "wiki", "process",
            "workflow", "metrics", "dashboard", "analysis", "trends", "themes",
            "recommend", "actions", "feedback", "knowledge", "article", "onboarding",
        ),
        (
            "summarize our internal report",
            "what changed in our runbook",
            "summarize our latest customer feedback themes and recommend actions",
            "analyze the trends in our operations dashboard",
            "list the key takeaways from the incident postmortem",
            "what are the top issues in the onboarding funnel",
        ),
    ),
    UseCaseProfile(
        "decision_support",
        "Decision Support",
        "very_low",
        8000,
        "mandatory",
        "block",
        "capable",
        (
            "approve", "applicant", "candidate", "eligibility", "risk score",
            "should we decide", "recommend", "decision", "loan", "credit",
            "investment", "evaluate", "assessment", "proposal", "budget",
            "strategic", "forecast", "projection", "trade-off", "pros and cons",
            "compare options", "risk analysis", "cost-benefit",
        ),
        (
            "should we approve this applicant",
            "recommend a high stakes decision",
            "evaluate the risk of this investment proposal",
            "compare the pros and cons of these two vendor options",
            "assess the eligibility of this candidate for the programme",
            "provide a cost-benefit analysis for the infrastructure migration",
        ),
    ),
)

PROFILE_BY_KEY = {profile.key: profile for profile in PROFILES}
