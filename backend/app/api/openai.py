import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.context import get_request_id
from app.core.orchestrator import GovernanceOrchestrator, PipelineResult
from app.db.models import ApiKey, User
from app.db.repositories import persist_result
from app.db.session import get_db
from app.observability.ratelimit import limiter
from app.security.keys import hash_api_key

router = APIRouter(prefix="/v1", tags=["openai-compatible"])
orchestrator = GovernanceOrchestrator()


class OpenAIMessage(BaseModel):
    role: str
    content: str


class OpenAIRequest(BaseModel):
    model: str = "controlplane-governed"
    messages: list[OpenAIMessage] = Field(min_length=1)
    stream: bool = False
    use_case: str | None = None


def _chunk(request_id: str, content: str = "", finish_reason: str | None = None) -> str:
    payload = {"id": request_id, "object": "chat.completion.chunk", "created": 0, "model": "controlplane-governed", "choices": [{"index": 0, "delta": {"content": content} if content else {}, "finish_reason": finish_reason}]}
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"


@router.post("/chat/completions")
@limiter.limit("60/minute")
async def completions(request: Request, body: OpenAIRequest, x_api_key: Annotated[str | None, Header()] = None, authorization: Annotated[str | None, Header()] = None, x_use_case: Annotated[str | None, Header(alias="X-Use-Case")] = None, db: Session = Depends(get_db)):
    bearer_key = authorization.removeprefix("Bearer ").strip() if authorization and authorization.lower().startswith("bearer ") else None
    raw_key = x_api_key or bearer_key
    if not raw_key:
        raise HTTPException(status_code=401, detail="X-API-Key or Authorization: Bearer <key> is required")
    key = db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_api_key(raw_key), ApiKey.revoked.is_(False)))
    if not key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    user = db.get(User, key.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")
    prompt = next((message.content for message in reversed(body.messages) if message.role == "user"), "")
    if not prompt.strip():
        raise HTTPException(status_code=422, detail="messages must include a non-empty user message")
    if len(prompt) > get_settings().max_prompt_chars:
        raise HTTPException(status_code=413, detail="Prompt exceeds the configured maximum length")
    effective_use_case = body.use_case or x_use_case or key.default_use_case
    if not body.stream:
        result = await orchestrator.run(prompt, use_case=effective_use_case, request_id=get_request_id())
        persist_result(db, user=user, result=result)
        content = "Request blocked by ControlPlane governance policy." if result.action == "BLOCK" else "Request held for human review by ControlPlane governance policy." if result.action == "HUMAN_REVIEW" else result.response
        return {"id": result.request_id, "object": "chat.completion", "created": 0, "model": body.model, "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}], "governance": {"action": result.action, "trust_score": result.trust_score, "risk_tags": result.risk_tags}}

    async def generate() -> AsyncIterator[str]:
        result: PipelineResult | None = None
        async for kind, payload in orchestrator.stream_events(prompt, use_case=effective_use_case, request_id=get_request_id()):
            if kind == "token":
                yield _chunk(str(payload["request_id"]), str(payload.get("text", "")))
            elif kind == "result":
                result = payload["result"]
        if result is not None:
            persist_result(db, user=user, result=result)
            yield _chunk(result.request_id, finish_reason="stop")
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
