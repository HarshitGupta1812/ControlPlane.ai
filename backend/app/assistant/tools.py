from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.db.models import Event, Policy, RequestRecord

TOOL_DEFINITIONS = [
    {"type": "function", "function": {"name": "get_recent_requests", "description": "Read a sanitized summary of this authenticated user's recent requests.", "parameters": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 10}}, "additionalProperties": False}}},
    {"type": "function", "function": {"name": "get_request_detail", "description": "Read the sanitized governance summary for one request owned by this user.", "parameters": {"type": "object", "properties": {"request_id": {"type": "string"}}, "required": ["request_id"], "additionalProperties": False}}},
    {"type": "function", "function": {"name": "get_usage_summary", "description": "Read aggregate usage, trust, and spend for this authenticated user over a recent period.", "parameters": {"type": "object", "properties": {"days": {"type": "integer", "minimum": 1, "maximum": 90}}, "additionalProperties": False}}},
    {"type": "function", "function": {"name": "list_policies", "description": "List active versioned policy profiles visible to this tenant.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
]


def get_recent_requests(db: Session, *, user_id: str, tenant_id: str, limit: int = 5) -> list[dict]:
    rows = db.scalars(select(RequestRecord).where(RequestRecord.user_id == user_id, RequestRecord.tenant_id == tenant_id).order_by(desc(RequestRecord.created_at)).limit(min(limit, 10))).all()
    return [{"id": row.id, "prompt": row.prompt_sanitized[:240], "action": row.policy_action, "use_case": row.use_case, "trust_score": row.trust_score, "risk_tags": row.risk_tags, "created_at": row.created_at.isoformat() if row.created_at else None} for row in rows]


def get_request_detail(db: Session, *, user_id: str, tenant_id: str, request_id: str) -> dict | None:
    try:
        request_id = str(UUID(request_id))
    except (ValueError, AttributeError):
        return None
    row = db.scalar(select(RequestRecord).where(RequestRecord.id == request_id, RequestRecord.user_id == user_id, RequestRecord.tenant_id == tenant_id))
    if not row:
        return None
    events = db.scalars(select(Event).where(Event.request_id == row.id).order_by(Event.sequence, Event.ts)).all()
    return {"id": row.id, "action": row.policy_action, "use_case": row.use_case, "trust_score": row.trust_score, "risk_tags": row.risk_tags, "policy": f"{row.policy_key}.v{row.policy_version}", "verification": row.verification_verdict, "claims": row.verification_claims, "model": row.model_served, "latency_ms": row.latency_ms, "event_timeline": [{"stage": event.stage, "status": event.status} for event in events]}


def get_usage_summary(db: Session, *, user_id: str, tenant_id: str, days: int = 7) -> dict:
    period_days = max(1, min(days, 90))
    start = datetime.now(UTC) - timedelta(days=period_days)
    query = select(func.count(RequestRecord.id), func.avg(RequestRecord.trust_score), func.sum(RequestRecord.cost_usd)).where(RequestRecord.user_id == user_id, RequestRecord.tenant_id == tenant_id, RequestRecord.created_at >= start)
    count, average, spend = db.execute(query).one()
    return {"period_days": period_days, "requests": count or 0, "average_trust": round(float(average or 0), 1), "spend_usd": round(float(spend or 0), 4)}


def list_policies(db: Session, *, tenant_id: str) -> list[dict]:
    rows = db.scalars(select(Policy).where((Policy.tenant_id == tenant_id) | (Policy.tenant_id.is_(None)), Policy.active.is_(True)).order_by(Policy.policy_key, desc(Policy.version))).all()
    selected: dict[str, Policy] = {}
    for row in rows:
        # A tenant-specific active version overrides the global baseline.
        if row.policy_key not in selected or row.tenant_id == tenant_id:
            selected[row.policy_key] = row
    return [{"key": row.policy_key, "version": row.version, "name": row.name, "geography": row.geography, "sector": row.sector} for row in selected.values()]
