# Final Master Build Prompt — ControlPlane.ai v3

> Copy everything below this line into a fresh chat to build the product.

---

## ROLE

You are a Principal AI Architect, Senior Product Designer, 3D/web engineer, and Full-Stack Developer building **ControlPlane.ai** — a **Real-Time Governance Layer for Enterprise AI** — from scratch in a fresh repository. Build a production-quality, maintainable, observable, premium product. First present a short architecture + data-model confirmation, then implement the complete MVP in clean, well-organized files. Do not copy earlier prototype code.

---

## PRODUCT VISION (three distinct surfaces)

1. **Public 3D animated landing page** (`/`) — no login required. A modern, premium, Gen-Z-oriented marketing site with **real 3D models** built in React Three Fiber (not just 2.5D CSS). Scroll drives the 3D scene: a shield/network that transforms to explain the before/during/after pipeline and the ten stages. Glassmorphism UI, custom logo, a top bar with **Try Now** and **Need Help**, and a footer with GitHub / Discord / Twitter.
2. **Floating "Need Help" assistant widget** — a small launcher button visible across the app; on click it opens a calm, formal ChatGPT/Claude-style chat panel. This assistant **only answers questions about ControlPlane AND is hooked to the logged-in user's recent activity** (recent requests, trust scores, violations, policy actions, usage) so it can answer questions like "why was my last request blocked?" or "what's my average trust score this week?". It refuses out-of-scope questions. It is NOT the governance pipeline.
3. **Governance console** (`/app/*`, auth-gated) — the actual product: a prompt **Playground** with a collapsible per-prompt parameters tray and a live pipeline panel; a premium **Dashboard**; **Live Pipeline**, **Replay**, **Policies**, **Traces**, **Review**, **Settings**.

The console's chat (the **Playground**) is where a user submits a prompt and watches it pass through Groq/Gemini with full governance. The floating assistant only explains the product and the user's own usage. Never conflate the two.

---

## COLOR & DESIGN SYSTEM (NOT the generic blue palette)

The previous design used common SaaS blue. Replace it with a **dark "security operations" palette centered on crimson red as the brand color**, with semantic green/orange/red and a cyan secondary accent. Red signals "control/security" (CrowdStrike-like), green = safe/supported, amber = caution, red = blocked/danger, cyan = informational/neutral data.

Design tokens (use as Tailwind theme colors and CSS variables):
- Background: `#0A0A0C` (app shell), with elevated surfaces `#121214` / `#1A1A1E`, borders `#26262C`.
- Brand primary: **crimson `#FF3B4E`** (buttons, active nav, logo mark, key accents), with a darker `#E11D33` for hover and a soft glow `rgba(255,59,78,.25)`.
- Success/safe: **emerald `#22C55E`** (trust high, allow, supported).
- Warning: **amber `#F59E0B`** (flag, medium risk, partial support).
- Danger: **red `#EF4444`** (block, high risk, intervention).
- Info/neutral data accent: **cyan `#22D3EE`** (model/route/cost, neutral metrics) so not every data point is red.
- Text: `#F5F5F7` primary, `#9A9AA2` muted.
- Use subtle crimson/cyan radial glows on the background; glassmorphism cards (`backdrop-blur`, translucent white-on-dark borders, soft shadows).
- Typography: Inter/system sans, tight headings, generous spacing, rounded-2xl cards, consistent 44px control heights, smooth but tasteful motion. Fully responsive.

The 3D scene should use emissive materials in the brand crimson/cyan/emerald palette against a dark void — glowing connected nodes, energy pulses traveling along edges, a protective shield mesh. Keep it elegant, not a Christmas tree; use color purposefully to map to pipeline status.

---

## THE 3D LANDING PAGE

