# Antigravity Build Prompt â€” ControlPlane.ai Live Console Refactor

> **Target agent:** Claude Opus 4.6 in Antigravity
>
> **How to use:** Copy this entire document into Antigravity from the repository root. Attach the supplied dashboard screenshot if Antigravity supports image attachments. Work directly in the existing ControlPlane.ai repository; do not create a second prototype.

---

## ROLE

You are a principal full-stack engineer, product designer, UX systems engineer, and security-minded AI platform architect.

You are modifying the existing ControlPlane.ai codebase. The repository already contains a React/Vite frontend, a FastAPI/PostgreSQL backend, a ten-stage governance orchestrator, authentication, SSE endpoints, analytics endpoints, and tests.

Your job is to perform a complete product refactor based on the requirements below, then verify the implementation end to end.

Do not only describe changes. Inspect the codebase, edit the files, run the tests/build, and leave the repository in a working state.

---

# 1. CONTEXT: WHAT EXISTS TODAY

The current product is ControlPlane.ai, a real-time governance layer for enterprise AI.

The current visual direction is a dark security-operations dashboard with:

- background around `#0A0A0C`,
- crimson brand color around `#FF3B4E`,
- emerald safe state,
- amber caution state,
- danger red blocked state,
- cyan informational/model state,
- glassmorphism cards,
- a procedural React Three Fiber landing page.

The attached screenshot shows the current dashboard style. Preserve the premium dark visual quality, but simplify the information architecture and remove backend/development noise from the user interface.

Before changing anything, read:

```text
FINAL_BUILD_PROMPT.md                         original product requirements
README.md                                     current setup notes
AUDIT.md                                      previous implementation audit
FILE_MANIFEST.md                              authored-file list
docs/ARCHITECTURE.md                          architecture notes
docs/CONTROLPLANE_COMPLETE_GUIDE.md           current full documentation
frontend/src/                                  all frontend code
backend/app/                                  all backend code
backend/tests/                                all backend tests
```

Also run a repository-wide search for:

```text
Maya
Northstar Labs
DEV_MOCK_LLM
Mock gateway online
API gateway online
Prompts are scanned before model routing
Search anything
Export report
Policies
Live Pipeline
Replay
Settings
workspace-switcher
MoreHorizontal
```

Do not assume that a button is functional merely because it is rendered.

---

# 2. MAIN PRODUCT DECISION

After this refactor, the authenticated product should feel like a focused, live governance console for **one logged-in user and one workspace**.

The user should not see:

- workspace switching,
- unnecessary workspace branding,
- generic backend status text,
- development environment names,
- fake data,
- fake timers pretending to be a live pipeline,
- buttons that do nothing,
- unused policy/settings management pages,
- search and notification controls that are not implemented.

The user should see:

- the Playground first,
- a serious data-driven Dashboard,
- one combined Pipeline Replay experience,
- Traces,
- Review Queue,
- the actual results of the prompts they have submitted.

---

# 3. FINAL AUTHENTICATED NAVIGATION

Replace the current authenticated sidebar navigation with exactly this primary structure:

```text
Playground
Dashboard
Pipeline Replay
Traces
Review Queue
```

## Navigation rules

1. **Playground appears first.**
2. Rename the current Live Pipeline/Replay experience to **Pipeline Replay**.
3. Remove separate `Live Pipeline` and `Replay` sidebar items.
4. Remove the user-facing `Policies` sidebar item and user-facing Policies page.
5. Remove the user-facing `Settings` sidebar item and user-facing Settings page.
6. Keep `Traces`.
7. Keep `Review Queue`.
8. Replace the current `Northstar Labs` workspace-switcher card with the primary `Dashboard` navigation position.
9. Do not show a workspace switcher because each logged-in user has one workspace.
10. Preserve backend policy tables and policy evaluation because governance still needs policies internally. The request is to remove the separate user-facing policy management surface, not to disable policy enforcement.
11. Preserve backward-compatible redirects if useful:

```text
/app/pipeline       â†’ /app/pipeline-replay
/app/replay         â†’ /app/pipeline-replay
/app/policies       â†’ /app
/app/settings       â†’ /app
```

