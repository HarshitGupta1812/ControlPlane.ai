import json
import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.assistant.knowledge import search_knowledge
from app.assistant.system_prompt import SYSTEM_PROMPT
from app.assistant.tools import (
    TOOL_DEFINITIONS,
    get_recent_requests,
    get_request_detail,
    get_usage_summary,
    list_policies,
)
from app.config import get_settings
from app.db.models import User
from app.security.redaction import find_pii, redact

REQUEST_ID_RE = re.compile(r"\b(?:req_[a-z0-9]+|[0-9a-f]{8}-[0-9a-f-]{27,})\b", re.IGNORECASE)
SCOPE_TERMS = {"controlplane", "pipeline", "stage", "policy", "trust", "blocked", "block", "request", "replay", "trace", "usage", "average", "score", "review", "pii", "injection", "model", "route", "workspace", "violation", "intervention", "assistant"}


@dataclass(frozen=True)
class AssistantAnswer:
    text: str
    sources: list[str]
    tool_calls: list[str]


def _is_in_scope(message: str) -> bool:
    lowered = message.lower()
    words = set(re.findall(r"[a-z0-9_]+", lowered))
    if any(term in lowered for term in ("write code", "generate code", "unrelated code", "solve this coding")) and not ("controlplane" in lowered and "api" in lowered):
        return False
    return bool(words & SCOPE_TERMS)


def _deterministic_answer(message: str, *, recent: list[dict], usage: dict, policies: list[dict], detail: dict | None) -> str:
    lowered = message.lower()
    if detail:
        timeline = " → ".join(item['stage'] for item in detail.get('event_timeline', [])[:10])
        return f"Request {detail['id']} was {detail['action']}. It matched {', '.join(detail['risk_tags']) or 'no risk tags'}, used policy {detail['policy']}, and finished with trust {detail['trust_score']}/100. Replay path: {timeline or 'event timeline unavailable'}."
    if "block" in lowered or "last request" in lowered:
        blocked = next((item for item in recent if item["action"] == "BLOCK"), None)
        if blocked:
            if "show" in lowered or "list" in lowered:
                blocked_rows = [item for item in recent if item["action"] == "BLOCK"][:3]
                summary = "; ".join(f"{item['id']}: {item.get('prompt', '[sanitized prompt]')[:120]}" for item in blocked_rows)
                return f"Your recent blocked prompts are: {summary}. Each was stopped before model routing; open a trace for the fused rule details."
            return f"Your latest blocked request was {blocked['id']}. It matched {', '.join(blocked['risk_tags']) or 'a policy violation'}; the fused rule prevented generation before model routing."
        return "I could not find a blocked request in your scoped recent activity."
    if "trust" in lowered or "average" in lowered or "score" in lowered:
        return f"Your scoped usage summary is {usage['average_trust']}/100 average trust across {usage['requests']} governed requests, with ${usage['spend_usd']:.4f} recorded spend."
    if "policy" in lowered:
        names = ", ".join(item["name"] for item in policies[:3]) or "the active versioned profiles"
        return f"Active profiles include {names}. Decision Support is the strictest profile: unsupported and unverifiable claims go to review or block."
    if "recent" in lowered or "last" in lowered or "activity" in lowered:
        summary = "; ".join(f"{item['id']} {item['action']}" for item in recent[:3]) or "no recent requests"
        return f"Your latest scoped requests are: {summary}."
    if any(term in lowered for term in ("pipeline", "stage", "replay", "trace")):
        return "The pipeline has ten stages: receive, PII scan, injection scan, complexity, use-case detection, policy, routing, streaming gate, verification, and trust. Replay reads those events without re-running the model."
    if any(term in lowered for term in ("controlplane", "provide", "services")):
        return "ControlPlane is a governance platform. I can assist with:\n\n*   **Pipeline Stages:** Information on PII, injection, routing, and verification.\n*   **Policies:** Active rules and thresholds applied to your workspace.\n*   **Trust Scores:** Metrics evaluating the safety and accuracy of requests.\n*   **Replay & Traces:** Inspecting the event stream of any governed inference.\n\nI cannot answer unrelated general-knowledge questions."
    return "I can answer questions about ControlPlane, its governance pipeline, policies, trust scores, replay, and your own sanitized workspace activity. I cannot answer unrelated general-knowledge questions."