Use **React Three Fiber + @react-three/drei + three.js**, with **Framer Motion** to tie scroll to 3D transforms. Build actual 3D geometry (procedurally — no external GLTF downloads required):
- **Hero:** a slowly rotating protective shield (icosahedron/sphere wireframe + inner glowing core) surrounded by orbiting nodes connected by thin glowing lines (a network). Small data packets travel along the edges toward the shield and either pass through or get blocked (color flips red) — visually explaining governance.
- **Scroll Section "Before / During / After":** camera and the model re-orient; the shield splits into three concentric layers that light up emerald (before), amber (during), cyan (after) as the section enters view.
- **Scroll Section "Pipeline Stages":** ten nodes representing the stages arrange into a vertical/diagonal graph; each lights up crimson/cyan as it enters the viewport with a label.
- **Features grid** below: glassmorphism cards (use-case profiles, trust score, replay, dashboard).
- **Final CTA:** "Try Now" → `/login` or `/app`; "Need Help" opens the floating assistant.
- **Top nav:** logo (custom shield mark + wordmark in crimson), anchor links, Need Help (ghost), Try Now (primary crimson).
- **Footer:** GitHub, Discord, Twitter icon links + product links.

Performance: lazy-load the R3F canvas with `React.lazy` + a Suspense fallback (a static gradient/shimmer). Use low-poly geometry, instanced meshes where possible, `dpr` capped, and pause rendering when off-screen. Mobile gets a lighter scene or a static rendered fallback. No heavy external model files.

---

## THE FLOATING PRODUCT ASSISTANT

- A floating action button (FAB) bottom-right, crimson with a subtle pulse, on every page after login (and on the landing page, where it answers general product questions).
- Click opens a glassmorphism chat panel (~380×560px) with a draggable-feeling header, message list, and composer. Calm, formal UI — no 3D inside the widget.
- **Scoped to product + the user's own data.** It must:
  - Answer questions about ControlPlane features, pipeline stages, policies, trust score, how to use the console.
  - Call authenticated backend endpoints to reference the **logged-in user's recent requests/sessions/usage** (e.g. "show my last 3 blocked prompts", "average trust this week", "which use case generated the most interventions", "replay summary for request X").
  - Refuse clearly out-of-scope questions (general knowledge, writing code unrelated to the product, any attempt to use it as a free-form chatbot or to bypass governance).
- Implement with a strict system prompt + a small product knowledge base (markdown docs chunked in memory; optional embeddings behind a flag) + a small set of **tools/functions** the assistant may call (`get_recent_requests`, `get_request_detail`, `get_usage_summary`, `list_policies`). The LLM (Groq/Gemini) decides when a tool call is needed; results are injected as context. Never expose raw DB rows; return sanitized summaries.
- Streaming responses with typing indicator; show a short "this assistant can answer product questions and your account usage" disclaimer.
- The assistant does NOT run the governance pipeline and cannot generate arbitrary LLM content outside the scoped system prompt.

---

## THE GOVERNANCE PROBLEMS AND HOW WE SOLVE THEM

This section is mandatory product logic. Implement all of it.

### Problem A — Different AI use cases with different risk/latency signatures
An enterprise runs many AIs (customer support, internal knowledge, decision-support) through one gateway; each needs different rules, models, budgets, and verification strictness.

**Solution — automatic Use-Case Detection with a layered cascade** (stage 4 of the pipeline), cheapest first:
1. **Explicit binding:** the API key/ integration is bound to a default use case, or the caller sets `use_case` / `X-Use-Case`. Highest confidence, no compute.
2. **Channel/structural hints:** headers (`X-App-Id`), session tags, attached documents.
3. **Semantic matching:** each use case stores representative example prompts; embed the (redacted) prompt with a small local embedding model (`BAAI/bge-small-en-v1.5`, lazy-loaded; cosine similarity), boosted by keyword hits.
4. **Safe fallback:** if confidence is below a threshold (default 0.55), assign the **most restrictive plausible use case**, mark `use_case_inferred=true` with low confidence, surface it in the UI for the user to correct, and feed corrections back as training examples.
The detected use case drives: which **policy** applies, the **routing matrix** (which model tier), **latency budget**, **verification strictness**, **trust weights**, and whether **human review** is mandatory. Three seeded use cases:
- **Customer Support:** low risk appetite, 3s budget, fast model, aggressive PII sanitize, strict streaming safety, UNVERIFIABLE = flag (never block the customer).
- **Internal Knowledge:** medium, 5s, balanced model, internal-person PII flagged not blocked, cost-aware.
- **Decision Support:** very low, 8s, most capable model, MANDATORY verification, UNVERIFIABLE/UNSUPPORTED → block or human review, full audit.

