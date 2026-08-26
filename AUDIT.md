# ControlPlane.ai — implementation audit

Audited against `uploads/FINAL_BUILD_PROMPT.md`.

## Verified

- Public landing page, crimson security-operations visual system, responsive glass UI, procedural R3F shield/network, scroll-aware transforms, Before/During/After ring scene, ten-stage graph, CTA, social links, product footer links, and mobile/lazy/offscreen scene handling.
- Separate Need Help assistant surface. The public landing assistant is product-only; authenticated assistant requests use JWT-scoped aggregate tools for recent requests, request detail, usage, and policies. The assistant has an explicit system prompt, product knowledge chunks, optional LiteLLM tool calling, streaming output, refusal behavior, and sanitized responses.
- Authenticated console with Playground, Dashboard, Live Pipeline, Replay, Policies, Traces, Review, Settings, persistent parameters tray, source attachment simulation, markdown/code response rendering, collapsible stage trace, responsive layouts, TanStack Query cache configuration, and local sanitized offline demo fallback.
- Ten-stage governance orchestrator with parallel pre-checks, input/session-window scanning, layered use-case detection, explicit/header/semantic/fallback paths, versioned policy selection, configurable PII action, safety strictness, max cost, risk fusion, streaming buffer gate, safe intervention fallback, source-aware verification, honest UNVERIFIABLE verdicts, claim detail, compounding risk with decay, trust breakdown, provider fallback, and typed SSE events.
- PostgreSQL-only SQLAlchemy schema with tenants, users, password reset tokens, API keys, sessions, requests, sanitized messages, append-only sequence-numbered events, policies, use cases, human review, feedback, model registry, and per-user usage rollups.
- JWT auth, direct BCrypt hashing compatible with current bcrypt releases, single-use expiring reset tokens, hashed gateway keys, tenant/user scoping, API key default use-case bindings, request ID validation, CORS allowlist, rate limits, input limits, sanitized event/log output, health/readiness, metrics, Docker/nginx, Railway `$PORT`, and migrations.
- API surface includes auth, governed SSE, assistant SSE, requests/events/replay/feedback, sessions, keys, use cases, policies/profiles/version/activate/simulate, analytics summary/timeseries/by-use-case/risks/models/violations/trust-breakdown/calibration, review, demo seed/reset, and OpenAI-compatible streaming/non-streaming completions.
- CI runs frontend build, pytest, ruff, and mypy.

## Bugs found and fixed during the audit

1. Fixed the missing `QueryClientProvider` closing tag in the frontend root.
2. Fixed Vite/TypeScript errors caused by request-store remote data wiring and API header typing.
3. Reworked auth to use the real API when available while preserving offline demo fallback; added reset-token handoff.
4. Added real relative SSE/API integration for Playground and Need Help.
5. Fixed public Need Help from exposing seeded account activity.
6. Fixed local request persistence to redact emails, phones, cards, and secrets before `localStorage` writes.
7. Fixed overlapping card/phone PII redaction that produced malformed output.
8. Replaced incompatible Passlib/Bcrypt runtime hashing with direct BCrypt material hashing.
9. Fixed the Prometheus instrumentator/FastAPI incompatibility that caused `/health` to return HTTP 500; retained reliable custom Prometheus metrics.
10. Added per-user rollup scoping so analytics cannot cross user boundaries within a tenant.
11. Added event sequence numbers for deterministic replay ordering.
12. Added UUID validation for request, key, and review IDs to prevent Postgres UUID query errors.
13. Added custom policy fusion maps, policy CRUD/version/activate routes, calibration analytics, API key lifecycle, password reset persistence, model registry seeding, and demo seed/reset routes.
14. Fixed customer-support/internal unverifiable responses to flag rather than silently allow; decision support remains review-or-block.
15. Added streaming safety gate enforcement, safe fallback intervention events, output redaction, provider timeout, Groq/Gemini routing, and fallback tracking.
16. Fixed replay playback controls, empty-state crashes, collapsible Playground traces, source attachment, and live API dashboard/request loading.

## Validation

```text
frontend: npm run build                 PASS
backend: pytest -q                      PASS
backend: ruff check app tests migrations PASS
backend: mypy app                      PASS
backend: Python compileall              PASS
backend: API import/OpenAPI             PASS
backend: /health                        PASS (HTTP 200)
```

Docker was not available in the execution sandbox, so `docker compose up --build` was not run here. Dockerfiles, Compose services, Postgres health dependency, nginx proxy, and `$PORT` startup behavior were statically checked.
