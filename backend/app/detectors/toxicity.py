from app.detectors.heuristics import scan_toxicity


def run(text: str) -> dict:
    return scan_toxicity(text)
