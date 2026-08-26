# ControlPlane.ai — architecture confirmation

## Runtime shape

- **Frontend:** React 18 + TypeScript + Vite. A lazy-loaded React Three Fiber canvas renders the procedural shield/network on the public landing page; the authenticated console is a responsive app shell with local mock data for zero-key development and relative API calls for production.
- **API:** FastAPI with a small orchestration core. CPU-heavy pre-checks run in `asyncio.to_thread` and emit typed events. The LLM router is LiteLLM-compatible but lazy-imported, so `DEV_MOCK_LLM=true` is deterministic and offline.
- **Persistence:** PostgreSQL through SQLAlchemy 2. Requests and append-only events are the source of truth. `usage_daily` is the aggregate path for charts; no analytics endpoint loads a full request table.
- **Security:** JWT email/password auth for the console, separately hashed `cp_live_` keys for `/v1/chat/completions`, tenant predicates on all user data, sanitized event/log payloads, and an ephemeral redaction map.

## Event model

Each request emits the same ten stages: `request.received`, `pii.scan`, `injection.scan`, `complexity.classify`, `usecase.detect`, `policy.evaluate`, `routing.select`, `generation.stream`, `verification`, and `trust.calculated`. Every event stores status, duration, confidence, sanitized JSON, and a timestamp. This stream powers SSE, traces, replay, audit, and metrics.

## Data model

`users` belong to `tenants`; `api_keys`, `sessions`, `requests`, `feedback`, `human_review_queue`, and `usage_daily` carry tenant/user scope. Password reset tokens are hashed, expiring, and single-use. `requests` stores the sanitized prompt, policy snapshot, risk tags, model route, verification claims, trust breakdown, and cost/latency fields. `events` is append-only, has a per-request sequence, and has `(request_id, ts)` and `(request_id, sequence)` indexes. `policies` and `use_cases` are versioned/reference rows and never mutate an active history. Rollups are per tenant/user/day/use-case so the analytics boundary cannot leak workspace activity between users.

## Color / 3D plan

The visual language is a dark security-operations shell: `#0A0A0C` foundation, elevated charcoal glass, crimson `#FF3B4E` as control/brand, emerald for safe, amber for caution, danger red for blocked, and cyan for neutral model/data signals. The landing scenes are procedural low-poly geometry: an emissive icosahedron shield, inner core, orbiting nodes, connected lines, traveling packets, a Before/During/After three-ring scene, and a ten-stage node graph. React Three Fiber canvases are lazy-loaded, dpr-capped, reduced on mobile, and paused by IntersectionObserver when offscreen.
