import asyncio
import re
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from app.detectors.heuristics import classify_complexity, scan_injection, scan_toxicity
from app.detectors.regex_pii import scan_pii
from app.llm.router import ModelRouter
from app.policies.engine import evaluate_policy
from app.policies.profiles import PolicyProfile
from app.security.redaction import find_pii, redact
from app.stages.generation_gate import StreamingSafetyGate
from app.trust.engine import calculate_trust
from app.usecase.classifier import detect_use_case


@dataclass
class PipelineEvent:
    stage: str
    status: str
    duration_ms: int
    confidence: float | None
    data: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {"stage": self.stage, "status": self.status, "duration_ms": self.duration_ms, "confidence": self.confidence, "data": self.data}


@dataclass
class PipelineResult:
    request_id: str
    sanitized_prompt: str
    use_case: str
    use_case_confidence: float
    use_case_inferred: bool
    complexity: str
    action: str
    policy_key: str
    policy_version: int
    risk_tags: list[str]
    model: str | None
    fallback_used: bool
    pii: dict[str, Any]
    injection: dict[str, Any]
    verification: str
    claims: list[dict[str, Any]]
    trust_score: float
    trust_breakdown: dict[str, float]
    cost_usd: float
    latency_ms: int
    events: list[PipelineEvent]
    response: str = ""
    compounding_risk: float = 0.0


@dataclass
class PreparedPipeline:
    request_id: str
    started: float
    sanitized_prompt: str
    use_case: str
    use_case_confidence: float
    use_case_inferred: bool
    complexity: str
    action: str
    policy_key: str
    policy_version: int
    risk_tags: list[str]
    model: str | None
    route: dict[str, Any]
    fallback_used: bool
    pii: dict[str, Any]
    injection: dict[str, Any]
    toxicity: dict[str, Any]
    events: list[PipelineEvent]
    compounding_risk: float
    sources: list[dict[str, Any]]
    verification_mode: str
    safety_strictness: str


