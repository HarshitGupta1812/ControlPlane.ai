from app.usecase.classifier import detect_use_case


def run(prompt: str, explicit: str | None = None, headers: dict[str, str] | None = None):
    return detect_use_case(prompt, explicit, headers)