12. Update every breadcrumb, title, route label, tooltip, and navigation string to match the new names.

## Sidebar behavior

Implement both desktop and mobile behavior correctly:

- Desktop collapse button must work.
- Collapsed desktop sidebar must persist in `localStorage`.
- Expanded/collapsed state must update `aria-expanded` and accessible labels.
- Collapsed state must show tooltips or accessible labels for icons.
- Mobile menu button must open the sidebar.
- Mobile overlay must close the sidebar.
- Clicking a navigation item on mobile must close the sidebar.
- Sidebar must not create horizontal overflow.
- Use one clear icon for collapse/expand; remove duplicate or nonfunctional controls.

---

# 4. REMOVE THE CURRENT TOP-BAR NOISE

The current top bar contains elements that are not needed or not functional.

Remove:

- the workspace breadcrumb/name,
- the `Search anything` control,
- the keyboard shortcut search affordance,
- the notification bell,
- any notification dot that has no real notification system.

Replace the top bar with a minimal header containing only:

- the current page title or a simple page breadcrumb,
- the logged-in user's avatar/initials,
- the user's display name or email,
- a working sign-out action.

Do not display technical backend details in the top bar.

---

# 5. REMOVE NEED HELP FROM THE AUTHENTICATED CONSOLE

The Need Help chatbot should appear only on the public main landing page before login.

## Public landing page

Keep the Need Help assistant on `/` only.

On the public page it may answer:

- what ControlPlane is,
- what the ten stages mean,
- how the product works,
- how to get started.

It must not show or imply access to private user/workspace activity before login.

## Authenticated pages

Remove the Need Help FAB and assistant panel from:

```text
/app
/app/dashboard
/app/pipeline-replay
/app/traces
/app/review
```

Do not import or render `NeedHelp` through `AppLayout` after this change.

Remove any app-only assistant code that becomes unused. Keep backend assistant endpoints only if they are still needed by a future API or explicitly preserve them, but they must not be displayed in the authenticated UI after this refactor.

---

# 6. REMOVE HARDCODED MAYA AND NORTHSTAR USER DATA

There must be no hardcoded owner named Maya in the application UI.

Remove or replace all hardcoded values such as:

```text
Maya
Maya Chen
maya@northstar.ai
Northstar Labs
```

Use the authenticated user's real account data everywhere.

## Sign-up requirements

The sign-up form must collect:

```text
Full name / display name
Email address
Password
```

The backend must persist the display name on the user record.

The sign-in/current-user response must return at least:

```json
{
  "id": "...",
  "email": "...",
  "display_name": "...",
  "tenant_id": "..."
}
```

The frontend auth context must use the response instead of a hardcoded default person.

For existing users with no display name, use a safe fallback such as the email local-part. Do not call the user Maya.

## Greeting requirements

The Dashboard greeting must be generated from the current local time and the authenticated user's display name.

Use a clear time-aware greeting, for example:

```text
Good morning, Priya
Good afternoon, Daniel
Good evening, Aisha
Good night, Sam
```

Do not hardcode `Good morning, Maya`.

Use the browser/user timezone for this user-facing greeting. The greeting should update correctly after a page reload.

---

# 7. REMOVE DEVELOPMENT/BACKEND TEXT FROM THE USER UI

The authenticated frontend currently exposes implementation details. Remove or replace unnecessary technical text such as:

```text
Prompts are scanned before model routing
API gateway online
Mock gateway online
DEV_MOCK_LLM
LIVE_API
Async events Â· sanitized
Audit ready
```

Important distinction:

- The **Pipeline Replay** screen may show meaningful governance stage names because those are the product itself.
- Random implementation/debug/status labels should not be shown throughout the interface.

Use user-facing language instead of backend language.

Examples:

| Current style | Better user-facing style |
|---|---|
| `DEV_MOCK_LLM` | remove it entirely |
| `API gateway online` | remove it or show a simple `Ready` state |
| `Prompts are scanned before model routing` | remove it from the composer |
| `Async events Â· sanitized` | remove it unless the user is explicitly viewing a trace |
| `audit ready` | remove it from normal Playground UI |

