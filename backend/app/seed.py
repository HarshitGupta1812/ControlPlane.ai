from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ModelRegistry, Policy, UseCase
from app.policies.profiles import POLICIES
from app.usecase.profiles import PROFILES


def seed_reference_data(db: Session) -> None:
    for profile in PROFILES:
        if not db.scalar(select(UseCase).where(UseCase.tenant_id.is_(None), UseCase.key == profile.key)):
            db.add(UseCase(tenant_id=None, key=profile.key, name=profile.name, profile={"risk_appetite": profile.risk_appetite, "latency_budget_ms": profile.latency_budget_ms, "verification": profile.verification, "pii_action": profile.pii_action, "model_tier": profile.model_tier}, examples=list(profile.examples)))
    for policy in POLICIES:
        if not db.scalar(select(Policy).where(Policy.tenant_id.is_(None), Policy.policy_key == policy.key, Policy.version == policy.version)):
            db.add(Policy(tenant_id=None, policy_key=policy.key, version=policy.version, name=policy.name, geography=policy.geography, sector=policy.sector, rules=policy.rules, active=True))
    models = [("Groq", "groq/openai/gpt-oss-20b", "fast", .10, .30), ("Gemini", "gemini/gemini-3.6-flash", "capable", .30, 2.50)]
    for provider, model, tier, input_cost, output_cost in models:
        if not db.scalar(select(ModelRegistry).where(ModelRegistry.model == model)):
            db.add(ModelRegistry(provider=provider, model=model, tier=tier, input_cost_per_million=input_cost, output_cost_per_million=output_cost))
    db.commit()