### Problem B — One prompt with multiple loopholes (overlapping risks)
A single prompt can contain PII AND a jailbreak AND ask for an unsafe answer; an AI-generated response can be simultaneously a hallucination and a privacy leak. Treating risks independently misses compounding danger and can double-count.

**Solution — risk tags + fusion engine.**
- Every finding carries **risk tags** (e.g. `privacy`, `injection`, `security`, `hallucination`, `bias`, `financial`, `decision`, `toxicity`).
- After individual detectors run, a **Risk Fusion** step evaluates tag **combinations** against the active policy's escalation map. Examples:
  - `privacy + hallucination` in a customer-facing response → BLOCK (fabricated personal detail is worse than either alone).
  - `injection + privacy` → BLOCK (attempt to exfiltrate PII).
  - `bias + decision` → HUMAN_REVIEW.
  - `hallucination + decision` → HUMAN_REVIEW.
  - `toxicity + minor` (age signals) → BLOCK.
- Escalation can raise an action (FLAG → BLOCK) and depresses the relevant trust components **once** (correlated, not double-counted). The trust breakdown shows which fused rule fired, so the score is explainable.
- Findings are also surfaced individually in the trace/replay so the reviewer sees the constituent signals.

### Problem C — No real-time ground truth for hallucination
The same knowledge gaps that cause hallucination make automatic verification hard.

**Solution — honest multi-strategy verification.** Stage 9:
1. If the use case has attached sources / retrieval enabled, verify claims against retrieved chunks → SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED with citations.
2. If no source exists, run claim extraction + LLM-as-judge self-consistency and label the verdict **UNVERIFIABLE** rather than pretending certainty. This honesty is a feature, not a limitation.
3. Decision-support mode treats UNVERIFIABLE and UNSUPPORTED as block/review per policy; customer support only flags.
4. Per-claim detail + confidence is stored and shown.

### Problem D — Alert fatigue vs liability (over/under-flagging)
**Solution — calibrated, versioned, simulatable policies.**
- Policies are versioned JSON profiles (never mutate history). Thresholds (injection confidence, streaming toxicity, trust-for-review) are per-use-case and tunable.
- A **Policy Simulator** runs any prompt through pre-checks + policy + use-case detection WITHOUT calling an LLM, showing the would-be action and which rules fired — admins tune safely.
- False-positive/negative feedback is captured per rule; a calibration view shows FP/FN rates per detector/use case so thresholds can be adjusted deliberately, and adjustments create a new policy version.
- Actions are tiered: ALLOW / EDIT / SANITIZE / FLAG / HUMAN_REVIEW / BLOCK, so the system rarely blocks when a flag suffices, but always blocks on high-confidence injection/fused risks.

### Problem E — Multi-turn and compounding risk
A bad turn can shape several downstream decisions.
- Detectors see the **full session window**, not just the last message (injection can arrive in a prior turn; PII can leak across turns).
- A **compounding session-risk score** rises with risky findings (configurable decay); crossing a threshold flags the whole session and can force re-verification or human review.
- Session-level risk is shown in the dashboard and traces. (Autonomous tool/agent actions are a non-goal for MVP, but the data model leaves room.)

