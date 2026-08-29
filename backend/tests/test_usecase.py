from app.usecase.classifier import detect_use_case


def test_explicit_use_case_has_full_confidence() -> None:
    result = detect_use_case("summarize this", explicit="Customer Support")
    assert result.profile.key == "customer_support"
    assert result.confidence == 1.0
    assert result.inferred is False


def test_decision_support_semantic_match() -> None:
    result = detect_use_case("Should we approve this applicant based on eligibility?")
    assert result.profile.key == "decision_support"
    assert result.inferred is True


def test_safe_fallback_is_internal_knowledge() -> None:
    # Unmatched prompts fall back to internal knowledge so they are still
    # answered (scans/verification still apply), not held for human review.
    result = detect_use_case("Tell me something unrelated")
    assert result.profile.key == "internal_knowledge"
    assert result.inferred is True
    assert result.confidence < .55
