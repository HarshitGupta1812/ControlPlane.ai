import re
from dataclasses import dataclass

from app.config import get_settings
from app.usecase.embeddings import lazy_embedding_match
from app.usecase.profiles import PROFILE_BY_KEY, PROFILES, UseCaseProfile


@dataclass(frozen=True)
class UseCaseResult:
    profile: UseCaseProfile
    confidence: float
    inferred: bool
    method: str
    scores: dict[str, float]


_STOPWORDS = {"the", "and", "for", "with", "this", "that", "our", "your", "you", "from", "what", "should", "please", "help", "about", "into", "then", "are", "how", "can"}


def detect_use_case(prompt: str, explicit: str | None = None, headers: dict[str, str] | None = None) -> UseCaseResult:
    if explicit:
        normalized = explicit.lower().replace(" ", "_")
        if normalized in PROFILE_BY_KEY:
            profile = PROFILE_BY_KEY[normalized]
            return UseCaseResult(profile, 1.0, False, "explicit_binding", {profile.key: 1.0})
        for candidate in PROFILES:
            if candidate.name.lower() == explicit.lower():
                return UseCaseResult(candidate, 1.0, False, "explicit_binding", {candidate.key: 1.0})
    headers = headers or {}
    hint = f"{headers.get('x-app-id', '')} {headers.get('x-channel', '')} {headers.get('x-use-case', '')}".lower()
    if hint:
        for profile in PROFILES:
            if profile.key.replace("_", " ") in hint or profile.name.lower() in hint:
                return UseCaseResult(profile, .94, False, "structural_hint", {profile.key: .94})
    lower = prompt.lower()
    prompt_tokens = set(re.findall(r"[a-z0-9]+", lower)) - _STOPWORDS
    scores: dict[str, float] = {}
    for profile in PROFILES:
        keyword_hits = sum(1 for keyword in profile.keywords if re.search(rf"\b{re.escape(keyword)}\b", lower))
        example_scores = []
        for example in profile.examples:
            example_tokens = set(re.findall(r"[a-z0-9]+", example.lower())) - _STOPWORDS
            overlap = len(prompt_tokens & example_tokens)
            example_scores.append(min(1.0, overlap / 2) if overlap else 0.0)
        keyword_score = min(.72, keyword_hits * .22)
        example_score = max(example_scores, default=0.0) * .34
        score = min(.96, keyword_score + example_score)
        if get_settings().detector_upgrades:
            score = max(score, min(.96, lazy_embedding_match(prompt, list(profile.examples))))
        scores[profile.key] = score
    best_key = max(scores, key=lambda candidate: scores[candidate])
    best_score = scores[best_key]
    if best_score >= .55:
        return UseCaseResult(PROFILE_BY_KEY[best_key], min(best_score + .2, .96), True, "semantic_match", scores)
    # Unmatched prompts fall back to internal knowledge so they still get answered
    # (PII/safety scans and verification flags still apply); they are not held for review.
    fallback = PROFILE_BY_KEY["internal_knowledge"]
    return UseCaseResult(fallback, .42, True, "restrictive_fallback", scores)