Do not expose environment-variable names, provider implementation details, or internal transport details in ordinary user-facing cards.

---

# 8. REMOVE OR FIX ALL NONFUNCTIONAL BUTTONS

Perform a repository-wide clickable-element audit.

For every `<button>`, clickable `<div>`, icon control, link, and menu:

1. Confirm it has a real action.
2. If it is needed, implement its action.
3. If it is not needed, remove it.
4. Do not leave visual placeholder controls.

## Specific current controls to audit

### Playground

- Arrow next to `Governed chat`: remove it unless it opens a real route/provider selector.
- Paperclip/attach-file control: remove it unless a real source upload/attachment flow is implemented. Do not show a fake upload button.
- Code/connect control: remove it unless it has a real mode toggle or API/code view.
- Expand control: implement a real fullscreen/expanded composer or remove it.
- Any unused icons in the composer toolbar: remove.
- `More`/three-dot response menu: implement a real menu or remove.
- `Regenerate`: implement a real rerun or remove.
- Copy button: implement clipboard copy with a visible success state or remove.
- Documentation/help button inside authenticated app: remove because Need Help is no longer shown after login, or link it to a real documentation route.

### Dashboard

- Remove `Export report` entirely.
- Make the time-range and use-case filters real.
- Make refresh controls refetch real data, or remove them.
- Remove fake three-dot menus.
- Remove any â€œView allâ€ link that does not navigate.
- Remove any decorative action that cannot perform work.

### Traces

- `Open in Pipeline Replay` must navigate to the combined Pipeline Replay screen with the selected request ID.
- The row and drawer must use real request/event data.
- Close drawer must work by close button and backdrop.

### Review Queue

- Queue must load from `/api/human-review`.
- Resolve/allow/edit/block/dismiss actions must call the backend resolution endpoint.
- Update the UI after a successful resolution.
- Remove actions that are not implemented.

### Sidebar/top bar

- Desktop collapse/expand must work.
- Mobile menu must work.
- Remove search and notification controls rather than leaving dead controls.
- Remove workspace-switcher arrow.

---

# 9. REMOVE THE â€œSTART WITH A SAMPLEâ€ SECTION

Remove the complete `Start with a sample` section from the Playground.

Do not replace it with hardcoded sample prompts.

The Playground should open with:

- a clean empty composer,
- clear placeholder text,
- real request history/results when the user has run prompts,
- a useful empty state only when necessary.

If an onboarding example is needed, it must be clearly labeled as optional documentation and must not be inserted into the live request history.

---

# 10. PLAYGROUND MUST BE LIVE, NOT A FRONTEND SIMULATION

Remove frontend fake pipeline/data behavior.

The authenticated Playground must use the backend as the single source of truth.

## Remove from production UI

Remove or stop using:

- `demoRequests` as authenticated production data,
- hardcoded dashboard records,
- `buildResult()` as the production request engine,
- frontend `setTimeout()` fake streaming,
- fake stage blueprint results for completed live requests,
- fake `just now` request IDs/results,
- silent fallback from a failed live API call to fabricated user data.

The backend may retain `DEV_MOCK_LLM=true` for automated tests or explicit offline development, but the frontend must not fabricate a request when the live API fails.

If the API is unavailable:

- show a clear error state,
- keep the user's typed prompt in the composer,
- provide a retry action,
- do not silently pretend a request succeeded.

## Live request flow

```text
User submits prompt
    â†“
Frontend POST /api/chat/stream
    â†“
Backend validates JWT and request
    â†“
Backend runs the governance pipeline
    â†“
Backend persists the sanitized result/events
    â†“
Backend streams stage/token/intervention/post/done events
    â†“
Frontend renders the server result
    â†“
Frontend invalidates/refetches request and analytics queries
```

The final `done` event must contain the persisted request ID, not a newly invented frontend ID.

After a successful request, invalidate/update:

```text
requests
analytics summary
analytics timeseries
activity feed
review queue when relevant
```

Use TanStack Query invalidation or a shared request store. Do not depend on browser-only fabricated arrays for live pages.

---

# 11. FINAL PIPELINE REPLAY SCREEN

