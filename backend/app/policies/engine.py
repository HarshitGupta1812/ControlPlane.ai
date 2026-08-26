from dataclasses import dataclass

from app.policies.profiles import POLICIES, POLICY_BY_KEY, PolicyProfile

ACTIONS = ("ALLOW", "EDIT", "SANITIZE", "FLAG", "HUMAN_REVIEW", "BLOCK")
ACTION_RANK = {name: index for index, name in enumerate(ACTIONS)}
DEFAULT_FUSION_RULES: dict[frozenset[str], str] = {
    frozenset({"privacy", "hallucination"}): "BLOCK",
    frozenset({"injection", "privacy"}): "BLOCK",
    frozenset({"bias", "decision"}): "HUMAN_REVIEW",
    frozenset({"hallucination", "decision"}): "HUMAN_REVIEW",
    frozenset({"toxicity", "minor"}): "BLOCK",
}


@dataclass(frozen=True)
class PolicyDecision:
    action: str
    risk_tags: list[str]
    fired_rules: list[str]
    policy: PolicyProfile
    explanation: str


def policy_for_use_case(use_case: str, requested_key: str | None = None) -> PolicyProfile:
    if requested_key and requested_key in POLICY_BY_KEY:
        return POLICY_BY_KEY[requested_key]
    for policy in POLICIES:
        if policy.use_case == use_case:
            return policy
    return POLICY_BY_KEY["CP-DS-11"]


def evaluate_policy(
    *,
    use_case: str,
    pii: dict,
    injection: dict,
    complexity: str,
    toxicity: dict | None = None,
    verification: str = "UNVERIFIABLE",
    requested_key: str | None = None,
    extra_tags: list[str] | None = None,
    pii_action: str = "sanitize",
    policy_override: PolicyProfile | None = None,
) -> PolicyDecision:
    policy = policy_override or policy_for_use_case(use_case, requested_key)
    tags: list[str] = list(dict.fromkeys(extra_tags or []))
    fired: list[str] = []
    action = "ALLOW"
    rules = policy.rules or {}
    if pii.get("count", 0):
        tags.append("privacy")
        fired.append("privacy.detected")
        requested_pii_action = pii_action.upper() if pii_action.lower() in {"sanitize", "flag", "block"} else "SANITIZE"
        policy_pii_action = str(rules.get("privacy", "FLAG")).upper()
        action = _stronger_action(requested_pii_action, policy_pii_action)
    if injection.get("level") in {"HIGH", "MEDIUM"}:
        tags.append("injection")
        fired.append(f"injection.{injection['level'].lower()}")
        if injection.get("level") == "HIGH":
            # High-confidence injection is a non-negotiable security boundary;
            # a policy version may raise or explain it, never weaken it.
            action = _stronger_action(action, "BLOCK")
    if toxicity and toxicity.get("level") in {"HIGH", "MEDIUM"}:
        tags.append("toxicity")
        fired.append(f"toxicity.{str(toxicity['level']).lower()}")
        if toxicity.get("level") == "HIGH":
            action = _stronger_action(action, "BLOCK")
    if verification in {"UNSUPPORTED", "UNVERIFIABLE"}:
        fired.append(f"verification.{verification.lower()}")
        decision_context = use_case == "decision_support" or "decision" in tags
        if decision_context:
            if "decision" not in tags:
                tags.append("decision")
            configured_action = str(rules.get("unsupported" if verification == "UNSUPPORTED" else "unverifiable", "HUMAN_REVIEW")).upper()
            configured_action = _stronger_action("HUMAN_REVIEW", configured_action)
        else:
            configured_action = str(rules.get("unsupported" if verification == "UNSUPPORTED" else "unverifiable", "FLAG")).upper()
        action = _stronger_action(action, configured_action)
    if complexity == "HIGH":
        fired.append("complexity.high")
        action = _stronger_action(action, "FLAG")
    fusion_rules = dict(DEFAULT_FUSION_RULES)
    for key, configured_action in (rules.get("fusion", {}) or {}).items():
        required = frozenset(part.strip() for part in str(key).split("+") if part.strip())
        if required:
            fusion_rules[required] = str(configured_action).upper()
    for required, fused_action in fusion_rules.items():
        if required.issubset(set(tags)):
            action = _stronger_action(action, fused_action)
            fired.append("fusion." + "+".join(sorted(required)))
    if action not in ACTIONS:
        action = "FLAG"
    explanation = "No active rule fired." if not fired else " · ".join(dict.fromkeys(fired))
    return PolicyDecision(action, list(dict.fromkeys(tags)), list(dict.fromkeys(fired)), policy, explanation)


def _stronger_action(current: str, candidate: str) -> str:
    return candidate if ACTION_RANK.get(candidate, 0) > ACTION_RANK.get(current, 0) else current
