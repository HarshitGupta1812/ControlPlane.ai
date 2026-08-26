PRODUCT_KNOWLEDGE = [
    {"title": "Pipeline", "text": "ControlPlane runs request.received, PII scan, injection scan, complexity classification, use-case detection, policy evaluation, routing, generation with a buffered safety gate, verification, and trust calculation."},
    {"title": "Verification", "text": "With retrieval sources, claims are checked against chunks. Without sources, the verdict is UNVERIFIABLE rather than pretending self-consistency is ground truth."},
    {"title": "Risk fusion", "text": "Correlated tags escalate together. Injection plus privacy blocks. Bias plus decision and hallucination plus decision route to human review."},
    {"title": "Assistant scope", "text": "Need Help explains the product and the authenticated user's own activity. It does not run the governance pipeline or act as a free-form chatbot."},
]


def search_knowledge(query: str, limit: int = 3) -> list[dict[str, str]]:
    words = set(query.lower().split())
    scored = sorted(PRODUCT_KNOWLEDGE, key=lambda item: sum(word in item["text"].lower() for word in words), reverse=True)
    return scored[:limit]