Create one combined user-facing route:

```text
/app/pipeline-replay
```

It replaces the separate Live Pipeline and Replay pages.

## Required behavior

The page must show real data for the selected prompt/request:

- request ID,
- sanitized prompt,
- created time,
- use case,
- policy key/version,
- action/verdict,
- trust score,
- model served or no model when blocked/reviewed,
- latency,
- cost,
- risk tags,
- verification verdict,
- event timeline,
- sanitized event payload,
- stage durations/confidence.

Controls:

- request picker populated from `/api/requests`,
- play,
- pause,
- previous event,
- next event,
- first event,
- last event,
- reset.

The event list must load from:

```text
GET /api/requests/{request_id}
GET /api/requests/{request_id}/events
GET /api/requests/{request_id}/replay
```

Do not use `stageBlueprint` or static request data for a live/API-authenticated user.

## Traces integration

The Traces drawer must include a working action:

```text
Open in Pipeline Replay
```

It must navigate to:

```text
/app/pipeline-replay?request=<request_uuid>
```

The Pipeline Replay screen must select that request on load.

For backward compatibility, redirect old routes:

```text
/app/pipeline       â†’ /app/pipeline-replay
/app/replay         â†’ /app/pipeline-replay
```

---

# 12. DASHBOARD IS THE HERO OF THE CONSOLE

The Dashboard must show actual results from prompts submitted by the current authenticated user.

Do not show fabricated metrics for a real user.

If the user has no requests, show a polished empty state:

```text
No governed requests yet
Run a prompt in Playground to start building your governance history.
```

## Remove

- `Export report` button.
- Fake deltas such as `+18.4%` unless calculated from actual comparison windows.
- Hardcoded `2,215`, `86.8`, `148`, `$18.42` for a real user.
- Fake activity rows.
- Fake model usage values.
- Fake risk counts.

## Required dashboard sections

Use a clear, modern hierarchy.

### Header

Show:

```text
Good <time-of-day>, <actual display name>
Your governance overview for the selected period.
```

Controls:

- time range: 24 hours / 7 days / 30 days,
- use-case filter: All / Customer Support / Internal Knowledge / Decision Support.

Do not include export.

### KPI cards

Use real server data:

1. Total governed requests.
2. Average trust score.
3. Interventions, with breakdown of flagged/reviewed/blocked.
4. Total model spend.
5. Optional additional KPI: median/P95 latency or fallback rate.

Only show deltas if the backend calculates a previous-period comparison. Do not invent deltas.

### Volume and trust chart

Show:

- governed request volume over time,
- average trust over the same period,
- readable axes,
- hover tooltips,
- empty/loading/error states,
- real selected time range and use-case filter.

Use Recharts or a lightweight SVG implementation, but it must use actual API data.

### Decision/action distribution

Add a clear pie/donut chart for:

```text
ALLOW
EDIT
SANITIZE
FLAG
HUMAN_REVIEW
BLOCK
```

Use actual counts from the backend.

### Use-case distribution

Show request share by:

```text
Customer Support
Internal Knowledge
Decision Support
```

Use a pie/donut or horizontal bar chart from `/api/analytics/by-use-case`.

### Risk distribution

Show actual risk tags from `/api/analytics/risks`:

```text
privacy
injection
security
hallucination
bias
financial
decision
toxicity
minor
```

Use a bar chart or ranked list with counts and percentages.

### Trust breakdown

Show actual averages from `/api/analytics/trust-breakdown`:

- privacy,
- safety,
- accuracy,
- policy fit,
- overall trust.

Use a radar chart, radial bars, or a clear horizontal breakdown.

### Model usage/cost

Show actual model/provider distribution:

- requests per model,
- average latency,
- spend,
- fallback rate.

Use `/api/analytics/models`.

### Activity feed

Show current user's recent activity from `/api/activity/live`.

- Poll only this feed approximately every 5 seconds.
- Do not poll every dashboard query.
- Use relative time in the UI.
- Use a readable description such as â€œRequest blockedâ€ or â€œReview openedâ€.
- Do not show raw backend event names in the ordinary activity feed.

