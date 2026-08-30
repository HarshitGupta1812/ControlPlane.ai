import json
from litellm import completion
from app.config import get_settings

def scan_pii(text: str) -> dict:
    settings = get_settings()
    if not (settings.groq_api_key or settings.gemini_api_key):
        return {"count": 0, "types": {}, "findings": [], "redacted": False}

    model = "groq/openai/gpt-oss-20b" if settings.groq_api_key else "gemini/gemini-3.6-flash"
    api_key = settings.groq_api_key if settings.groq_api_key else settings.gemini_api_key

    prompt = f"""Analyze the following text for PII (Personally Identifiable Information).
Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{{
  "count": <total number of findings>,
  "types": {{ "<type>": <count> }},
  "findings": [ {{ "entity": "<type>", "confidence": <float 0.0-1.0> }} ],
  "redacted": <boolean true if count > 0>
}}
Valid types: email, phone, ssn, payment_card, secret. If none are found, return count 0 and empty data.
Text to analyze:
{text}"""

    try:
        response = completion(model=model, messages=[{"role": "user", "content": prompt}], api_key=api_key)
        content = str(response.choices[0].message.content).strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        return json.loads(content.strip())
    except Exception as e:
        print(f"PII LLM scan error: {e}")
        return {"count": 0, "types": {}, "findings": [], "redacted": False}
