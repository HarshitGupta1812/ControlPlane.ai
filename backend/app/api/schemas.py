from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AuthSignUp(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(default="Workspace member", max_length=160)
    workspace_name: str = Field(default="My workspace", max_length=180)


class AuthSignIn(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class ForgotPassword(BaseModel):
    email: str


class ResetPassword(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class SourceInput(BaseModel):
    """A bounded source used only for response verification in the current demo."""

    id: str = Field(min_length=1, max_length=160)
    text: str = Field(min_length=1, max_length=12_000)


class ChatRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    use_case: str | None = None
    policy_key: str | None = None
    routing_preference: Literal["auto", "fast", "capable"] = "auto"
    pii_action: Literal["sanitize", "flag", "block"] = "sanitize"
    safety_strictness: Literal["low", "medium", "high"] = "medium"
    verification: Literal["auto", "on", "off"] = "auto"
    max_cost_usd: float | None = Field(default=None, ge=0)
    session_id: str | None = None
    sources: list[SourceInput] = Field(default_factory=list, max_length=10)

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            return str(UUID(value))
        except (ValueError, AttributeError) as exc:
            raise ValueError("session_id must be a UUID") from exc


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=3000)
    conversation: list[dict] = Field(default_factory=list, max_length=20)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    request_id: str
    sequence: int
    stage: str
    status: str
    duration_ms: int
    confidence: float | None
    data: dict
    ts: datetime


class RequestOut(BaseModel):
    id: str
    prompt: str
    use_case: str
    use_case_confidence: float
    use_case_inferred: bool
    complexity: str
    action: str
    policy_key: str
    policy_version: int
    risk_tags: list[str]
    model_served: str | None
    verification_verdict: str | None
    verification_claims: list[dict]
    trust_score: float
    trust_breakdown: dict
    tokens_in: int
    tokens_out: int
    cost_usd: float
    latency_ms: int
    compounding_risk: float
    status: str
    created_at: datetime


class FeedbackIn(BaseModel):
    label: Literal["true_positive", "false_positive", "false_negative", "helpful"]
    rule_key: str | None = None
    note: str | None = Field(default=None, max_length=1000)


class PolicySimulation(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    use_case: str | None = None
    policy_key: str | None = None


class PolicyVersionIn(BaseModel):
    policy_key: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    geography: str = Field(default="Global", max_length=120)
    sector: str = Field(default="All sectors", max_length=120)
    rules: dict = Field(default_factory=dict)
    active: bool = False


class ApiKeyCreate(BaseModel):
    label: str = Field(default="Production gateway key", min_length=1, max_length=120)
    default_use_case: str | None = Field(default=None, max_length=80)


class ReviewResolution(BaseModel):
    resolution: Literal["allow", "edit", "block", "dismiss"]
    note: str | None = Field(default=None, max_length=1000)