### Recent requests table

Show the current user's actual recent requests:

- sanitized prompt preview,
- use case,
- action,
- trust,
- model,
- latency,
- created time,
- link to Pipeline Replay.

---

# 13. BACKEND ANALYTICS CONTRACT

Use SQL aggregates and server-side filtering. Do not load the entire requests table into Python.

If needed, extend the existing endpoints so they support:

```text
GET /api/analytics/summary?days=7&use_case=...
GET /api/analytics/timeseries?days=7&use_case=...
GET /api/analytics/by-use-case?days=7
GET /api/analytics/risks?days=7&use_case=...
GET /api/analytics/models?days=7&use_case=...
GET /api/analytics/violations?days=7&use_case=...
GET /api/analytics/trust-breakdown?days=7&use_case=...
GET /api/activity/live
```

All endpoints must scope data to:

```text
authenticated user_id
authenticated tenant_id
selected time window
optional selected use case
```

Use `usage_daily` for time-series/KPI performance where appropriate, but preserve the user boundary. Do not accidentally return another user's tenant activity.

After a successful streamed request, the result must be committed before the final completion event or the client must receive a clear persistence error.

---

# 14. POLICY SURFACE REMOVAL WITHOUT BREAKING GOVERNANCE

Remove the user-facing Policies page/nav item as requested.

Do not remove the backend policy engine.

The backend must continue to:

- load the active policy,
- evaluate PII/injection/complexity/use-case rules,
- perform risk fusion,
- store policy key/version on the request,
- drive actions.

The user should see policy information only where it helps explain a specific request in Pipeline Replay, Traces, or Review Queue.

Do not expose policy-admin controls in the simplified console.

---

# 15. REVIEW QUEUE MUST BE LIVE

Keep Review Queue in the sidebar, but remove static demo queue data from the authenticated page.

Load from:

```text
GET /api/human-review
```

For resolution:

```text
POST /api/human-review/{item_id}/resolve
```

Requirements:

- show real pending items,
- show sanitized prompt/context,
- show risk tags and trust,
- show policy/use-case context,
- show age/SLA information from timestamps,
- resolve on the server,
- remove/update the item only after successful response,
- show a retryable error when the API fails,
- show a clear empty state when the queue is empty.

---

# 16. TRACES MUST BE LIVE AND USER-SCOPED

Traces should load from the backend for the authenticated user.

Required behavior:

- filter by request ID, sanitized prompt preview, use case, and decision,
- pagination or controlled limit,
- real detail drawer,
- real event timeline,
- real Pipeline Replay navigation,
- no static `demoRequests` fallback when a live token exists,
- no cross-user request visibility.

---

# 17. AUTHENTICATION AND USER IDENTITY

Keep JWT authentication and PostgreSQL user storage.

Ensure:

- sign-up collects display name,
- sign-in returns display name,
- `/api/auth/me` returns current identity,
- auth context hydrates from the backend token/current-user response,
- sign-out clears frontend auth state,
- protected routes remain protected,
- user-specific requests/analytics are scoped by user ID and tenant ID.

Remove hardcoded demo identity from authenticated views.

A local/offline mode may remain for automated development, but it must be explicit, must not be presented as live production data, and must not silently replace a failed authenticated request with fabricated success.

---

# 18. RESPONSIVE DESIGN REQUIREMENTS

Test at minimum:

```text
1440 Ã— 900 laptop/desktop
1280 Ã— 800 laptop
1024 Ã— 768 tablet/small laptop
768 Ã— 1024 tablet
390 Ã— 844 phone
```

Requirements:

- no horizontal page overflow,
- sidebar becomes off-canvas on phone,
- mobile header remains usable,
- dashboard cards stack cleanly,
- charts resize without clipped labels,
- Pipeline Replay controls wrap or become scrollable without breaking the page,
- tables use deliberate horizontal scrolling only inside table containers,
- composer remains usable with the virtual keyboard,
- Need Help is absent after login,
- landing page remains responsive with a reduced 3D scene on mobile,
- all interactive controls have visible focus states.

If browser automation is available in Antigravity, use it. Otherwise use Vite build plus manual viewport checks and inspect the CSS carefully.

