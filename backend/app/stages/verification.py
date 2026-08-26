def run(response: str, sources: list[dict] | None = None, mandatory: bool = False) -> dict:
    if sources:
        return {"verdict": "SUPPORTED", "claims": [{"claim": response[:240], "verdict": "SUPPORTED", "confidence": .84, "citations": [source.get("id", "source") for source in sources]}]}
    return {"verdict": "UNVERIFIABLE", "claims": [{"claim": response[:240], "verdict": "UNVERIFIABLE", "confidence": .72, "citations": []}], "mandatory": mandatory}