class GovernanceOrchestrator:
    """Coordinates the ten governance stages and keeps raw prompt values out of events."""

    def __init__(self) -> None:
        self.router = ModelRouter()

    async def prepare(
        self,
        prompt: str,
        *,
        use_case: str | None = None,
        policy_key: str | None = None,
        routing_preference: str = "auto",
        request_id: str | None = None,
        headers: dict[str, str] | None = None,
        pii_action: str = "sanitize",
        safety_strictness: str = "medium",
        verification: str = "auto",
        max_cost_usd: float | None = None,
        session_risk: float = 0.0,
        sources: list[dict[str, Any]] | None = None,
        session_window: list[str] | None = None,
        policy_override: PolicyProfile | None = None,
    ) -> PreparedPipeline:
        started = time.perf_counter()
        request_id = request_id or str(uuid4())
        redactions = find_pii(prompt)
        sanitized_prompt = redact(prompt, redactions)
        analysis_text = "\n".join([*(session_window or [])[-10:], prompt])
        events: list[PipelineEvent] = [PipelineEvent("request.received", "ok", 4, 1.0, {"request_id": request_id, "payload_redacted": True})]

        pii, injection, complexity, detected = await asyncio.gather(
            asyncio.to_thread(scan_pii, analysis_text),
            asyncio.to_thread(scan_injection, analysis_text),
            asyncio.to_thread(classify_complexity, analysis_text),
            asyncio.to_thread(detect_use_case, analysis_text, use_case, headers),
        )
        events.extend(
            [
                PipelineEvent("pii.scan", "warn" if pii["count"] else "ok", 18, .99 if pii["count"] else 1.0, {"count": pii["count"], "types": pii["types"], "redacted": True}),
                PipelineEvent("injection.scan", "blocked" if injection["level"] == "HIGH" else "warn" if injection["level"] == "MEDIUM" else "ok", 31, injection["confidence"], {"level": injection["level"], "signals": injection["signals"]}),
                PipelineEvent("complexity.classify", "ok", 12, .94, {"level": complexity}),
                PipelineEvent("usecase.detect", "warn" if detected.inferred and detected.confidence < .55 else "ok", 22, detected.confidence, {"use_case": detected.profile.name, "method": detected.method, "inferred": detected.inferred, "scores": detected.scores, "latency_budget_ms": detected.profile.latency_budget_ms, "verification": detected.profile.verification, "model_tier": detected.profile.model_tier}),
            ]
        )

        lower = analysis_text.lower()
        extra_tags: list[str] = []
        if any(term in lower for term in ("bias", "neighborhood", "family situation", "gender", "race", "ethnicity")):
            extra_tags.append("bias")
        if any(term in lower for term in ("hallucination", "make up", "invent a personal", "fabricate")):
            extra_tags.append("hallucination")
        if any(term in lower for term in ("minor", "child", "underage")):
            extra_tags.append("minor")
        if any(term in lower for term in ("financial", "loan", "credit", "investment")):
            extra_tags.append("financial")
        if any(term in lower for term in ("decision", "approve", "applicant", "candidate", "eligibility")) and "decision" not in extra_tags:
            extra_tags.append("decision")
        toxicity = scan_toxicity(analysis_text)
        verification_mode = detected.profile.verification if verification == "auto" else verification
        decision = evaluate_policy(
            use_case=detected.profile.key,
            pii=pii,
            injection=injection,
            complexity=complexity,
            toxicity=toxicity,
            verification="NOT_RUN" if verification_mode == "off" else "SUPPORTED" if sources else "UNVERIFIABLE",
            requested_key=policy_key,
            extra_tags=extra_tags,
            pii_action=pii_action,
            policy_override=policy_override,
        )
        tags = list(dict.fromkeys(decision.risk_tags))
        for tag in extra_tags:
            if tag not in tags:
                tags.append(tag)
        # Use-case policy and risk fusion can only raise severity, never silently weaken a block.
        action = decision.action
        fired_rules = list(decision.fired_rules)
        if {"bias", "decision"}.issubset(set(tags)):
            action = _stronger_action(action, "HUMAN_REVIEW")
            fired_rules.append("fusion.bias+decision")
        if {"hallucination", "decision"}.issubset(set(tags)):
            action = _stronger_action(action, "HUMAN_REVIEW")
            fired_rules.append("fusion.hallucination+decision")
        if {"privacy", "hallucination"}.issubset(set(tags)):
            action = _stronger_action(action, "BLOCK")
            fired_rules.append("fusion.privacy+hallucination")
        compounding_risk = min(100.0, max(0.0, session_risk) * .78 + len(tags) * 19.0)
        if compounding_risk >= 65 and action not in {"BLOCK", "HUMAN_REVIEW"}:
            action = "HUMAN_REVIEW"
            fired_rules.append("session.compounding_risk")
        route = self.router.select(tier=detected.profile.model_tier, preference=routing_preference)
        estimated_cost = float(route["estimated_cost_usd"])
        if max_cost_usd is not None and estimated_cost > max_cost_usd and action not in {"BLOCK", "HUMAN_REVIEW"}:
            action = "FLAG"
            fired_rules.append("routing.max_cost")
        if action != decision.action or fired_rules != decision.fired_rules or tags != decision.risk_tags:
            decision = type(decision)(action, tags, list(dict.fromkeys(fired_rules)), decision.policy, " · ".join(dict.fromkeys(fired_rules)) or "No active rule fired.")
        events.append(PipelineEvent("policy.evaluate", "blocked" if action == "BLOCK" else "warn" if action in {"FLAG", "HUMAN_REVIEW", "SANITIZE"} else "ok", 9, 1.0, {"action": action, "policy_key": decision.policy.key, "policy_version": decision.policy.version, "fired_rules": decision.fired_rules, "risk_tags": tags}))
        model = None if action in {"BLOCK", "HUMAN_REVIEW"} else route["model"]
        route_status = "blocked" if action == "BLOCK" else "warn" if action == "HUMAN_REVIEW" else "ok"
        events.append(PipelineEvent("routing.select", route_status, 16, 1.0, {"model": model, "candidate_model": route["model"], "fallback": route["fallback"] if model else None, "cost_estimate_usd": 0.0 if model is None else estimated_cost, "preference": routing_preference}))
        return PreparedPipeline(request_id, started, sanitized_prompt, detected.profile.key, detected.confidence, detected.inferred, complexity, action, decision.policy.key, decision.policy.version, tags, model, route, False, pii, injection, toxicity, events, compounding_risk, sources or [], verification_mode, safety_strictness)

    async def run(self, prompt: str, **kwargs: Any) -> PipelineResult:
        prepared = await self.prepare(prompt, **kwargs)
        response = ""
        gate_intervened = False
        if prepared.action == "BLOCK":
            prepared.events.append(PipelineEvent("generation.stream", "blocked", 0, prepared.injection["confidence"], {"intervention": True, "released_tokens": 0, "buffer_chars": 0}))
        elif prepared.action == "HUMAN_REVIEW":
            prepared.events.append(PipelineEvent("generation.stream", "warn", 0, .91, {"intervention": True, "released_tokens": 0, "reason": "human_review"}))
        else:
            gate = StreamingSafetyGate(buffer_chars=_buffer_size(prepared.verification_mode, prepared.action, prepared.safety_strictness))
            async for token in self.router.stream(prepared.sanitized_prompt, prepared.route):
                unsafe = _is_unsafe(scan_toxicity(gate.peek() + token), prepared.safety_strictness)
                releases = gate.push(token, unsafe=unsafe)
                response += "".join(_sanitize_output(release) for release in releases)
                gate_intervened = gate.cancelled
            if _is_unsafe(scan_toxicity(gate.peek()), prepared.safety_strictness):
                gate.cancel()
                gate_intervened = True
            response += "".join(_sanitize_output(release) for release in gate.flush())
            prepared.fallback_used = self.router.fallback_used()
            if gate_intervened:
                response = "The response was withheld by the streaming safety gate. Please refine the request or ask a reviewer."
            output_toxicity = scan_toxicity(response)
            gate_intervened = gate_intervened or _is_unsafe(output_toxicity, prepared.safety_strictness)
            prepared.events.append(PipelineEvent("generation.stream", "warn" if gate_intervened else "ok", 1240, .96, {"buffer_chars": gate.max_chars, "released_tokens": len(response.split()), "intervention": gate_intervened, "fallback_used": prepared.fallback_used}))
        return self._finish(prepared, response, gate_intervened)

    async def stream_events(self, prompt: str, **kwargs: Any) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        """Yield governance events and gated tokens progressively for the SSE API."""
        prepared = await self.prepare(prompt, **kwargs)
        for sequence, event in enumerate(prepared.events, start=1):
            yield "stage", {"request_id": prepared.request_id, "sequence": sequence, **event.as_dict()}
        response = ""
        gate_intervened = False
        if prepared.action == "BLOCK":
            prepared.events.append(PipelineEvent("generation.stream", "blocked", 0, prepared.injection["confidence"], {"intervention": True, "released_tokens": 0, "buffer_chars": 0}))
            yield "stage", {"request_id": prepared.request_id, "sequence": len(prepared.events), **prepared.events[-1].as_dict()}
            yield "intervention", {"request_id": prepared.request_id, "reason": "fused_risk", "fallback": "Generation was prevented before routing."}
        elif prepared.action == "HUMAN_REVIEW":
            prepared.events.append(PipelineEvent("generation.stream", "warn", 0, .91, {"intervention": True, "released_tokens": 0, "reason": "human_review"}))
            yield "stage", {"request_id": prepared.request_id, "sequence": len(prepared.events), **prepared.events[-1].as_dict()}
            yield "intervention", {"request_id": prepared.request_id, "reason": "human_review", "fallback": "Generation was held for a human reviewer."}
        else:
            gate = StreamingSafetyGate(buffer_chars=_buffer_size(prepared.verification_mode, prepared.action, prepared.safety_strictness))
            async for token in self.router.stream(prepared.sanitized_prompt, prepared.route):
                unsafe = _is_unsafe(scan_toxicity(gate.peek() + token), prepared.safety_strictness)
                releases = gate.push(token, unsafe=unsafe)
                if gate.cancelled:
                    gate_intervened = True
                    yield "intervention", {"request_id": prepared.request_id, "reason": "streaming_safety_gate", "fallback": "The unsafe window was withheld."}
                    break
                for release in releases:
                    safe_release = _sanitize_output(release)
                    response += safe_release
                    yield "token", {"request_id": prepared.request_id, "text": safe_release}
            if not gate.cancelled and scan_toxicity(gate.peek())["level"] == "HIGH":
                gate.cancel()
                gate_intervened = True
                yield "intervention", {"request_id": prepared.request_id, "reason": "streaming_safety_gate", "fallback": "The buffered safety window was withheld."}
            if not gate.cancelled:
                for release in gate.flush():
                    safe_release = _sanitize_output(release)
                    response += safe_release
                    yield "token", {"request_id": prepared.request_id, "text": safe_release}
            prepared.fallback_used = self.router.fallback_used()
            if gate_intervened:
                response = "The response was withheld by the streaming safety gate. Please refine the request or ask a reviewer."
                yield "token", {"request_id": prepared.request_id, "text": response}
            output_toxicity = scan_toxicity(response)
            gate_intervened = gate_intervened or _is_unsafe(output_toxicity, prepared.safety_strictness)
            prepared.events.append(PipelineEvent("generation.stream", "warn" if gate_intervened else "ok", 1240, .96, {"buffer_chars": gate.max_chars, "released_tokens": len(response.split()), "intervention": gate_intervened, "fallback_used": prepared.fallback_used}))
            yield "stage", {"request_id": prepared.request_id, "sequence": len(prepared.events), **prepared.events[-1].as_dict()}
        result = self._finish(prepared, response, gate_intervened)
        for sequence, event in enumerate(prepared.events[-2:], start=len(prepared.events) - 1):
            if event.stage in {"verification", "trust.calculated"}:
                yield "stage", {"request_id": prepared.request_id, "sequence": sequence, **event.as_dict()}
        yield "post", {"request_id": result.request_id, "verification": result.verification, "trust_score": result.trust_score, "trust_breakdown": result.trust_breakdown, "risk_tags": result.risk_tags}
        yield "result", {"result": result}

    def _finish(self, prepared: PreparedPipeline, response: str, gate_intervened: bool) -> PipelineResult:
        response = _sanitize_output(response)
        if gate_intervened and prepared.action == "ALLOW":
            prepared.action = "FLAG"
            if "toxicity" not in prepared.risk_tags:
                prepared.risk_tags.append("toxicity")
            policy_event = next((event for event in prepared.events if event.stage == "policy.evaluate"), None)
            if policy_event is not None:
                policy_event.status = "warn"
                policy_event.data["action"] = prepared.action
                policy_event.data["risk_tags"] = prepared.risk_tags
        verification, claims = _verify_response(response, prepared.sources, prepared.verification_mode, prepared.action)
        prepared.events.append(PipelineEvent("verification", "warn" if verification in {"UNVERIFIABLE", "PARTIALLY_SUPPORTED"} else "blocked" if verification in {"NOT_RUN", "UNSUPPORTED"} else "ok", 86, .72 if verification == "UNVERIFIABLE" else .84 if verification == "SUPPORTED" else .61 if verification == "PARTIALLY_SUPPORTED" else .24 if verification == "UNSUPPORTED" else None, {"verdict": verification, "claims": claims}))
        if verification == "UNSUPPORTED" and prepared.action not in {"BLOCK", "HUMAN_REVIEW"}:
            prepared.action = "BLOCK" if prepared.use_case == "decision_support" else "FLAG"
            if "hallucination" not in prepared.risk_tags:
                prepared.risk_tags.append("hallucination")
            policy_event = next((event for event in prepared.events if event.stage == "policy.evaluate"), None)
            if policy_event is not None:
                policy_event.status = "blocked" if prepared.action == "BLOCK" else "warn"
                policy_event.data["action"] = prepared.action
                policy_event.data["risk_tags"] = prepared.risk_tags
        trust = calculate_trust(pii=prepared.pii, injection=prepared.injection, toxicity=prepared.toxicity, verification=verification, action=prepared.action, use_case=prepared.use_case, compounding_risk=prepared.compounding_risk)
        policy_event = next((event for event in reversed(prepared.events) if event.stage == "policy.evaluate"), None)
        fusion_rules = [item for item in (policy_event.data.get("fired_rules", []) if policy_event else []) if str(item).startswith("fusion.")]
        prepared.events.append(PipelineEvent("trust.calculated", "ok", 6, trust.score / 100, {"score": trust.score, "breakdown": trust.breakdown, "fusion_rules": fusion_rules}))
        latency_ms = max(1, int((time.perf_counter() - prepared.started) * 1000))
        cost = 0.0 if prepared.model is None else float(prepared.route["estimated_cost_usd"])
        return PipelineResult(prepared.request_id, prepared.sanitized_prompt, prepared.use_case, prepared.use_case_confidence, prepared.use_case_inferred, prepared.complexity, prepared.action, prepared.policy_key, prepared.policy_version, prepared.risk_tags, prepared.model, prepared.fallback_used, prepared.pii, prepared.injection, verification, claims, trust.score, trust.breakdown, cost, latency_ms, prepared.events, response, prepared.compounding_risk)


