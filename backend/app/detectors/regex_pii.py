
from app.security.redaction import find_pii


def scan_pii(text: str) -> dict:
    findings = find_pii(text)
    by_kind: dict[str, int] = {}
    for finding in findings:
        by_kind[finding.kind] = by_kind.get(finding.kind, 0) + 1
    return {"count": len(findings), "types": by_kind, "findings": [{"entity": item.kind, "confidence": item.confidence} for item in findings], "redacted": True}