### Problem F — Real-time interception is physically limited
Tokens already sent can't be unsent.
- A **streaming safety gate** buffers a configurable window (~20 tokens / ~120 chars) and scans it before release; on violation it cancels the upstream generator and streams a safe fallback + an `intervention` event. Buffer size is a per-use-case latency-vs-safety tradeoff, exposed in parameters.

### Problem G — Evolving regulations / geography/sector
- Policies carry `geography` and `sector` tags and are versioned; adding a rule = a new policy version, no deploy. The active version is referenced by every stored request for audit.

---

## CORE PIPELINE (event-sourced)

Every request gets a UUID; each stage emits a typed event (`running → ok|warn|blocked|error`) with `duration_ms`, `confidence`, sanitized JSON `data`. One event stream powers the pipeline panel, activity feed, audit, replay, metrics, and logs. Never persist/log raw PII/secrets (only entity type/span/confidence); the reversible redaction map is ephemeral per request in memory.

Stages (pre-checks PII/injection/complexity/use-case run **in parallel** with CPU work off the event loop; verification/trust run **after streaming** and update the record):
1. request.received
2. pii.scan — regex always; Presidio/GLiNER optional lazy upgrade.
3. injection.scan — heuristic always; ProtectAI `deberta-v3-base-prompt-injection-v2` ONNX (via Optimum) optional lazy upgrade; LOW/MED/HIGH + signals/confidence.
4. complexity.classify — LOW/MED/HIGH heuristic.
5. usecase.detect — layered cascade above.
6. policy.evaluate — versioned profile + risk fusion → ALLOW/EDIT/SANITIZE/FLAG/HUMAN_REVIEW/BLOCK.
7. routing.select — LiteLLM Router, per-use-case matrix, Groq primary → Gemini fallback, cost estimate, fallback events.
8. generation + streaming gate — async LiteLLM streaming through the buffered safety gate; toxicity heuristic always, ONNX RoBERTa optional; token windowing; batched event writes (never per-token DB rows).
9. verification — claim judge / retrieval / UNVERIFIABLE honesty.
10. trust.calculated — transparent weighted 0–100 with per-use-case weights and stored breakdown.

---

## TECH STACK

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, @react-three/fiber + @react-three/drei + three, framer-motion, react-router-dom, @tanstack/react-query, recharts, lucide-react, EventSource/fetch streaming. Build custom Tailwind UI primitives for uniform premium look.
**Backend:** Python 3.11, FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2, Alembic, LiteLLM (pin >=1.83.0, NO LangChain), structlog (Rich dev / JSON prod), prometheus-fastapi-instrumentator, python-jose + passlib[bcrypt], slowapi, Optimum/ONNX runtime lazily for detector upgrades, sentence-transformers lazily for use-case embeddings.
**DB:** PostgreSQL (Docker locally; Supabase/Railway in prod). No SQLite.
**Infra:** Docker (API + static UI via nginx or FastAPI StaticFiles), docker-compose with Postgres, Railway-ready honoring `$PORT`, env secrets.
**LLM:** Groq primary `groq/gpt-oss-20b`, Gemini backup `gemini/gemini-2.5-flash`. At least one key. `DEV_MOCK_LLM=true` for zero-key deterministic streaming dev responses (clearly labeled).
**Testing:** pytest (detectors, policy/fusion, use-case classifier, streaming API mock-gated), ruff, mypy. GitHub Actions CI.

---

## AUTH

JWT email/password auth: Sign Up, Sign In, Forgot Password, Reset Password, Sign Out. Bcrypt hashing; configurable expiry; single-use reset tokens (dev returns the link, prod returns a generic message). All `/api/*` data routes JWT-protected except auth/health/metrics; users see only their own sessions/requests/usage. The floating assistant uses the same JWT to read the user's scoped summary endpoints. OpenAI-compatible `/v1/chat/completions` uses a separate hashed API key for programmatic access.

---

## PERFORMANCE (avoid the earlier slow dashboard)