def _tool_payload(name: str, arguments: dict, *, db: Session, user: User, recent: list[dict], usage: dict, policies: list[dict], detail: dict | None) -> dict:
    if name == "get_recent_requests":
        return {"requests": recent[:max(1, min(int(arguments.get("limit", 5)), 10))]}
    if name == "get_request_detail":
        request_id = str(arguments.get("request_id", ""))
        return {"request": get_request_detail(db, user_id=user.id, tenant_id=user.tenant_id, request_id=request_id) if request_id else detail}
    if name == "get_usage_summary":
        return get_usage_summary(db, user_id=user.id, tenant_id=user.tenant_id, days=int(arguments.get("days", usage.get("period_days", 7))))
    if name == "list_policies":
        return {"policies": policies}
    return {"error": "Unsupported assistant tool"}


async def answer(message: str, *, db: Session, user: User) -> AssistantAnswer:
    if not _is_in_scope(message):
        return AssistantAnswer("I can help only with ControlPlane features, governance decisions, policies, pipeline stages, replay, or your own workspace activity. I can’t answer unrelated questions.", ["Scope boundary"], [])
    recent = get_recent_requests(db, user_id=user.id, tenant_id=user.tenant_id, limit=5)
    usage = get_usage_summary(db, user_id=user.id, tenant_id=user.tenant_id)
    policies = list_policies(db, tenant_id=user.tenant_id)
    knowledge = search_knowledge(message)
    tool_calls: list[str] = ["get_usage_summary"]
    if any(term in message.lower() for term in ("recent", "last", "blocked", "activity")):
        tool_calls.append("get_recent_requests")
    if "policy" in message.lower():
        tool_calls.append("list_policies")
    request_id = REQUEST_ID_RE.search(message)
    detail = get_request_detail(db, user_id=user.id, tenant_id=user.tenant_id, request_id=request_id.group(0)) if request_id else None
    if detail:
        tool_calls.append("get_request_detail")
    deterministic = _deterministic_answer(message, recent=recent, usage=usage, policies=policies, detail=detail)
    settings = get_settings()
    sources = [item["title"] for item in knowledge] + [f"tool:{item}" for item in dict.fromkeys(tool_calls)]
    if settings.dev_mock_llm or not (settings.groq_api_key or settings.gemini_api_key):
        return AssistantAnswer(deterministic, sources, list(dict.fromkeys(tool_calls)))
    try:
        from litellm import acompletion

        context = {"recent": recent, "usage": usage, "policies": policies, "request_detail": detail, "knowledge": knowledge}
        messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "system", "content": f"Sanitized scoped context: {context}"}, {"role": "user", "content": message}]
        first = await acompletion(model="groq/openai/gpt-oss-20b", messages=messages, tools=TOOL_DEFINITIONS, tool_choice="auto", temperature=0.1, api_key=settings.groq_api_key)
        assistant_message = first.choices[0].message
        model_tool_calls = getattr(assistant_message, "tool_calls", None) or []
        if model_tool_calls:
            messages.append({"role": "assistant", "content": getattr(assistant_message, "content", None), "tool_calls": [call.model_dump() if hasattr(call, "model_dump") else call for call in model_tool_calls]})
            for call in model_tool_calls:
                function = getattr(call, "function", call)
                name = getattr(function, "name", "")
                raw_arguments = getattr(function, "arguments", "{}")
                try:
                    arguments = json.loads(raw_arguments) if isinstance(raw_arguments, str) else raw_arguments
                except json.JSONDecodeError:
                    arguments = {}
                tool_calls.append(name)
                messages.append({"role": "tool", "tool_call_id": getattr(call, "id", name), "name": name, "content": json.dumps(_tool_payload(name, arguments, db=db, user=user, recent=recent, usage=usage, policies=policies, detail=detail))})
            final = await acompletion(model="groq/openai/gpt-oss-20b", messages=messages, temperature=0.1, api_key=settings.groq_api_key)
            content = final.choices[0].message.content or deterministic
        else:
            content = assistant_message.content or deterministic
        content = redact(content, find_pii(content))
        if not _is_in_scope(content):
            content = "I can only answer about ControlPlane and your scoped workspace activity."
        return AssistantAnswer(content, [*sources, *[f"tool:{item}" for item in tool_calls if f"tool:{item}" not in sources]], list(dict.fromkeys(tool_calls)))
    except Exception:
        return AssistantAnswer(deterministic, sources, list(dict.fromkeys(tool_calls)))
