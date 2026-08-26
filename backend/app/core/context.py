from contextvars import ContextVar
from uuid import uuid4

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    return request_id_var.get()


def set_request_id(value: str | None = None) -> str:
    request_id = value or str(uuid4())
    request_id_var.set(request_id)
    return request_id
