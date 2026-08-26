from app.policies.engine import evaluate_policy


def run(use_case: str, pii: dict, injection: dict, complexity: str, verification: str = "UNVERIFIABLE"):
    return evaluate_policy(use_case=use_case, pii=pii, injection=injection, complexity=complexity, verification=verification)
