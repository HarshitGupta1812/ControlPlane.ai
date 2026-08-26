"""Optional lazy semantic matcher. The MVP uses the keyword cascade and never blocks startup."""

from functools import lru_cache


@lru_cache(maxsize=1)
def _model():
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        return None
    return SentenceTransformer("BAAI/bge-small-en-v1.5")


def lazy_embedding_match(prompt: str, examples: list[str]) -> float:
    model = _model()
    if model is None or not examples:
        return 0.0
    vectors = model.encode([prompt, *examples], normalize_embeddings=True)
    return float(max(vectors[0] @ vector for vector in vectors[1:])) if len(vectors) > 1 else 0.0
