from app.security.redaction import sanitize_for_log


def sanitize_event(data: dict) -> dict:
    """Single boundary for event/log JSON. Raw values do not cross into persisted telemetry."""
    result = sanitize_for_log(data)
    return result if isinstance(result, dict) else {"value": result}