---

# 19. ACCESSIBILITY AND UX CLEANUP

Implement:

- semantic buttons/links,
- accessible labels on icon-only buttons,
- keyboard focus states,
- `aria-expanded` for sidebar collapse/mobile menu,
- `aria-current` for active navigation,
- readable contrast for crimson/amber/cyan states,
- loading skeletons,
- empty states,
- error states with retry actions,
- no invisible disabled interactions,
- no technical backend copy in normal UI.

Use sentence case for user-facing labels. Prefer:

```text
Pipeline Replay
Review Queue
Average trust
Requests governed
Model spend
```

over cryptic internal names.

---

# 20. FILES/COMPONENTS TO REVIEW FIRST

Frontend:

```text
frontend/src/main.tsx
frontend/src/auth/context.tsx
frontend/src/components/Sidebar.tsx
frontend/src/components/NeedHelp.tsx
frontend/src/components/Ui.tsx
frontend/src/pages/AppLayout.tsx
frontend/src/pages/Auth.tsx
frontend/src/pages/Playground.tsx
frontend/src/pages/Dashboard.tsx
frontend/src/pages/LivePipeline.tsx
frontend/src/pages/Replay.tsx
frontend/src/pages/Traces.tsx
frontend/src/pages/Review.tsx
frontend/src/pages/Policies.tsx
frontend/src/pages/Settings.tsx
frontend/src/lib/api.ts
frontend/src/lib/requestStore.ts
frontend/src/lib/useRequests.ts
frontend/src/lib/mockData.ts
frontend/src/styles/index.css
```

Backend:

```text
backend/app/main.py
backend/app/api/auth.py
backend/app/api/routes.py
backend/app/api/openai.py
backend/app/api/schemas.py
backend/app/db/models.py
backend/app/db/repositories.py
backend/app/db/rollups.py
backend/app/core/orchestrator.py
backend/app/core/stream.py
backend/app/assistant/service.py
backend/app/security/auth.py
backend/app/security/redaction.py
backend/app/policies/engine.py
backend/app/policies/profiles.py
backend/app/llm/router.py
backend/app/observability/middleware.py
```

Use repository-wide search to remove unused imports/files after removing Policies, Settings, and authenticated Need Help.

---

# 21. IMPLEMENTATION ORDER

Follow this order so the refactor stays controlled:

1. Inspect current routes, components, API calls, and mock-data imports.
2. Write a short implementation plan and list any schema/API changes.
3. Fix identity/auth data flow and remove Maya/Northstar hardcoding.
4. Remove workspace switcher, Settings, Policies, top search, notifications, Export, and authenticated Need Help.
5. Simplify and rename navigation.
6. Combine Live Pipeline and Replay into Pipeline Replay.
7. Remove fake frontend request generation/mock data usage.
8. Wire Playground, Pipeline Replay, Traces, Review Queue, and Dashboard to real API data.
9. Implement/invalidate TanStack Query cache after requests.
10. Make every remaining button functional or remove it.
11. Implement the dashboard analytics hierarchy and charts.
12. Verify responsive behavior and accessibility.
13. Remove unused files/imports and update docs.
14. Run all validation commands.

Do not make broad unrelated visual changes while doing this refactor.

---

# 22. VALIDATION REQUIREMENTS

Run from the repository root or the appropriate subdirectory:

## Frontend

```bash
cd frontend
npm install
npm run build
npm audit --audit-level=high
```

## Backend

```bash
cd backend
python -m pip install -e '.[dev]'
pytest -q
ruff check app tests migrations
mypy app
```

## Runtime checks

