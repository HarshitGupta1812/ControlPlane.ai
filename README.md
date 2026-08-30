# ControlPlane.ai

**A real-time governance layer that sits between your prompts and your language models.**

Every request that passes through ControlPlane is scanned for risk, matched to a policy,
routed to the right model, streamed through a safety gate, checked against its sources,
scored for trustworthiness, and written to an append-only audit ledger you can replay
step by step. Nothing about a model's decision stays a black box.

---

## Table of Contents

- [What it is](#what-it-is)
- [The problem it solves](#the-problem-it-solves)
- [Key capabilities](#key-capabilities)
- [System architecture](#system-architecture)
- [The ten-stage governance pipeline](#the-ten-stage-governance-pipeline)
- [How the hard parts work](#how-the-hard-parts-work)
  - [1. Use-case detection](#1-use-case-detection)
  - [2. Policy evaluation and risk fusion](#2-policy-evaluation-and-risk-fusion)
  - [3. Model routing and provider failover](#3-model-routing-and-provider-failover)
  - [4. The streaming safety gate](#4-the-streaming-safety-gate)
  - [5. Source grounding and claim verification](#5-source-grounding-and-claim-verification)
  - [6. The trust score](#6-the-trust-score)
  - [7. Compounding session risk](#7-compounding-session-risk)
  - [8. Event sourcing and decision replay](#8-event-sourcing-and-decision-replay)
- [Security and privacy](#security-and-privacy)
- [Technology stack](#technology-stack)
- [Repository layout](#repository-layout)
- [Data model](#data-model)
- [API reference](#api-reference)
- [OpenAI-compatible gateway](#openai-compatible-gateway)
- [Configuration](#configuration)
- [Running the project](#running-the-project)
- [Testing](#testing)
- [Observability](#observability)
- [Optional ML upgrades](#optional-ml-upgrades)

---

## What it is

ControlPlane is a proxy for AI inference. Your application talks to ControlPlane instead
of talking to a model provider directly. ControlPlane inspects the prompt, decides what
is allowed, calls the model on your behalf, watches the output as it streams, and keeps a
complete record of why every decision was made.

It ships as three services:

| Service | Technology | Responsibility |
| --- | --- | --- |
| **Console** (`/frontend`) | React 18 + Vite, served by Nginx | Landing page, authentication, the governed **Playground**, analytics **Dashboard**, **Decision Replay**, the **Audit Log**, and the **Human Review** queue. |
| **API** (`/backend`) | FastAPI on Python 3.11 | The governance orchestrator, risk detectors, policy engine, model router, verification engine, event store, and a public OpenAI-compatible gateway. |
| **Database** | PostgreSQL 16 | Relational store for tenants, policies, and requests, plus an append-only event ledger. |

---

## The problem it solves

Putting a language model into production raises questions that the model itself cannot answer:

- **Is this prompt safe to run?** It might contain personal data, a prompt-injection attack, or a request for a high-stakes decision that a human should sign off on.
- **Which model should handle it, and what does it cost?** A refund email and a loan-approval analysis have different quality and latency needs.
- **Can I trust the answer?** Language models invent facts. An answer with no supporting source is not the same as one backed by a document.
- **What happened, and can I prove it?** When an auditor asks why a particular answer was allowed six weeks ago, "the model decided" is not an acceptable response.

ControlPlane answers all four for every single request, in real time, with a latency
budget measured in tens of milliseconds for the pre-flight checks.

---

## Key capabilities

- **Ten-stage deterministic pipeline** runs on every request, emitting one typed event per stage.
- **Layered risk detection** — PII and secrets, prompt injection, toxicity, and prompt complexity.
- **Intent-aware policy routing** — the prompt is classified into a use case, which selects a versioned policy profile.
- **Risk fusion** — overlapping signals (for example *injection + PII*) escalate to a stronger action than either signal alone; fusion rules can only tighten a decision, never loosen it.
- **Six-level action ladder** — `ALLOW → EDIT → SANITISE → FLAG → HUMAN_REVIEW → BLOCK`.
- **Streaming safety gate** — output is buffered in a small window and released only after it clears a toxicity check; an unsafe window is cancelled atomically before a single token reaches the client.
- **Source-grounded verification** — attach a document and ControlPlane feeds it to the model *and* uses an LLM grader to check every generated claim against it (`SUPPORTED` / `PARTIALLY_SUPPORTED` / `UNSUPPORTED`), with a lexical fallback when no provider is available.
- **Transparent trust score** — a 0–100 index computed from a weighted, per-use-case breakdown of privacy, safety, accuracy, and policy fit. No opaque confidence numbers.
- **Compounding session risk** — repeated risky prompts in one session raise a decaying risk score that can force human review.
- **Append-only event sourcing** — every stage is stored as an immutable event, so any past decision can be replayed exactly without calling a model again.
- **Provider-agnostic routing with failover** — Groq primary, Google Gemini fallback, or the reverse, selected from configured keys; a deterministic offline mode needs no keys at all.
- **Multi-tenant and stateless** — JWT sessions and separately hashed gateway keys; every query is scoped to a tenant and user, so the API scales horizontally with no session store.
- **OpenAI-compatible endpoint** — point an existing OpenAI SDK at `/v1/chat/completions` and get governance for free, including a `governance` block on every response.

---

## System architecture

```mermaid
flowchart LR
    subgraph Client
      B[Browser Console]
      SDK[Your app / OpenAI SDK]
    end

    subgraph Edge
      NG[Nginx<br/>static + reverse proxy]
    end

    subgraph API["FastAPI service"]
      MW[Correlation + rate-limit<br/>middleware]
      OR[Governance Orchestrator]
      RT[Model Router]
    end

    subgraph Data
      PG[(PostgreSQL 16<br/>requests + append-only events)]
    end

    subgraph Providers
      GQ[Groq]
      GM[Google Gemini]
    end

    B -->|HTTPS| NG
    SDK -->|/v1| NG
    NG -->|/api, /v1| MW --> OR
    OR --> RT
    RT --> GQ
    RT --> GM
    OR --> PG
```

- The **console** is a static build. Nginx serves it and reverse-proxies `/api` and `/v1` to the API container, so the browser only ever talks to one origin.
- The **API** is stateless. Correlation IDs (`X-Request-ID`) flow through every log line and response header.
- **PostgreSQL** holds a summary row per request plus a stream of immutable stage events.
- **Model providers** are reached through a single router; the app code never imports a provider SDK directly for chat generation.

### Request lifecycle (end to end)

This is exactly what happens when the Playground submits `POST /api/chat/stream`.
Stages 2–5 run **concurrently in worker threads**; everything else is ordered.

```mermaid
sequenceDiagram
    autonumber
    participant U as Console
    participant N as Nginx
    participant O as Orchestrator
    participant D as Detectors (threads)
    participant P as Policy Engine
    participant R as Model Router
    participant M as Model provider
    participant G as Safety Gate
    participant V as Verification judge
    participant DB as PostgreSQL

    U->>N: POST /api/chat/stream (SSE)
    N->>O: proxied request + X-Request-ID
    O-->>U: event: context (request_id, session_id)
    O->>O: redact PII from prompt for logging
    par concurrent pre-flight
        O->>D: scan_pii / scan_injection
        O->>D: classify_complexity / detect_use_case
    end
    D-->>O: risk signals + use case
    O-->>U: event: stage x4 (pii, injection, complexity, usecase)
    O->>P: evaluate(profile, tags, fusion, session risk, cost cap)
    P-->>O: one action (ALLOW … BLOCK)
    O-->>U: event: stage (policy.evaluate)
    alt action is BLOCK or HUMAN_REVIEW
        O-->>U: event: stage (routing.select, model = null)
        O-->>U: event: intervention
    else generation allowed
        O->>R: select(model_tier, preference)
        R-->>O: {model, fallback, cost}
        O-->>U: event: stage (routing.select)
        O->>M: stream(prompt + sources + system prompt)
        loop each token
            M-->>G: token
            G->>G: toxicity check on rolling buffer
            alt buffer clears
                G-->>U: event: token (text)
            else buffer unsafe
                G-->>U: event: intervention (window withheld)
            end
        end
    end
    O->>V: grade each claim vs sources  (worker thread)
    V-->>O: verdict + per-claim citations
    O-->>U: event: stage (verification)
    O->>O: compute weighted trust score
    O-->>U: event: stage (trust.calculated)
    O->>DB: persist request + all events (one transaction)
    O-->>U: event: post  →  event: done
```

### SSE event types on `/api/chat/stream`

| Event | Emitted when | Key fields |
| --- | --- | --- |
| `context` | Immediately | `request_id`, `session_id`, `scope` |
| `stage` | After each of the ten stages | `stage`, `status` (`ok` / `warn` / `blocked`), `duration_ms`, `confidence`, `data` |
| `token` | Each time the safety gate releases a buffer window | `text` |
| `intervention` | Gate cancels output, or the request is held / blocked | `reason`, `fallback` |
| `post` | After verification and trust | `verification`, `trust_score`, `trust_breakdown`, `risk_tags` |
| `done` | Final frame | `action`, `model`, `latency_ms`, `cost_usd`, `trust_score` |
| `error` | Pipeline or persistence failure (fails safe) | `code`, `message` |

---

## The ten-stage governance pipeline

Every call to `POST /api/chat/stream` (and the OpenAI gateway) runs the same ordered pipeline.
Each stage emits a Server-Sent Event so the console can render the decision live.

```mermaid
flowchart TD
    A["1 · request.received<br/><small>prompt accepted, payload redacted for logging</small>"]
    B["2 · pii.scan<br/><small>emails, phones, cards, SSNs, secrets</small>"]
    C["3 · injection.scan<br/><small>jailbreak / prompt-injection heuristics</small>"]
    D["4 · complexity.classify<br/><small>LOW / MEDIUM / HIGH by length and clauses</small>"]
    E["5 · usecase.detect<br/><small>customer_support / internal_knowledge / decision_support</small>"]
    F["6 · policy.evaluate<br/><small>versioned profile + risk fusion → one action</small>"]
    G["7 · routing.select<br/><small>model, fallback, cost estimate</small>"]
    H["8 · generation.stream<br/><small>buffered safety gate releases or cancels output</small>"]
    I["9 · verification<br/><small>LLM grounding judge vs attached sources</small>"]
    J["10 · trust.calculated<br/><small>weighted 0–100 score with full breakdown</small>"]

    A --> B --> C --> D --> E --> F --> G --> H --> I --> J

    classDef gate fill:#111827,stroke:#ef4444,stroke-width:2px,color:#fff;
    classDef step fill:#111827,stroke:#3b82f6,stroke-width:2px,color:#fff;
    classDef done fill:#111827,stroke:#22c55e,stroke-width:2px,color:#fff;
    class A,B,C,D,E,G,I step;
    class F,H gate;
    class J done;
```

| # | Stage | What happens | Can stop the request? |
| --- | --- | --- | --- |
| 1 | `request.received` | The prompt is accepted; a redacted copy is prepared for logging so raw PII never reaches the event store. | No |
| 2 | `pii.scan` | Detects personal data and secrets. Runs in a worker thread, in parallel with stages 3–5. | Via policy |
| 3 | `injection.scan` | Regex heuristics for "ignore previous instructions", system-prompt extraction, role override, and data exfiltration. `HIGH` confidence is a hard security boundary. | Yes (`BLOCK` on `HIGH`) |
| 4 | `complexity.classify` | Word count and clause count → `LOW` / `MEDIUM` / `HIGH`. `HIGH` complexity flags the request for verification. | Via policy |
| 5 | `usecase.detect` | Classifies the operational intent. Drives which policy, verification mode, and model tier apply. | No |
| 6 | `policy.evaluate` | Applies the versioned policy profile, adds risk tags, runs fusion rules, folds in session risk and cost caps. Produces exactly one action. | Yes |
| 7 | `routing.select` | Chooses the primary model and a fallback, and estimates cost. Skipped (model = `null`) if the request is already blocked or held. | No |
| 8 | `generation.stream` | Streams tokens through the safety gate. An unsafe buffer window is withheld and the request is downgraded to `FLAG`. | Yes (gate intervention) |
| 9 | `verification` | Splits the answer into claims and grades each one against attached sources. No source → `UNVERIFIABLE`. Contradicted → `UNSUPPORTED`, which escalates the action. | Via policy |
| 10 | `trust.calculated` | Computes the final 0–100 trust score and its breakdown, then persists the whole request and its events in one transaction. | No |

---

## How the hard parts work

### 1. Use-case detection

Different traffic needs different rules. A support-reply draft and a loan decision cannot
share one policy. The classifier ([`app/usecase/classifier.py`](backend/app/usecase/classifier.py))
resolves intent through a four-step cascade — the first step that produces a confident
answer wins.

```mermaid
flowchart TD
    IN([prompt + headers]) --> EX{caller passed<br/>use_case?}
    EX -- yes --> EXR[explicit_binding<br/>confidence 1.0]
    EX -- no --> HD{header hint<br/>X-Channel / X-Use-Case<br/>names a profile?}
    HD -- yes --> HDR[structural_hint<br/>confidence 0.94]
    HD -- no --> SM[score each profile:<br/>keyword hits + example overlap]
    SM --> BEST{best score<br/>≥ 0.55?}
    BEST -- yes --> SMR[semantic_match<br/>confidence = score + 0.2]
    BEST -- no --> FB["restrictive_fallback<br/>internal_knowledge, confidence 0.42"]
    EXR --> OUT([use-case profile])
    HDR --> OUT
    SMR --> OUT
    FB --> OUT
```

| Step | Trigger | Confidence | Method label |
| --- | --- | --- | --- |
| 1 — Explicit binding | caller sent `use_case` | 1.0 | `explicit_binding` |
| 2 — Structural hint | request header names a profile | 0.94 | `structural_hint` |
| 3 — Semantic match | best keyword + example score ≥ 0.55 | score + 0.2 | `semantic_match` |
| 4 — Safe fallback | nothing matched confidently | 0.42 | `restrictive_fallback` → still answered, scans and verification still apply |

Three built-in profiles ([`app/usecase/profiles.py`](backend/app/usecase/profiles.py)):

| Profile | Risk appetite | Latency budget | Verification | Default PII action | Model tier |
| --- | --- | --- | --- | --- | --- |
| `customer_support` | low | 3 s | flag if unverifiable | sanitise | fast |
| `internal_knowledge` | medium | 5 s | balanced | flag | balanced |
| `decision_support` | very low | 8 s | mandatory | block | capable |

### 2. Policy evaluation and risk fusion

Each use case maps to a **versioned policy profile** ([`app/policies/profiles.py`](backend/app/policies/profiles.py)):

| Key | Name | Sector | PII rule | Unverifiable rule | Unsupported rule |
| --- | --- | --- | --- | --- | --- |
| `CP-CS-14` | Customer Support Guardrails | Consumer | `SANITISE` | `FLAG` | — |
| `CP-IK-07` | Internal Knowledge Balanced | Enterprise | `FLAG` | `FLAG` | — |
| `CP-DS-11` | Decision Support Strict | Financial Services | `BLOCK` | `HUMAN_REVIEW` | `BLOCK` |

The engine ([`app/policies/engine.py`](backend/app/policies/engine.py)) collects **risk tags**
(`privacy`, `injection`, `toxicity`, `decision`, `bias`, `hallucination`, `minor`, `financial`)
and then applies **fusion rules** — combinations that are worse than the sum of their parts:

| Combination | Action | Reasoning |
| --- | --- | --- |
| `privacy` + `hallucination` | `BLOCK` | A fabricated answer that also touches personal data is the worst case. |
| `injection` + `privacy` | `BLOCK` | An injection attempt next to PII looks like data exfiltration. |
| `bias` + `decision` | `HUMAN_REVIEW` | A consequential decision using protected attributes needs a person. |
| `hallucination` + `decision` | `HUMAN_REVIEW` | An unverifiable claim must not drive a real decision unchecked. |
| `toxicity` + `minor` | `BLOCK` | Toxic content in a context involving a minor is never released. |

**How one action is chosen.** Actions sit on a ladder; every rule merges with
"stronger wins", so a policy version can *explain or tighten* a block but never weaken one.

```mermaid
flowchart LR
    A[ALLOW] --> E[EDIT] --> S[SANITISE] --> F[FLAG] --> H[HUMAN_REVIEW] --> B[BLOCK]
    style A fill:#064e3b,stroke:#22c55e,color:#fff
    style E fill:#134e4a,stroke:#2dd4bf,color:#fff
    style S fill:#1e3a5f,stroke:#38bdf8,color:#fff
    style F fill:#78350f,stroke:#f59e0b,color:#fff
    style H fill:#7c2d12,stroke:#fb923c,color:#fff
    style B fill:#7f1d1d,stroke:#ef4444,color:#fff
```

```mermaid
flowchart TD
    START([tags + policy rules]) --> PII{PII present?}
    PII -- yes --> PIIA["max(requested PII action, policy PII rule)"]
    PII -- no --> INJ
    PIIA --> INJ{injection HIGH?}
    INJ -- yes --> INJB["escalate to BLOCK (hard boundary)"]
    INJ -- no --> TOX
    INJB --> TOX{toxicity HIGH?}
    TOX -- yes --> TOXB["escalate to BLOCK"]
    TOX -- no --> VER
    TOXB --> VER{verification UNSUPPORTED / UNVERIFIABLE?}
    VER -- yes, decision context --> VERH["escalate to at least HUMAN_REVIEW"]
    VER -- yes, other --> VERF["escalate to policy unverifiable rule"]
    VER -- no --> CX
    VERH --> CX{complexity HIGH?}
    VERF --> CX
    CX -- yes --> CXF["escalate to FLAG"]
    CX -- no --> FUSE
    CXF --> FUSE[apply fusion rules on tag pairs]
    FUSE --> OUT([final action = strongest reached])
```

A tenant can also register its own policy versions and activate them per key; the
same "stronger wins" merge applies, so custom rules can only add constraints.

### 3. Model routing and provider failover

The router ([`app/llm/router.py`](backend/app/llm/router.py)) is the only place that speaks to a provider.

```mermaid
flowchart TD
    REQ([generation requested]) --> MOCK{DEV_MOCK_LLM = true?}
    MOCK -- yes --> CANNED[return use-case canned answer<br/>no network call]
    MOCK -- no --> KEYS{any provider key set?}
    KEYS -- no --> RAISE[raise: no provider configured<br/>never fake an answer]
    KEYS -- yes --> SEL{Groq key present?}
    SEL -- yes --> P1[primary = groq/openai/gpt-oss-20b<br/>fallback = gemini/gemini-3.6-flash]
    SEL -- no --> P2[primary = gemini/gemini-3.6-flash<br/>fallback = groq/openai/gpt-oss-20b]
    P1 --> TRY[stream primary]
    P2 --> TRY
    TRY -- ok --> DONE([tokens streamed])
    TRY -- error --> FB[set fallback_used = true<br/>stream fallback]
    FB -- ok --> DONE
    FB -- error --> SAFE[emit labelled deterministic notice]
```

| Concern | Behaviour |
| --- | --- |
| **Primary model** | `groq/openai/gpt-oss-20b` whenever a Groq key is configured. |
| **Fallback model** | `gemini/gemini-3.6-flash`. Only with no Groq key does Gemini become primary. |
| **Failover** | If the primary stream raises, the router retries the fallback and sets `fallback_used`. If both fail, it emits a clearly-labelled deterministic message — never a canned answer dressed up as real output. |
| **Cost estimate** | `~$0.0022` for the fast tier, `~$0.0148` for the capable tier; surfaced in `routing.select` and enforced against the per-request cost cap. |
| **Gemini transport** | Streamed directly over `httpx` with the `x-goog-api-key` header, so current Google AI Studio `AQ.…` keys work. Groq goes through LiteLLM. |
| **Use-case system prompts** | A per-use-case system prompt is prepended so identical models produce different output shapes — an empathetic numbered support reply vs. a formal Pros / Cons / Recommendation memo. |
| **Offline mode** | `DEV_MOCK_LLM=true` returns a use-case-appropriate canned response with no network call, so the whole product is demonstrable with zero keys. |

### 4. The streaming safety gate

A governance layer must not let unsafe text reach the user *while it is still deciding*.
The gate ([`app/stages/generation_gate.py`](backend/app/stages/generation_gate.py)) holds a
small rolling buffer. Each incoming token is toxicity-checked together with the buffered
window before anything is released.

```mermaid
stateDiagram-v2
    [*] --> Buffering
    Buffering --> Buffering: token clears check<br/>(append, window &lt; buffer size)
    Buffering --> Released: window reaches buffer size<br/>→ emit event: token
    Released --> Buffering: keep streaming
    Buffering --> Cancelled: token + window fails toxicity check
    Released --> Cancelled: trailing window fails final check
    Cancelled --> [*]: clear buffer, emit intervention,<br/>downgrade action to FLAG (+toxicity tag)
    Buffering --> Flushed: stream ends cleanly
    Released --> Flushed: stream ends cleanly
    Flushed --> [*]
```

| Buffer size | Applies when |
| --- | --- |
| 20 chars (minimum) | `LOW` strictness, no verification pressure |
| ~120 chars | default (`MEDIUM` strictness) |
| widened further | `HIGH` strictness, mandatory verification, or a request already held for review |

- **Clear** → the window is released to the client once it reaches the buffer size.
- **Unsafe** → the buffer is cleared, the gate is cancelled atomically, no further tokens are released, and the request is downgraded to `FLAG` with a `toxicity` tag. The user receives an intervention notice, not the withheld text.

### 5. Source grounding and claim verification

Attach a document in the Playground and two things happen: the text is **fed to the model**
so it can answer from the document, and the answer is then **graded claim by claim** against
that same document.

```mermaid
flowchart TD
    F[attached file] --> EXT{file type}
    EXT -- PDF --> PDFJS[browser extracts text<br/>via pdfjs-dist lazy chunk]
    EXT -- txt / md / csv / json --> RAW[read directly]
    PDFJS --> SRC[source text, capped at 20k chars]
    RAW --> SRC
    SRC --> GEN["prepended to generation prompt:<br/>answer only from these sources"]
    GEN --> ANS[model answer]
    ANS --> SPLIT[split into up to 8 claims]
    SPLIT --> JUDGE{LLM grounding judge<br/>available?}
    JUDGE -- yes --> LLM[grade each claim:<br/>SUPPORTED / PARTIALLY / UNSUPPORTED]
    JUDGE -- no / failed --> LEX[token-overlap heuristic<br/>vocab hit-ratio vs source]
    LLM --> ROLL[roll up to one verdict + citations]
    LEX --> ROLL
    ROLL --> OUT([verification stage event])
```

- The LLM grounding judge uses Groq primary / Gemini fallback and is instructed to judge **only** against the source, not outside knowledge.
- The lexical fallback grades by how much of each claim's vocabulary (tokens of 4+ chars) appears in the source: `≥ 0.5` → `SUPPORTED`, `≥ 0.2` → `PARTIALLY_SUPPORTED`, else `UNSUPPORTED`.
- The verifier runs off the event loop in a worker thread, so it never blocks other requests.

| Situation | Verdict | Typical effect |
| --- | --- | --- |
| No source attached | `UNVERIFIABLE` | `FLAG` (support / knowledge) or `HUMAN_REVIEW` (decision) |
| Source supports every claim | `SUPPORTED` | `ALLOW` |
| Source partly supports the answer | `PARTIALLY_SUPPORTED` | `ALLOW`, lower trust score |
| Source contradicts or omits the claims | `UNSUPPORTED` | `FLAG` + `hallucination` tag (or `BLOCK` for decision support) |
| `verification` set to `off` | `NOT_RUN` | verification skipped, `ALLOW` |

### 6. The trust score

A single number that a reviewer can defend ([`app/trust/engine.py`](backend/app/trust/engine.py)).
Four sub-scores are computed, then combined with **per-use-case weights**, then reduced by
the session's compounding risk.

```mermaid
flowchart LR
    subgraph Inputs
      PIIc[PII count]
      INJc[injection confidence]
      TOXc[toxicity level]
      VER[verification verdict]
      ACT[final action]
      CR[compounding risk]
    end
    PIIc --> PR[Privacy sub-score]
    INJc --> SF[Safety sub-score]
    TOXc --> SF
    VER --> AC[Accuracy sub-score]
    ACT --> PF[Policy-fit sub-score]
    PR --> W[weighted sum<br/>weights depend on use case]
    SF --> W
    AC --> W
    PF --> W
    W --> MINUS["minus (compounding risk x 0.18)"]
    CR --> MINUS
    MINUS --> SCORE([Trust score 0–100<br/>+ full breakdown stored])
```

| Sub-score | Range anchors |
| --- | --- |
| **Privacy** | 100 with no PII; drops ~22 points per detected entity. |
| **Safety** | 100 minus `injection_confidence × 72` minus a toxicity penalty. |
| **Accuracy** | `SUPPORTED` = 96, `PARTIALLY_SUPPORTED` = 78, `UNVERIFIABLE` = 72, `UNSUPPORTED` = 35. |
| **Policy fit** | `ALLOW` = 96, `SANITISE` = 87, `FLAG` = 75, `HUMAN_REVIEW` = 42, `BLOCK` = 8. |

| Use case | Privacy | Safety | Accuracy | Policy fit |
| --- | --- | --- | --- | --- |
| `customer_support` | 0.30 | 0.32 | 0.20 | 0.18 |
| `internal_knowledge` | 0.22 | 0.25 | 0.28 | 0.25 |
| `decision_support` | 0.18 | 0.30 | 0.32 | 0.20 |

The full breakdown is stored and shown in the UI — there is no hidden model confidence
anywhere in the score.

### 7. Compounding session risk

Risk is tracked per session, not just per request. Each new risky prompt raises a session
score (`≈ prior × 0.78 + 19 per active risk tag`); between requests it **decays
exponentially** on a configurable half-life (`SESSION_RISK_DECAY_MINUTES`). Once the
compounding score crosses **65**, the next request is forced to `HUMAN_REVIEW` even if that
prompt on its own looks harmless — this is how the system resists a slow, probing attack.

```mermaid
xychart-beta
    title "Compounding session risk over time (decay half-life = 30 min)"
    x-axis "minutes since last risky prompt" [0, 10, 20, 30, 40, 50, 60]
    y-axis "risk score" 0 --> 100
    line [80, 63, 50, 40, 31, 25, 20]
    bar  [65, 65, 65, 65, 65, 65, 65]
```

*The line is the decaying session risk after a burst of risky prompts; the flat bar is the
`HUMAN_REVIEW` threshold. While the line is above the bar, every new request is held.*

### 8. Event sourcing and decision replay

Persistence is append-only:

- The **`requests`** table holds one summary row (action, model, trust score, cost, latency, risk tags, verification verdict).
- The **`events`** table holds one immutable row per stage (`sequence`, `stage`, `status`, `duration_ms`, `confidence`, and a sanitised `data` JSON blob).
- The **`messages`** table holds the sanitised prompt and answer.

```mermaid
erDiagram
    REQUESTS ||--o{ EVENTS : "has ordered stream"
    REQUESTS ||--o{ MESSAGES : "prompt + answer"
    REQUESTS ||--o| HUMAN_REVIEW_QUEUE : "if held"
    SESSIONS ||--o{ REQUESTS : "groups"
    REQUESTS {
        uuid id PK
        string policy_action
        string model_served
        float trust_score
        float cost_usd
        int latency_ms
        json risk_tags
        string verification_verdict
    }
    EVENTS {
        uuid id PK
        int sequence
        string stage
        string status
        int duration_ms
        float confidence
        json data "sanitised"
        timestamp ts
    }
```

Because the full stage stream is stored, the **Decision Replay** screen walks any past
request forward and backward, stage by stage, showing the exact payload each stage produced —
without ever calling a model again. The whole persist happens in a single transaction after
stage 10, and the parent `requests` row is flushed before any child row so the foreign keys
always resolve.

---

## Security and privacy

- **PII never reaches storage or logs.** The prompt is redacted before the first event is created. A dedicated sanitiser ([`app/security/sanitization.py`](backend/app/security/sanitization.py)) scrubs every event payload and every structured log line, blanking values whose key looks sensitive (`password`, `token`, `authorization`, …) and redacting emails, phone numbers, cards, SSNs, and API-key-shaped strings by pattern. Tests assert that raw PII cannot appear in stored event data.
- **Authentication.** JWTs (`python-jose`, 8-hour default expiry) for the console; bcrypt password hashing (`passlib`). Password-reset tokens are single-use, SHA-256 hashed, and expire in one hour.
- **Gateway keys.** `cp_live_…` API keys for the OpenAI-compatible endpoint are stored only as SHA-256 hashes; the plaintext is shown exactly once. A short non-secret prefix is kept for display.
- **Tenant isolation.** Every query filters on `tenant_id` and `user_id`. There is no cross-tenant read path.
- **Rate limiting.** `slowapi` with a conservative global default (120/min) and tighter limits on auth (10/min), chat streaming (30/min), the assistant (60/min), and the gateway (60/min).
- **Hardened container.** The API image runs as a non-root user (`uid 10001`).
- **Scoped in-product assistant.** The "Need Help" assistant can call only four read-only, tenant-scoped tools (recent requests, request detail, usage summary, policy list) and refuses anything outside ControlPlane's domain.

---

## Technology stack

### Backend

| Area | Choice | Why |
| --- | --- | --- |
| Language / runtime | Python 3.11 | Modern typing, `asyncio.TaskGroup`, `asyncio.timeout`. |
| Web framework | FastAPI + Starlette | Async routing, dependency injection, automatic OpenAPI docs at `/docs`. |
| Server | Uvicorn (`[standard]`) | ASGI server with HTTP/1.1 streaming for SSE. |
| Validation / settings | Pydantic v2, `pydantic-settings` | Typed request bodies and 12-factor configuration. |
| ORM / driver | SQLAlchemy 2 + `psycopg` 3 | Explicit unit-of-work control; used for the parent-before-child flush in the event store. |
| Migrations | Alembic | `0001_initial`, `0002_governance_hardening`. |
| Model access | LiteLLM + `httpx` | One interface for Groq; direct SSE transport for Gemini AI Studio keys. |
| Auth | `python-jose`, `passlib[bcrypt]` | JWTs and password hashing. |
| Streaming | `sse-starlette`, custom `sse()` helper | Typed Server-Sent Events. |
| Logging | `structlog` | JSON logs with bound correlation IDs. |
| Metrics | `prometheus-fastapi-instrumentator`, `prometheus_client` | `/metrics` endpoint. |
| Rate limiting | `slowapi` | Per-route limits. |
| File input | `python-multipart` | Multipart uploads for the gateway. |
| Tests / lint | `pytest`, `pytest-asyncio`, `ruff`, `mypy` | 33 tests; strict typing and linting. |

### Frontend

| Area | Choice | Why |
| --- | --- | --- |
| Framework | React 18 + TypeScript 5.7 | Component model with strict types. |
| Build tool | Vite 6 | Fast dev server, `?url` asset imports, code-splitting. |
| Routing | React Router 7 | Nested routes with a protected `/app` shell. |
| Server state | TanStack Query 5 | Caching, background refetch, invalidation after mutations. |
| 3D landing | React Three Fiber, `@react-three/drei`, three.js | Procedural shield / network scene, lazy-loaded. |
| Animation | Framer Motion | Section transitions and micro-interactions. |
| Charts | Recharts | SVG dashboard analytics. |
| Markdown | `react-markdown` + `remark-gfm` | Renders model output, including GFM tables. |
| PDF parsing | `pdfjs-dist` (lazy chunk) | Client-side text extraction for attached sources. |
| Icons | `lucide-react` | Consistent icon set. |

### Infrastructure

| Area | Choice |
| --- | --- |
| Orchestration | Docker Compose (`db`, `api`, `frontend`) |
| Database | `postgres:16-alpine` with a named volume and a healthcheck |
| API image | `python:3.11-slim`, non-root, dev bind-mount + `--reload` |
| Frontend image | multi-stage `node:20-alpine` build → `nginx:1.27-alpine` |
| Reverse proxy | Nginx serves the SPA and proxies `/api` and `/v1` to the API |

---

## Repository layout

```
ControlPlane.ai/
├── docker-compose.yml                 # db + api + frontend
├── backend/
│   ├── Dockerfile                     # python:3.11-slim, non-root
│   ├── pyproject.toml                 # deps, [ml] and [dev] extras, ruff/mypy config
│   ├── alembic.ini
│   ├── migrations/versions/           # 0001_initial, 0002_governance_hardening
│   ├── tests/                         # 8 files, 33 tests
│   └── app/
│       ├── main.py                    # FastAPI app, middleware, router wiring, lifespan
│       ├── config.py                  # pydantic-settings, env parsing, DB URL normalisation
│       ├── seed.py                    # reference data (policies, use cases, model registry)
│       ├── api/
│       │   ├── routes.py              # /api/* — chat stream, requests, analytics, policies, review, keys
│       │   ├── auth.py                # /api/auth/* — signup, signin, reset
│       │   ├── openai.py              # /v1/chat/completions — OpenAI-compatible gateway
│       │   ├── demo.py                # /api/demo/{seed,reset}
│       │   ├── health.py              # /health, /health/ready, /api/health
│       │   └── schemas.py             # Pydantic request/response models
│       ├── core/
│       │   ├── orchestrator.py        # the ten-stage pipeline, verification, trust wiring
│       │   ├── stream.py              # sse() helper, governed_stream()
│       │   ├── events.py              # PipelineEvent dataclass
│       │   └── context.py             # request-id context var
│       ├── detectors/
│       │   ├── heuristics.py          # injection, toxicity, complexity
│       │   ├── regex_pii.py           # LLM-assisted PII scan
│       │   ├── toxicity.py / injection_onnx.py / presidio_adapter.py   # upgrade adapters
│       ├── usecase/
│       │   ├── classifier.py          # explicit → hint → semantic → fallback
│       │   ├── profiles.py            # customer_support / internal_knowledge / decision_support
│       │   └── embeddings.py          # optional sentence-transformer matcher
│       ├── policies/
│       │   ├── engine.py              # tags, fusion, stronger-action merge
│       │   ├── profiles.py            # CP-CS-14 / CP-IK-07 / CP-DS-11
│       │   └── simulator.py           # dry-run policy evaluation, no generation
│       ├── llm/
│       │   ├── router.py              # provider selection, failover, system prompts, mock mode
│       │   └── models.py              # model registry metadata
│       ├── stages/                    # thin per-stage wrappers + the streaming gate
│       ├── trust/engine.py            # weighted 0–100 trust score
│       ├── security/                  # auth, api keys, redaction, sanitization
│       ├── observability/             # structlog logging, prometheus metrics, correlation, rate limit
│       ├── assistant/                 # scoped in-product "Need Help" assistant + tools
│       └── db/
│           ├── models.py              # 13 tables
│           ├── repositories.py        # persist_result() — parent-first flush into the event store
│           ├── rollups.py            # usage_daily aggregation
│           └── session.py             # engine, SessionLocal, get_db dependency
└── frontend/
    ├── Dockerfile                     # node build → nginx
    ├── nginx.conf                     # SPA + /api and /v1 proxy
    ├── vite.config.ts                 # dev proxy to :8000
    └── src/
        ├── main.tsx                   # routes: /, /login, /app{index, dashboard, pipeline-replay, traces, review}
        ├── auth/                      # AuthProvider, ProtectedRoute
        ├── pages/
        │   ├── Landing.tsx            # 3D marketing page
        │   ├── Auth.tsx               # sign in / sign up / reset
        │   ├── Playground.tsx         # governed chat, params tray, source attach, live stage trace
        │   ├── Dashboard.tsx          # KPIs, decision distribution, trust histogram, use-case mix
        │   ├── Replay.tsx             # step through persisted events
        │   ├── Traces.tsx             # the Audit Log
        │   └── Review.tsx             # human-review queue
        ├── components/                # Badge, Sidebar, PipelinePanel, NeedHelp, three/Landing3D, Ui
        ├── lib/
        │   ├── api.ts                 # fetch wrapper, streamApi() SSE reader
        │   ├── useRequests.ts         # workspace + detail query hooks
        │   ├── requestStore.ts        # API ⇄ view-model mapping, local fallback store
        │   └── types.ts
        └── styles/index.css           # the dark "security operations" design system
```

---

## Data model

Thirteen tables ([`backend/app/db/models.py`](backend/app/db/models.py)):

| Table | Purpose |
| --- | --- |
| `tenants` | Workspace / organisation root. |
| `users` | Account, scoped to a tenant; bcrypt password hash. |
| `sessions` | A conversation window; carries the decaying `compounding_risk`. |
| `api_keys` | Hashed `cp_live_…` gateway keys with a display prefix and default use case. |
| `password_reset_tokens` | Single-use, hashed, one-hour expiry. |
| `policies` | Tenant-authored versioned policy profiles. |
| `use_cases` | Reference use-case profiles. |
| `models_registry` | Model metadata (provider, tier, price per million tokens). |
| `requests` | One summary row per governed request. |
| `messages` | Sanitised prompt and answer text. |
| `events` | **Append-only** stage ledger — the source of truth for replay. |
| `human_review_queue` | Requests held for a human, with resolution status. |
| `feedback` | Reviewer feedback on a rule or decision. |
| `usage_daily` | Pre-aggregated per-day rollups for the dashboard. |

---

## API reference

All application routes are under `/api`. Console routes use a JWT bearer token; the gateway uses an API key.

### Authentication — `/api/auth`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/signup` | Create a workspace + user, returns a JWT. |
| `POST` | `/signin` | Exchange credentials for a JWT. |
| `GET` | `/me` | Current user profile. |
| `POST` | `/signout` | Client-side token drop (stateless). |
| `POST` | `/forgot-password` | Issue a reset token (returned inline in development). |
| `POST` | `/reset-password` | Consume a reset token and set a new password. |

### Governed inference

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/chat/stream` | **The core endpoint.** Runs the ten-stage pipeline and streams typed SSE events: `context`, `stage`, `token`, `intervention`, `post`, `done`, `error`. |
| `POST` | `/v1/chat/completions` | OpenAI-compatible; see below. |

### Requests, replay, and review

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/requests` | Paginated list, filterable by action and use case. |
| `GET` | `/api/requests/{id}` | One request **with its full event stream**. |
| `GET` | `/api/requests/{id}/events` | Just the ordered events. |
| `GET` | `/api/requests/{id}/replay` | Read-only replay payload. |
| `POST` | `/api/requests/{id}/feedback` | Attach reviewer feedback. |
| `POST` | `/api/requests/{id}/resolve` | Resolve a held request (`ALLOW` / `BLOCK`). |
| `GET` | `/api/human-review` | The pending human-review queue. |
| `POST` | `/api/human-review/{item_id}/resolve` | Resolve a queue item. |

### Analytics

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/analytics/summary` | Requests, average trust, interventions, spend (7-day). |
| `GET` | `/api/analytics/timeseries` | Daily volume / trust / spend. |
| `GET` | `/api/analytics/by-use-case` | Volume and action mix per use case. |
| `GET` | `/api/analytics/risks` | Frequency of each risk tag. |
| `GET` | `/api/analytics/models` | Usage and cost per model. |
| `GET` | `/api/analytics/violations` | Recent blocks and escalations. |
| `GET` | `/api/analytics/trust-breakdown` | Average of each trust sub-score. |
| `GET` | `/api/analytics/calibration` | Predicted vs. observed reliability. |
| `GET` | `/api/activity/live` | Rolling recent-activity feed. |
| `GET` | `/api/me/recent-requests`, `/api/me/usage-summary` | Per-user views. |

### Policies and use cases

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/policies`, `/api/policies/profiles` | List active / built-in profiles. |
| `POST` | `/api/policies` | Create a tenant policy. |
| `PUT` | `/api/policies/{key}/version` | Add a new version. |
| `GET` | `/api/policies/{key}/versions` | Version history. |
| `POST` | `/api/policies/{key}/activate` | Activate a version. |
| `POST` | `/api/policies/simulate` | Dry-run a policy against a prompt — **no model call**. |
| `GET` | `/api/use-cases` | List profiles. |
| `POST` | `/api/use-cases/detect` | Classify a prompt without running it. |

### Gateway keys and assistant

| Method | Path | Description |
| --- | --- | --- |
| `POST` / `GET` | `/api/keys` | Create / list `cp_live_…` gateway keys. |
| `POST` | `/api/keys/{id}/revoke` | Revoke a key. |
| `POST` | `/api/assistant/stream` | The scoped in-product assistant (tool-calling over the user's own data). |

### Operations

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health`, `/health/ready`, `/api/health` | Liveness / readiness, echoes the correlation ID. |
| `GET` | `/metrics` | Prometheus metrics. |
| `GET` | `/docs` | Interactive OpenAPI documentation. |
| `POST` | `/api/demo/seed`, `/api/demo/reset` | Populate or clear demo data. |

---

## OpenAI-compatible gateway

Point any OpenAI client at `/v1` and every call is governed.

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer cp_live_xxxxxxxxxxxxxxxxxxxx" \
  -H "X-Use-Case: customer_support" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "controlplane-governed",
        "messages": [{"role": "user", "content": "Draft a refund reply for order 4821."}]
      }'
```

The response is the standard `chat.completion` shape with an extra block:

```json
{
  "id": "…",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "…" }, "finish_reason": "stop" }],
  "governance": { "action": "ALLOW", "trust_score": 92.7, "risk_tags": [] }
}
```

A blocked or held request returns a `200` with a policy explanation as the message content and
the real decision in the `governance` block. Streaming (`"stream": true`) emits
`chat.completion.chunk` frames followed by `data: [DONE]`.

---

## Configuration

Set via environment or a `backend/.env` file (see [`backend/.env.example`](backend/.env.example)).

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Enables pretty logging and inline reset tokens. |
| `DATABASE_URL` | local Postgres DSN | `postgres://` and `postgresql://` are normalised to `postgresql+psycopg://`; SQLite is rejected. |
| `JWT_SECRET` | dev placeholder | **Change in production.** Signs console JWTs. |
| `JWT_EXPIRE_MINUTES` | `480` | Session lifetime. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list (JSON array also accepted). |
| `DEV_MOCK_LLM` | `true` | When true, the router returns deterministic canned answers and makes no provider calls. |
| `GROQ_API_KEY` | — | Enables Groq as the primary model. |
| `GEMINI_API_KEY` | — | Enables Gemini (fallback, or primary if no Groq key). Works with AI Studio `AQ.…` keys. |
| `MAX_PROMPT_CHARS` | `12000` | Rejects oversized prompts with `413`. |
| `AUTO_CREATE_TABLES` | `false` | Create tables and seed reference data on boot (handy for local runs; use Alembic in deployment). |
| `DETECTOR_UPGRADES` | `false` | Turns on the optional ML detectors (embeddings, ONNX, Presidio). |
| `LLM_TIMEOUT_SECONDS` | `30` | Per-call timeout for generation and the verification judge. |
| `SESSION_RISK_DECAY_MINUTES` | `30` | Half-life of the compounding session-risk score. |
| `LOG_LEVEL` | `INFO` | Structlog level. |

> **Note:** `backend/.env.example` and `frontend/.env.example` ship with empty key fields on
> purpose — real keys must never be committed. Put yours in `.env`, which is git-ignored.

---

## Running the project

### With Docker (recommended)

```bash
# from the repository root
docker compose up -d --build
```

| Service | URL |
| --- | --- |
| Console | http://localhost:8080 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Metrics | http://localhost:8000/metrics |
| PostgreSQL | internal only (`db:5432`) |

The `api` container mounts `backend/app` and runs Uvicorn with `--reload`, so backend code
changes take effect without a rebuild. Frontend changes need a rebuild of that one service:

```bash
docker compose up -d --build frontend
```

To run against real models, create `.env` at the repo root (Compose reads it) or export the
variables, then recreate the API:

```bash
echo "DEV_MOCK_LLM=false"            >> .env
echo "GROQ_API_KEY=gsk_..."          >> .env      # or GEMINI_API_KEY=AQ....
docker compose up -d --force-recreate api
```

### Local development

**Backend** (needs a reachable PostgreSQL):

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate          # Windows;  use .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"
export DATABASE_URL=postgresql+psycopg://controlplane:controlplane@localhost:5432/controlplane
export AUTO_CREATE_TABLES=true
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> Settings are read from `.env` in the **current working directory**. Run from `backend/`
> with a `backend/.env`, or export the variables directly.

**Frontend:**

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api and /v1 to :8000
```

### First run

1. Open the console and **create an account** (this stores a real JWT — a failed sign-in silently drops you into an offline demo).
2. The header should read **"API gateway online"**. Open the **Playground**, type a prompt, and watch the ten stages resolve live.
3. Attach a document to see source grounding and claim verification in action.

---

## Testing

```bash
cd backend
pytest -q          # 33 tests
```

| Suite | Covers |
| --- | --- |
| `test_orchestrator.py` | The pipeline emits exactly ten stages; no generation after a fused block. |
| `test_policy_fusion.py` | Fusion combinations escalate correctly and never weaken an injection block. |
| `test_router.py` | Groq stays primary across tiers; Gemini is primary only without a Groq key; no mock answer leaks when mock mode is off. |
| `test_usecase.py` | Explicit binding, semantic match, and the internal-knowledge fallback. |
| `test_detectors.py` | Regex PII returns entity types (never raw values); injection scoring; word-boundary toxicity; deterministic complexity. |
| `test_streaming_api.py` | SSE serialisation; the gate withholds an unsafe buffer; `HIGH` strictness intervenes on `MEDIUM` toxicity. |
| `test_hardening.py` | Passwords longer than the bcrypt limit; no raw PII in events; source grounding produces a cited verdict; oversized-source rejection; CORS parsing. |
| `test_health.py` | Health endpoints echo a valid correlation ID. |

---

## Observability

- **Structured logs** — `structlog` emits JSON with `request_id` bound to every line via context vars; a middleware logs `request_complete` with method, path, status, and duration for every call.
- **Correlation IDs** — a client may supply `X-Request-ID`; otherwise one is generated. It is returned on the response and threaded through the pipeline and the database.
- **Prometheus** — `/metrics` exposes request counters (by action and use case), per-stage latency histograms, and assistant-call counters.

---

## Optional ML upgrades

Installing the `[ml]` extra and setting `DETECTOR_UPGRADES=true` swaps three heuristic
detectors for model-backed ones:

| Extra | Replaces |
| --- | --- |
| `sentence-transformers` | keyword scoring in use-case detection → embedding similarity |
| `optimum[onnxruntime]` | regex injection heuristics → an ONNX prompt-injection classifier |
| `presidio-analyzer` | pattern PII redaction → Microsoft Presidio entity recognition |

The heuristic path is the default so the project runs anywhere with no heavy downloads.
