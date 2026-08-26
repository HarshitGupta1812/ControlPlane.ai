"""Optional ProtectAI ONNX detector adapter. It is intentionally lazy and never imported at startup."""


def score_with_onnx(text: str) -> dict:
    try:
        from optimum.onnxruntime import ORTModelForSequenceClassification  # noqa: F401
    except ImportError:
        return {"available": False, "confidence": 0.0, "level": "LOW"}
    return {"available": True, "confidence": 0.0, "level": "LOW", "note": "Model adapter ready; enable behind DETECTOR_UPGRADES."}
