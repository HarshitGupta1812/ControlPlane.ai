from app.detectors.heuristics import classify_complexity


def run(text: str) -> dict:
    return {"level": classify_complexity(text)}
