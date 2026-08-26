from collections.abc import Iterable
from dataclasses import asdict

from app.core.orchestrator import PipelineEvent
from app.security.redaction import sanitize_for_log


def event_payload(event: PipelineEvent) -> dict:
    payload = asdict(event)
    payload["data"] = sanitize_for_log(payload["data"])
    return payload


def serialize_events(events: Iterable[PipelineEvent]) -> list[dict]:
    return [event_payload(event) for event in events]