- All analytics endpoints use **SQL aggregates** (`func.count/avg/sum`, `GROUP BY`, date windows) — never load full ORM rows into Python.
- A `usage_daily` rollup table powers KPI/charts; provide a refresh function.
- Connection pool: `pool_size=5, max_overflow=10, pool_pre_ping=True, pool_recycle=1800, connect_timeout=10`.
- Composite indexes on `(tenant_id,created_at)`, `(user_id,created_at)`, `(use_case,created_at)`, `events(request_id,ts)`.
- Column pruning + keyset/offset pagination on list/traces.
- Frontend: only the activity feed polls (~5s); KPI/charts use TanStack `staleTime` 30–60s. Lazy-load the 3D bundle.
- Heavy ML detectors lazy-load behind feature flags and never block startup.

---

## API SURFACE

`/api/auth/*`; `/api/assistant/stream` (scoped product+usage assistant SSE with tool calls); `/api/chat/stream` (typed SSE: stage/token/intervention/post/done/error); `/v1/chat/completions` (OpenAI-compatible); `/api/sessions`; `/api/requests` (paginated list/`{id}`/events/replay/feedback); `/api/use-cases` (+ /detect); `/api/policies` (+profiles, version PUT, activate, simulate); `/api/analytics/*` (summary/timeseries/by-use-case/risks/models/violations/trust-breakdown — all SQL-aggregated); `/api/activity/live`; `/api/human-review` (+resolve); assistant data tools exposed as `/api/me/usage-summary`, `/api/me/recent-requests`, `/api/requests/{id}` (already scoped); `/health`, `/health/ready`, `/metrics`; dev-only `/api/demo/seed|reset`. CORS allowlist, rate limits, max prompt size, `X-Request-ID` on all responses.

---

## DATABASE

Postgres + SQLAlchemy 2 + Alembic. Tables: `users`, `tenants`, `api_keys`, `sessions(user_id)`, `requests` (full governance record: use_case key/id/confidence/inferred, complexity, policy action/version/risk_tags, model served/fallback, PII/injection summaries JSONB, verification verdict/claims, all score components + trust_breakdown JSONB, tokens, cost, latency/ttfb, compounding_risk, human_review_status, status, error, timestamps), `messages`, `events` (append-only: request_id, stage, status, duration_ms, confidence, data JSONB, ts), `policies` (versioned, active, geography/sector, rules JSONB), `use_cases`, `human_review_queue`, `feedback`, `models_registry`, `usage_daily` rollups. Proper FKs, timestamps, composite indexes. Seed three use cases/policies and optional demo traffic owned by a dedicated demo user (never surfaced to real users).

---

## FRONTEND PAGES & UX

- **Landing `/`** — R3F 3D hero + scroll story + features + CTA + footer, glassmorphism, crimson palette.
- **Auth** — single centered card with internal tabs (Sign In/Sign Up/Forgot/Reset), no top nav, no heading anchor icons.
- **App shell** — persistent left sidebar (crimson shield logo, nav: Playground, Dashboard, Live Pipeline, Replay, Policies, Traces, Review, Settings; user email + Sign Out). The floating Need-Help FAB over every screen.
- **Playground `/app`** — center composer; collapsible Parameters tray (use case, policy, routing preference auto/fast/capable, PII action sanitize/block/flag, safety strictness low/med/high → streaming threshold, verification auto/on/off, max cost) with Hide/Show persisted to localStorage; response bubbles with markdown + syntax highlighting; metadata footer (Trust prominent emerald/amber/red, Safety, Privacy, Accuracy, verdict, model, latency, cost) and a collapsible per-message stage trace; right-side live pipeline panel animating stages from SSE; typing indicator.
- **Dashboard `/app/dashboard`** — KPI cards with sparklines/deltas; volume-vs-trust chart; live activity feed; violations table; model usage/cost; trust breakdown; risk summary; use-case filter.
- **Live Pipeline `/app/pipeline`** — animated stage graph for a selected request.
- **Replay `/app/replay`** — picker + play/pause/step scrubber through events.
- **Policies `/app/policies`** — versioned list + simulator (prompt → detected use case + decision + would-be action + cost/latency, no generation).
- **Traces `/app/traces`** — filterable table → detail drawer with event timeline.
- **Review `/app/review`** — human-review triage queue.
- **Settings `/app/settings`** — non-sensitive runtime status only; NO API key inputs, NO localhost URL fields, NO deploy button.
- Empty states with sample prompts; seeded demo data for the demo user only.

