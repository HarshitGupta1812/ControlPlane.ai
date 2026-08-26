import hashlib
import secrets


def generate_api_key() -> tuple[str, str, str]:
    raw = "cp_live_" + secrets.token_urlsafe(32)
    return raw, raw[:15], hashlib.sha256(raw.encode()).hexdigest()


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
