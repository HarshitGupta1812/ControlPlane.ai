from app.detectors.regex_pii import scan_pii


def run(text: str) -> dict:
    return scan_pii(text)