---

## SECURITY & OBSERVABILITY

- PII never in logs/events/DB raw; ephemeral redaction map restored into final response per policy.
- Bcrypt, JWT secret from env, CORS allowlist, rate limiting, input validation, server-owned model routing, non-root Docker, `.dockerignore`, pinned deps.
- Frontend only knows `VITE_API_BASE_URL`; Groq/Gemini keys and DB URL live only on the API.
- structlog with correlation IDs; Prometheus histograms/counters per stage; sanitizer runs on every log/event.
- `/metrics` for Prometheus; health/readiness checks.

---

## PROJECT STRUCTURE

```
controlplane/
  backend/
    pyproject.toml, alembic.ini, .env.example, Dockerfile
    app/{main,config}.py
    app/api/{deps,schemas,routes/...}
    app/core/{context,orchestrator,events,stream}.py
    app/stages/{pii,injection,complexity,usecase,policy,routing,generation,verification,trust}.py
    app/detectors/{base,regex_pii,heuristics,injection_onnx,toxicity,presidio_adapter}.py
    app/llm/{models,router}.py
    app/policies/{profiles,engine,simulator}.py
    app/usecase/{profiles,classifier,embeddings}.py
    app/trust/engine.py
    app/db/{session,models,repositories,rollups}.py
    app/observability/{logging,metrics,middleware}.py
    app/security/{keys,redaction,sanitization,auth}.py
    app/assistant/{system_prompt,knowledge,tools}.py
    app/seed.py
    migrations/  tests/
  frontend/
    package.json, vite.config.ts, tailwind.config.ts, tsconfig.json, index.html, Dockerfile, nginx.conf
    src/{main,App}.tsx
    src/api/ (client, sse, assistant)
    src/auth/ (context, ProtectedRoute)
    src/components/ (ui primitives, sidebar, fab, chat, pipeline, charts, kpi, three/)
    src/three/ (HeroScene, ShieldNetwork, PipelineGraph, scroll hooks)
    src/pages/ (Landing, Login, Playground, Dashboard, LivePipeline, Replay, Policies, Traces, Review, Settings)
    src/styles/
  docker-compose.yml  README.md
```

---

## DELIVERY REQUIREMENTS

Build the complete MVP: 3D landing (real R3F geometry, scroll-linked), floating Need-Help assistant wired to the user's usage, full auth, event-sourced parallel pipeline with the layered use-case detection, risk fusion, honest verification, streaming Playground with collapsible parameters, premium crimson/emerald/amber/cyan dark dashboard, live pipeline, replay, policies/simulator, traces, review, settings, and performant SQL analytics. Include tests for detectors, risk-fusion policy, use-case classifier, and the streaming API (mock-gated). It must run with one command (`docker compose up`) and work with a free Groq key; `DEV_MOCK_LLM=true` must allow fully offline UI/demo development.

Finish with: run instructions, a list of every file created, the environment-variable reference, and a 90-second demo script that shows the 3D landing → Try Now → sign up → a PII prompt → a fused-risk jailbreak prompt → decision-support low-trust review → dashboard → replay → the Need-Help assistant answering "why was my last request blocked?".

**Non-goals:** multi-step agents/tools, fine-tuning, SSO/SAML, Turing-complete policy DSL, on-prem packaging, external GLTF model downloads. Build it focused, fast, and premium.

Begin by presenting a concise architecture + data-model + color/3D plan for confirmation, then implement.
