from app.detectors.heuristics import scan_injection


def run(text: str) -> dict:
    return scan_injection(text)
