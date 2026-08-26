import re

INJECTION_PATTERNS: list[tuple[str, re.Pattern[str], float]] = [
    ("ignore_previous_instructions", re.compile(r"ignore\s+(all\s+)?previous|disregard\s+(all\s+)?prior", re.IGNORECASE), .98),
    ("system_prompt_extraction", re.compile(r"(reveal|show|print|leak).{0,30}(system prompt|hidden instructions)", re.IGNORECASE), .93),
    ("role_override", re.compile(r"you are now|act as|jailbreak|developer mode", re.IGNORECASE), .86),
    ("exfiltration", re.compile(r"(send|export|forward|email).{0,50}(list|directory|records|data|personal email)", re.IGNORECASE), .92),
]

TOXICITY_TERMS = {"kill", "threaten", "slur", "hate", "violent"}


def scan_injection(text: str) -> dict:
    signals: list[dict] = []
    for key, pattern, confidence in INJECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            signals.append({"signal": key, "confidence": confidence})
    score = max((signal["confidence"] for signal in signals), default=0.01)
    level = "HIGH" if score >= .9 else "MEDIUM" if score >= .7 else "LOW"
    return {"level": level, "confidence": score, "signals": signals, "upgrade": "disabled"}


def scan_toxicity(text: str) -> dict:
    lower = text.lower()
    hits = sorted({term for term in TOXICITY_TERMS if re.search(rf"\b{re.escape(term)}\b", lower)})
    return {"level": "HIGH" if len(hits) > 1 else "MEDIUM" if hits else "LOW", "confidence": min(.55 + .16 * len(hits), .99), "signals": hits}


def classify_complexity(text: str) -> str:
    words = len(text.split())
    clauses = len(re.findall(r"[,;:]|\band\b|\bthen\b|\bcompare\b", text, re.IGNORECASE))
    return "HIGH" if words > 110 or clauses > 7 else "MEDIUM" if words > 35 or clauses > 2 else "LOW"
