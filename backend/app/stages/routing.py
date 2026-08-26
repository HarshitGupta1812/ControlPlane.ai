from app.llm.router import ModelRouter


def run(use_case_tier: str, preference: str = "auto") -> dict:
    return ModelRouter().select(tier=use_case_tier, preference=preference)