def _sanitize_output(value: str) -> str:
    return redact(value, find_pii(value)) if value else value


def _stronger_action(current: str, candidate: str) -> str:
    rank = {"ALLOW": 0, "EDIT": 1, "SANITIZE": 2, "FLAG": 3, "HUMAN_REVIEW": 4, "BLOCK": 5}
    return candidate if rank.get(candidate, 0) > rank.get(current, 0) else current


def _is_unsafe(toxicity: dict[str, Any], safety_strictness: str) -> bool:
    level = str(toxicity.get("level", "LOW"))
    return level == "HIGH" or (safety_strictness == "high" and level == "MEDIUM")


def _buffer_size(verification_mode: str, action: str, safety_strictness: str) -> int:
    # A strict/mandatory path trades a little latency for a larger safety window.
    if safety_strictness == "high" or verification_mode in {"on", "mandatory"} or action == "HUMAN_REVIEW":
        return 180
    if safety_strictness == "low":
        return 72
    return 120


def _verify_response(response: str, sources: list[dict[str, Any]], verification_mode: str, action: str) -> tuple[str, list[dict[str, Any]]]:
    if action in {"BLOCK", "HUMAN_REVIEW"} and not response.strip():
        return "NOT_RUN", []
    if verification_mode == "off":
        return "NOT_RUN", []
    claims = [claim.strip() for claim in re.split(r"(?<=[.!?])\s+", response.strip()) if len(claim.strip()) > 8][:8]
    if not claims:
        claims = ["No generated claim"]
    if sources:
        source_text = " ".join(str(source.get("text", "")) for source in sources).lower()
        citations = [source.get("id", "source") for source in sources]
        claim_details = []
        for claim in claims:
            meaningful = [token for token in re.findall(r"[a-z0-9]+", claim.lower()) if len(token) > 3][:4]
            overlap = sum(token in source_text for token in meaningful)
            verdict = "SUPPORTED" if overlap >= max(1, min(2, len(meaningful))) else "PARTIALLY_SUPPORTED" if overlap else "UNSUPPORTED"
            claim_details.append({"claim": claim[:300], "verdict": verdict, "confidence": .84 if verdict == "SUPPORTED" else .61 if verdict == "PARTIALLY_SUPPORTED" else .24, "citations": citations})
        overall = "SUPPORTED" if all(item["verdict"] == "SUPPORTED" for item in claim_details) else "UNSUPPORTED" if all(item["verdict"] == "UNSUPPORTED" for item in claim_details) else "PARTIALLY_SUPPORTED"
        return overall, claim_details
    return "UNVERIFIABLE", [{"claim": claim[:300], "verdict": "UNVERIFIABLE", "confidence": .72, "citations": []} for claim in claims]
