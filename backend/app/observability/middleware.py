import time
from uuid import UUID, uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from structlog.contextvars import bind_contextvars, unbind_contextvars

from app.core.context import request_id_var
from app.observability.logging import get_logger
from app.security.redaction import sanitize_for_log


class CorrelationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        supplied_id = request.headers.get("X-Request-ID", "")
        try:
            request_id = str(UUID(supplied_id))
        except (ValueError, AttributeError):
            request_id = str(uuid4())
        token = request_id_var.set(request_id)
        bind_contextvars(request_id=request_id)
        started = time.perf_counter()
        response: Response | None = None
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            get_logger("http").info("request_complete", method=request.method, path=sanitize_for_log(request.url.path), status=response.status_code if response is not None else 500, duration_ms=round((time.perf_counter() - started) * 1000, 2))
            unbind_contextvars("request_id")
            request_id_var.reset(token)
