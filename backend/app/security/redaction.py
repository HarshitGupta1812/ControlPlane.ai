import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Redaction:
    kind: str
    start: int
    end: int
    confidence: float


EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE = re.compile(r"(?<!\w)(?:\+?\d[\d .()\-]{7,}\d)(?!\w)")
SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CARD = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
SECRET = re.compile(r"\b(?:sk-[A-Za-z0-9_-]{16,}|pk_[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,})\b")
SENSITIVE_KEY = re.compile(r"^(?:password|secret|token|api[_-]?key|key[_-]?hash|authorization|cookie|access[_-]?token|refresh[_-]?token)$", re.IGNORECASE)


def find_pii(text: str) -> list[Redaction]:
    findings: list[Redaction] = []
    for pattern, kind, confidence in [(EMAIL, "email", .99), (PHONE, "phone", .91), (SSN, "ssn", .995), (CARD, "payment_card", .95), (SECRET, "secret", .96)]:
        findings.extend(Redaction(kind, match.start(), match.end(), confidence) for match in pattern.finditer(text))
    return sorted(findings, key=lambda item: (item.start, -(item.end - item.start), -item.confidence))


def redact(text: str, findings: list[Redaction]) -> str:
    # Detectors can overlap (a payment card is also digit-like phone text).
    # Keep the widest/highest-confidence span once before applying offsets.
    selected: list[Redaction] = []
    for finding in sorted(findings, key=lambda item: (-(item.end - item.start), -item.confidence, item.start)):
        if any(finding.start < item.end and finding.end > item.start for item in selected):
            continue
        selected.append(finding)
    output = text
    for finding in sorted(selected, key=lambda item: item.start, reverse=True):
        output = f"{output[:finding.start]}[{finding.kind.upper()} REDACTED]{output[finding.end:]}"
    return output


def sanitize_for_log(value: object) -> object:
    if isinstance(value, str):
        redactions = find_pii(value)
        return redact(value, redactions) if redactions else value[:500]
    if isinstance(value, dict):
        return {str(key): "[REDACTED]" if SENSITIVE_KEY.search(str(key)) else sanitize_for_log(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_for_log(item) for item in value[:50]]
    return value
