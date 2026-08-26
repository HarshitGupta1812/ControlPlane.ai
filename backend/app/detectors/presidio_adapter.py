"""Optional Presidio adapter. Regex remains the always-on baseline."""


def available() -> bool:
    try:
        import presidio_analyzer  # noqa: F401
    except ImportError:
        return False
    return True
