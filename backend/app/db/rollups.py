from datetime import UTC, date, datetime, time

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.db.models import RequestRecord, UsageDaily


def refresh_usage_daily(db: Session, tenant_id: str, user_id: str, day: date, use_case: str = "all") -> int:
    """Refresh one tenant/user/day/use-case rollup with SQL aggregates only."""
    day_start = datetime.combine(day, time.min, tzinfo=UTC)
    predicates = [RequestRecord.tenant_id == tenant_id, RequestRecord.user_id == user_id, func.date(RequestRecord.created_at) == day]
    if use_case != "all":
        predicates.append(RequestRecord.use_case == use_case)
    metrics = db.execute(select(func.count(RequestRecord.id), func.sum(case((RequestRecord.policy_action.in_(["BLOCK", "FLAG", "HUMAN_REVIEW", "SANITIZE"]), 1), else_=0)), func.sum(RequestRecord.trust_score), func.sum(RequestRecord.cost_usd)).where(*predicates)).one()
    requests, interventions, trust_sum, spend = metrics
    row = db.scalar(select(UsageDaily).where(UsageDaily.tenant_id == tenant_id, UsageDaily.user_id == user_id, UsageDaily.day == day_start, UsageDaily.use_case == use_case))
    if row is None:
        row = UsageDaily(tenant_id=tenant_id, user_id=user_id, day=day_start, use_case=use_case)
        db.add(row)
    row.requests = int(requests or 0)
    row.interventions = int(interventions or 0)
    row.trust_sum = float(trust_sum or 0)
    row.spend_usd = float(spend or 0)
    db.commit()
    return row.requests