Start the backend and frontend, then verify:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
curl http://localhost:8000/openapi.json
```

Confirm:

- `/` is public,
- `/app/*` redirects when unauthenticated,
- sign-up requires display name,
- dashboard greeting uses the logged-in user's name/time,
- authenticated Need Help is not rendered,
- dashboard has no export button,
- dashboard has no hardcoded demo metrics,
- Policies/Settings do not appear in navigation,
- Live Pipeline/Replay appear only as Pipeline Replay,
- Traces opens the correct Pipeline Replay request,
- mobile sidebar opens/closes,
- desktop sidebar collapses/expands,
- a submitted prompt appears in real request history/dashboard data,
- review resolution persists through the API,
- API failure shows an error instead of fabricated success.

If Docker is available:

```bash
docker compose up --build
```

Verify the same behavior through nginx at:

```text
http://localhost:8080
```

---

# 23. ACCEPTANCE CHECKLIST

Do not finish until every item below is true.

## Identity

- [ ] No hardcoded Maya/Maya Chen in authenticated UI.
- [ ] No hardcoded Northstar Labs workspace branding in authenticated UI.
- [ ] Sign-up collects display name.
- [ ] Dashboard greeting uses real display name and current time.
- [ ] User identity is loaded from the backend/current JWT user.

## Navigation

- [ ] Sidebar contains Playground, Dashboard, Pipeline Replay, Traces, Review Queue only.
- [ ] Settings is removed from user-facing nav.
- [ ] Policies is removed from user-facing nav.
- [ ] Live Pipeline and Replay are replaced by one Pipeline Replay item.
- [ ] Workspace switcher is removed.
- [ ] Top search is removed.
- [ ] Top notification control is removed.
- [ ] Desktop collapse works and persists.
- [ ] Mobile open/close works.

## Need Help

- [ ] Need Help appears on the public landing page.
- [ ] Need Help does not appear after login.
- [ ] Public assistant cannot access private usage data.

## Playground

- [ ] Start with a sample section is removed.
- [ ] No fake frontend request generator is used for live requests.
- [ ] No fake setTimeout streaming is used for live requests.
- [ ] Technical backend copy is removed from normal UI.
- [ ] Every visible composer control is functional or removed.
- [ ] API errors do not silently become fake success.
- [ ] Server request ID is used.
- [ ] Query data refreshes after a successful request.

## Dashboard

- [ ] Export report is removed.
- [ ] KPIs use real authenticated data.
- [ ] Deltas are real or omitted.
- [ ] Volume/trust chart uses real data.
- [ ] Action distribution chart exists and uses real data.
- [ ] Use-case distribution exists and uses real data.
- [ ] Risk distribution exists and uses real data.
- [ ] Trust breakdown exists and uses real data.
- [ ] Model/cost analysis exists and uses real data.
- [ ] Activity feed uses real data and is the only polling feed.
- [ ] Empty/loading/error states are implemented.

## Pipeline Replay

- [ ] One combined Pipeline Replay route exists.
- [ ] Request picker uses backend requests.
- [ ] Events use backend events.
- [ ] Play/pause/step controls work.
- [ ] Traces navigates to the selected request.
- [ ] Old pipeline/replay routes redirect safely.

## Traces and Review Queue

- [ ] Traces are user-scoped and live.
- [ ] Trace drawer works.
- [ ] Review Queue is backend-backed.
- [ ] Review resolution persists.
- [ ] No static review data is shown to live users.

## Responsiveness

- [ ] Laptop layout is clean.
- [ ] Phone layout is clean.
- [ ] Sidebar behavior is correct.
- [ ] Charts do not overflow.
- [ ] Tables scroll only inside their containers.

## Quality

- [ ] No dead buttons.
- [ ] No unused imports after page removal.
- [ ] No frontend mock data in the authenticated live path.
- [ ] No provider keys in frontend files.
- [ ] Backend tests pass.
- [ ] Frontend build passes.
- [ ] Ruff passes.
- [ ] Mypy passes.
- [ ] No high-severity npm audit findings.
- [ ] Documentation is updated.

---

# 24. FINAL RESPONSE FORMAT

When finished, report:

1. A concise summary of changes.
2. The final navigation structure.
3. How user identity and greeting now work.
4. How live data flows from Playground to Dashboard/Traces/Pipeline Replay/Review Queue.
5. Which fake/nonfunctional controls were removed or implemented.
6. Files changed.
7. Backend schema/API changes.
8. Validation commands and exact results.
9. Any remaining limitations, if any.

Do not claim the work is complete if a visible control is still a dead button or if the authenticated UI still displays fabricated request/analytics data.

