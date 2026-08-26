from prometheus_client import Counter, Histogram

REQUESTS = Counter("controlplane_requests_total", "Governed requests", ["action", "use_case"])
STAGE_LATENCY = Histogram("controlplane_stage_duration_ms", "Stage duration", ["stage"])
ASSISTANT_REQUESTS = Counter("controlplane_assistant_requests_total", "Assistant requests")
