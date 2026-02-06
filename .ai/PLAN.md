# Plan (Agent-Operable)

> **Rule**: Tasks must be completed in order.
> A task is DONE only if **all subtasks meet acceptance criteria and proof exists**.

---

## PHASE 0 — SAFETY SPINE (FOUNDATION)

### T0.1 Repository & Runtime Spine
<!-- STATUS: DONE -->
<!-- PROOF: apps/api/src/main.ts, apps/worker/src/main.ts exist and boot -->

**Goal:** System boots reliably with no business logic.

**Subtasks**

* T0.1.1 Create monorepo layout (`apps/api`, `apps/worker`, `packages/*`)
* T0.1.2 Configure NestJS bootstrap for API
* T0.1.3 Configure NestJS application context for Worker
* T0.1.4 Wire Redis + BullMQ connection
* T0.1.5 Wire Postgres + Prisma client

**Acceptance**

* API responds on `/api/health`
* Worker connects to Redis without crashing
* Prisma can read/write a test row

**Proof**

* Health check response
* Worker logs show queue subscription
* Prisma integration test or manual DB insert

---

### T0.2 Workflow Creation + Event Log
<!-- STATUS: DONE -->
<!-- PROOF: apps/api/src/workflows.service.ts, prisma/schema.prisma -->

**Goal:** Create workflows and record events deterministically.

**Subtasks**

* T0.2.1 `POST /api/workflows` creates workflow in `INGESTED`
* T0.2.2 Persist `workflow_events` (append-only)
* T0.2.3 Enqueue `ingest_context` job
* T0.2.4 Read workflow via `GET /api/workflows/:id`

**Acceptance**

* Workflow row exists with correct state
* Event row exists for creation
* Job visible in Redis queue

**Proof**

* DB rows for workflow + event
* Queue inspection
* API response includes workflow ID

---

### T0.3 WriteGate Safety Invariant
<!-- STATUS: DONE -->
<!-- PROOF: test/invariant/no-github-write-without-approval.spec.ts -->

**Goal:** Make unsafe writes impossible by design.

**Subtasks**

* T0.3.1 Centralize all GitHub writes behind `WriteGate`
* T0.3.2 Implement approval lookup
* T0.3.3 Block write when approval missing
* T0.3.4 Allow write when approval exists

**Acceptance**

* GitHub client never called without approval
* Error thrown with deterministic message

**Proof**

* Jest test: `no-github-write-without-approval.spec.ts`

---

## PHASE 1 — PATCH PROPOSAL LOOP (NO WRITES)

### T1.1 Patch Data Model
<!-- STATUS: DONE -->
<!-- PROOF: prisma/schema.prisma contains PatchSet, Patch models -->

**Goal:** Represent proposed changes without applying them.

**Subtasks**

* T1.1.1 Add `PatchSet` model
* T1.1.2 Add `Patch` model
* T1.1.3 Relate PatchSet → Workflow
* T1.1.4 Relate Patch → PatchSet
* T1.1.5 Add indexes for lookup/order

**Acceptance**

* PatchSets and Patches persist correctly
* Cascade deletes work

**Proof**

* Prisma migration
* DB inspection with sample rows

---

### T1.2 Patch Proposal Creation (Stub)
<!-- STATUS: DONE -->
<!-- PROOF: apps/worker/src/processors/ingest-context.processor.ts creates PatchSet + Patch -->

**Goal:** Exercise the full proposal flow without LLM.

**Subtasks**

* T1.2.1 Create PatchSet during ingest
* T1.2.2 Create at least one Patch with diff text
* T1.2.3 Store metadata (files, risk, commands)
* T1.2.4 Transition workflow → `PATCHES_PROPOSED`

**Acceptance**

* Workflow includes PatchSet + Patch
* No GitHub writes occur

**Proof**

* `GET /api/workflows/:id` shows patchSets
* No PR rows exist

---

### T1.3 Patch Preview API
<!-- STATUS: DONE -->
<!-- PROOF: apps/api/src/patches.controller.ts -->

**Goal:** Allow humans (and UI) to inspect diffs.

**Subtasks**

* T1.3.1 Add `GET /api/patches/:id`
* T1.3.2 Return diff text
* T1.3.3 Return metadata (files, risk, commands)
* T1.3.4 Handle missing/invalid IDs safely

**Acceptance**

* API returns full patch info
* Schema stable

**Proof**

* Curl response
* Contract test

---

## PHASE 2 — APPROVAL & CONTROLLED EXECUTION

### T2.1 Approval Recording
<!-- STATUS: DONE -->
<!-- PROOF: apps/api/src/workflows.service.ts approve method, prisma/schema.prisma Approval model -->

**Goal:** Explicit human approval unlocks execution.

**Subtasks**

* T2.1.1 Add `Approval` model
* T2.1.2 Add approve endpoint
* T2.1.3 Record approval with timestamp
* T2.1.4 Update PatchSet status → `approved`
* T2.1.5 Emit approval event

**Acceptance**

* Approval exists in DB
* PatchSet marked approved

**Proof**

* DB rows
* API response

---

### T2.2 Apply Patches (Stubbed Execution)
<!-- STATUS: DONE -->
<!-- PROOF: apps/worker/src/processors/apply-patches.processor.ts -->

**Goal:** Prove execution is gated correctly.

**Subtasks**

* T2.2.1 Add `apply_patches` job
* T2.2.2 Call WriteGate inside job
* T2.2.3 Block execution without approval
* T2.2.4 Open stub PR when approved
* T2.2.5 Persist PullRequest row
* T2.2.6 Transition workflow state

**Acceptance**

* Without approval → `BLOCKED_POLICY`
* With approval → `PR_OPEN`
* No real GitHub calls yet

**Proof**

* Workflow state changes
* PR row exists only after approval

---

## PHASE 3 — ORCHESTRATOR (REAL CONTROL PLANE)

### T3.1 Deterministic Transition Engine
<!-- STATUS: DONE -->
<!-- PROOF: packages/core/src/workflow/transition.ts, test/unit/transition.spec.ts -->

**Goal:** One place decides what happens next.

**Subtasks**

* T3.1.1 Implement `transition(state, inputs)`
* T3.1.2 Remove direct state mutations from processors
* T3.1.3 Encode allowed transitions only
* T3.1.4 Return next jobs + next state

**Acceptance**

* Invalid transitions impossible
* Same inputs → same outputs

**Proof**

* Unit tests for transition table

---

### T3.2 Workflow Runs + Proof Ledger
<!-- STATUS: PENDING -->

**Goal:** Full auditability.

**Subtasks**

* T3.2.1 Add `workflow_runs` model
* T3.2.2 Record run per job execution
* T3.2.3 Compute context hash
* T3.2.4 Persist inputs + outputs metadata

**Acceptance**

* Each job has a run record
* Context hash stable

**Proof**

* DB rows
* Hash tests

---

## PHASE 4 — POLICY ENGINE & GATE2

### T4.1 Policy Engine v1
<!-- STATUS: PENDING -->

**Goal:** Block unsafe diffs.

**Subtasks**

* T4.1.1 Parse diff → touched files
* T4.1.2 Enforce frozen files
* T4.1.3 Enforce deny globs
* T4.1.4 Detect secrets
* T4.1.5 Detect dependency changes
* T4.1.6 Persist violations

**Acceptance**

* Unsafe diffs blocked
* Violations recorded with severity

**Proof**

* Unit tests with sample diffs

---

### T4.2 Gate2 (Containment)
<!-- STATUS: PENDING -->

**Goal:** Prevent unsafe execution.

**Subtasks**

* T4.2.1 Evaluate policy results
* T4.2.2 Fail gate on any BLOCK
* T4.2.3 Attach evidence
* T4.2.4 Integrate gate into transition logic

**Acceptance**

* Gate2 failure halts workflow
* Evidence visible

**Proof**

* Gate result rows

---

## PHASE 5 — REAL GITHUB INTEGRATION

### T5.1 GitHub App + Client
<!-- STATUS: PENDING -->

**Goal:** Replace stub safely.

**Subtasks**

* T5.1.1 Create GitHub App
* T5.1.2 Implement installation token flow
* T5.1.3 Implement Octokit client
* T5.1.4 Swap stub with real client behind interface

**Acceptance**

* Repo read works
* No writes without approval

**Proof**

* Repo metadata fetched
* Invariant test still passes

---

### T5.2 Real Patch Application
<!-- STATUS: PENDING -->

**Goal:** Apply diffs correctly.

**Subtasks**

* T5.2.1 Create branch from base SHA
* T5.2.2 Apply diffs to working tree
* T5.2.3 Commit per patch
* T5.2.4 Push branch
* T5.2.5 Open PR
* T5.2.6 Record PR + state

**Acceptance**

* Real PR opened
* Diff matches PatchSet

**Proof**

* PR URL
* Commit history

---

## PHASE 6 — CI & COMPLETION

### T6.1 Webhook Ingestion
<!-- STATUS: PENDING -->

**Goal:** React to GitHub events.

**Subtasks**

* T6.1.1 Add webhook endpoint
* T6.1.2 Verify signature
* T6.1.3 Persist events

**Acceptance**

* Invalid signature rejected
* Valid event stored

**Proof**

* Logs + DB rows

---

### T6.2 Gate3+ (CI, Architecture, Ops)
<!-- STATUS: PENDING -->

**Goal:** Define "done".

**Subtasks**

* T6.2.1 Map CI events → workflow
* T6.2.2 Evaluate QUALITY_GATES
* T6.2.3 Record CI evidence
* T6.2.4 Transition to DONE / NEEDS_HUMAN

**Acceptance**

* CI success → DONE
* CI failure → NEEDS_HUMAN

**Proof**

* Final workflow state
* Evidence links

---

## PHASE 7 — LLM INTEGRATION

### T7.1 LLM Runner Layer
<!-- STATUS: PENDING -->

**Goal:** Controlled intelligence.

**Subtasks**

* T7.1.1 Role-based prompts
* T7.1.2 Strict output schemas
* T7.1.3 Retry + budget control
* T7.1.4 Prompt versioning

**Acceptance**

* Invalid outputs rejected
* Metadata recorded

**Proof**

* Schema tests
* Run records

---

### T7.2 Replace Stubs
<!-- STATUS: PENDING -->

**Goal:** End-to-end intelligence.

**Subtasks**

* T7.2.1 Replace stub artifacts
* T7.2.2 Replace stub patches
* T7.2.3 Preserve safety invariants

**Acceptance**

* Real artifacts + patches
* No invariant regressions

**Proof**

* Workflow history
* Tests still green

---

## PHASE 8 — CONTEXT & MEMORY (CodeFRAME-inspired)

### T8.1 Tiered Memory Management
<!-- STATUS: PENDING -->

**Goal:** Reduce token usage 30-50% with smart context loading.

**Subtasks**

* T8.1.1 Define memory tiers (HOT/WARM/COLD)
* T8.1.2 HOT: current workflow context (active artifacts, recent events)
* T8.1.3 WARM: related workflows, similar past decisions
* T8.1.4 COLD: archived data, historical workflows
* T8.1.5 Implement context loader with tier selection
* T8.1.6 Add memory tier metadata to workflow_runs

**Acceptance**

* Context size reduced by 30%+ on repeat runs
* No loss of relevant information
* Tier selection logged

**Proof**

* Token usage comparison tests
* Memory tier audit logs

---

### T8.2 Cost & Token Tracking
<!-- STATUS: PENDING -->

**Goal:** Real-time usage analytics with budget limits.

**Subtasks**

* T8.2.1 Add token_usage fields to workflow_runs
* T8.2.2 Track input/output tokens per LLM call
* T8.2.3 Aggregate per workflow, per stage, per agent
* T8.2.4 Implement budget limits (block if exceeded)
* T8.2.5 Add cost estimation API endpoint

**Acceptance**

* Every LLM call has token count recorded
* Budget exceeded → workflow blocked (not failed)
* Cost visible in workflow response

**Proof**

* DB rows with token counts
* Budget limit test

---

## PHASE 9 — PRD & TEMPLATES

### T9.1 PRD Templates
<!-- STATUS: PENDING -->

**Goal:** Structured input formats for consistent output.

**Subtasks**

* T9.1.1 Create template schema (JSON)
* T9.1.2 Standard template
* T9.1.3 Lean template
* T9.1.4 Enterprise template
* T9.1.5 Technical template
* T9.1.6 User-story template
* T9.1.7 Template selection in workflow creation

**Acceptance**

* 5 templates available
* Workflow can specify template
* LLM output matches template structure

**Proof**

* Template files exist
* Integration test with each template

---

### T9.2 PRD-to-Artifacts Pipeline
<!-- STATUS: PENDING -->

**Goal:** Auto-generate SCOPE, PLAN, GATES from PRD.

**Subtasks**

* T9.2.1 PRD parser (markdown, JSON, text)
* T9.2.2 Generate SCOPE artifact from PRD
* T9.2.3 Generate PLAN artifact with tasks
* T9.2.4 Generate QUALITY_GATES artifact
* T9.2.5 Human review gate before proceeding

**Acceptance**

* PRD input → structured artifacts output
* Artifacts match template structure
* Human approval required to proceed

**Proof**

* End-to-end test: PRD → artifacts → approval gate

---

## PHASE 10 — SPECIALIST AGENTS (with approval gates)

### T10.1 Agent Framework
<!-- STATUS: PENDING -->

**Goal:** Pluggable specialist agents that propose (not execute).

**Subtasks**

* T10.1.1 Define Agent interface (propose, validate, describe)
* T10.1.2 Agent registry
* T10.1.3 Agent selection based on task type
* T10.1.4 Agent output → PatchSet (standard format)
* T10.1.5 All agent output goes through Gate2

**Acceptance**

* Agents are proposers only
* Output is always a PatchSet
* Policy check on every proposal

**Proof**

* Unit tests for agent interface
* Integration test: agent proposal → Gate2 → approval

---

### T10.2 Specialist Agents
<!-- STATUS: PENDING -->

**Goal:** Domain-specific agents for better proposals.

**Subtasks**

* T10.2.1 Backend agent (API, DB, services)
* T10.2.2 Frontend agent (UI, components)
* T10.2.3 Test agent (test generation, coverage)
* T10.2.4 Review agent (code review, improvements)
* T10.2.5 Agent coordination (parallel proposals, merge)

**Acceptance**

* Each agent produces valid PatchSet
* Agents can work in parallel
* Combined output still requires single approval

**Proof**

* Per-agent tests
* Multi-agent coordination test

---

## PHASE 11 — SELF-DIAGNOSIS & RECOVERY

### T11.1 Failure Diagnosis
<!-- STATUS: PENDING -->

**Goal:** Automatic root cause analysis on failure.

**Subtasks**

* T11.1.1 Capture failure context (logs, state, inputs)
* T11.1.2 LLM-based diagnosis
* T11.1.3 Generate diagnosis artifact
* T11.1.4 Propose fix as new PatchSet
* T11.1.5 Fix requires approval (no auto-retry without consent)

**Acceptance**

* Failed workflow has diagnosis artifact
* Proposed fix is a PatchSet
* Human approves fix before retry

**Proof**

* Diagnosis artifact on test failure
* Fix proposal test

---

### T11.2 Checkpoint & Recovery
<!-- STATUS: PENDING -->

**Goal:** Resume workflows from known-good state.

**Subtasks**

* T11.2.1 Define checkpoint schema
* T11.2.2 Auto-checkpoint after each successful stage
* T11.2.3 Manual checkpoint creation
* T11.2.4 Restore workflow from checkpoint
* T11.2.5 Checkpoint pruning (keep N most recent)

**Acceptance**

* Workflows have checkpoints
* Can restore and resume
* Old checkpoints cleaned up

**Proof**

* Checkpoint create/restore test
* Pruning test

---

## PHASE 12 — WEB DASHBOARD (Vite + React)

> **See:** `.ai/FRONTEND_SPEC.md` for detailed UI/UX specification

### T12.1 Web App Skeleton (Vite + React + TS)
<!-- STATUS: PENDING -->

**Goal:** A web app that can call your API and render data.

**Subtasks**

* T12.1.1 Create `apps/web` using Vite React TS template
* T12.1.2 Add env var `VITE_API_BASE_URL`
* T12.1.3 Add app layout shell (sidebar/topbar + content)
* T12.1.4 Add API client wrapper (`fetchJson`) with base URL, timeout, error parsing
* T12.1.5 Add routing with React Router: `/workflows`, `/workflows/:id`, `/patches/:id`

**Acceptance**

* Web app runs locally
* Shows "connected" if API reachable

**Proof**

* Manual smoke: `apps/web` loads and can hit `/api/health` or `/api/workflows`

---

### T12.2 Backend Support for List Page
<!-- STATUS: PENDING -->

**Goal:** Dashboard can list workflows.

**Subtasks**

* T12.2.1 Add endpoint: `GET /api/workflows?limit=&cursor=` (pagination)
* T12.2.2 Response includes: `items[]: { id, state, createdAt, baseSha }`, `nextCursor`
* T12.2.3 Add basic ordering: newest first

**Acceptance**

* Can fetch workflows list reliably with pagination

**Proof**

* Curl response matches expected shape

---

### T12.3 Workflows List UI
<!-- STATUS: PENDING -->

**Goal:** List workflows and navigate to details.

**Subtasks**

* T12.3.1 Create page `/workflows`
* T12.3.2 Render table rows with: ID (link), State badge, Created date, baseSha (shortened)
* T12.3.3 Add manual refresh button
* T12.3.4 Add search box (filter by id substring client-side)
* T12.3.5 Add empty state and error state

**Acceptance**

* You can see all workflows and open a workflow

**Proof**

* Manual smoke: create workflows via API; list shows them

---

### T12.4 Workflow Detail UI (Timeline + Artifacts + PatchSets)
<!-- STATUS: PENDING -->

**Goal:** One page to understand the workflow end-to-end.

**Subtasks**

* T12.4.1 Create page `/workflows/:id`
* T12.4.2 Render header: workflow state, baseSha, createdAt, latest PR link (if exists)
* T12.4.3 Render Events timeline: `type`, `createdAt`, and compact payload preview
* T12.4.4 Render Artifacts section: list artifact kinds, expandable markdown view
* T12.4.5 Render PatchSets section: patchSet title/status/baseSha/createdAt, list patches

**Acceptance**

* Workflow detail shows everything needed to decide approval

**Proof**

* Manual smoke: workflow created → ingest adds events/artifact/patchSet visible

---

### T12.5 Patch Detail UI (Diff Viewer)
<!-- STATUS: PENDING -->

**Goal:** Inspect diffs cleanly before approval.

**Subtasks**

* T12.5.1 Create page `/patches/:id`
* T12.5.2 Render patch metadata: title, taskId, riskLevel, addsTests, files list, proposed commands
* T12.5.3 Render diff viewer: monospace, line wrapping off, basic +/- line styling
* T12.5.4 Add "Copy diff" button
* T12.5.5 Add "Raw JSON" toggle (debug)

**Acceptance**

* You can read/copy any patch diff without leaving the browser

**Proof**

* Manual smoke: open patch URL and verify diff renders

---

### T12.6 Approval UX (Primary Control)
<!-- STATUS: PENDING -->

**Goal:** Approve PatchSets from the UI.

**Subtasks**

* T12.6.1 Show "Approve" button when workflow state is `WAITING_USER_APPROVAL` and patchSet is `proposed`
* T12.6.2 Call `POST /api/workflows/:id/actions/approve` with optional `patchSetId`
* T12.6.3 Disable button while pending + show toast
* T12.6.4 Auto-refresh workflow after success

**Acceptance**

* Approving updates state and creates PR (stub now, real later)

**Proof**

* Manual smoke: approve workflow; state changes to PR_OPEN/BLOCKED_POLICY

---

### T12.7 Reject / Request Changes UX
<!-- STATUS: PENDING -->

**Goal:** Provide explicit "no / revise" flows.

**Subtasks**

* T12.7.1 Backend: `POST /api/workflows/:id/actions/request_changes` with `{ patchSetId?, comment }`
* T12.7.2 Backend: `POST /api/workflows/:id/actions/reject_patch_set` with `{ patchSetId?, reason }`
* T12.7.3 Persist as workflow events and update patchSet status (`rejected`)
* T12.7.4 UI: "Request changes" modal with comment box
* T12.7.5 UI: "Reject patch set" modal with reason box
* T12.7.6 Show request/reject history in timeline

**Acceptance**

* You can reject or request changes; patchSet status updates and timeline logs it

**Proof**

* Manual smoke: request changes adds event; reject sets patchSet rejected

---

### T12.8 Auto Refresh (Polling)
<!-- STATUS: PENDING -->

**Goal:** See progress without refreshing manually.

**Subtasks**

* T12.8.1 Poll `GET /api/workflows/:id` every 3-5 seconds
* T12.8.2 Stop polling on terminal states: DONE/FAILED/NEEDS_HUMAN/BLOCKED_POLICY
* T12.8.3 Show "last updated" and polling indicator

**Acceptance**

* State changes show automatically

**Proof**

* Manual smoke: approve and watch state update

---

### T12.9 API Hardening for Browser
<!-- STATUS: PENDING -->

**Goal:** Make API usable from web.

**Subtasks**

* T12.9.1 Add `GET /api/health` (if not present)
* T12.9.2 Configure CORS in API to allow web origin
* T12.9.3 Normalize API errors: JSON `{ errorCode, message }`
* T12.9.4 Add basic request logging (path + status + workflowId when present)

**Acceptance**

* Browser can call API without CORS issues
* Errors are readable and consistent

**Proof**

* Manual smoke: web app calls API in dev and prod

---

### T12.10 Auth v1 (Single User)
<!-- STATUS: PENDING -->

**Goal:** Restrict dashboard to you.

**Subtasks**

* T12.10.1 Add GitHub OAuth (single-user allowlist)
* T12.10.2 Add session cookie/JWT
* T12.10.3 Add UI login screen + route guards
* T12.10.4 Add API guards on mutate endpoints: approve/reject/request_changes
* T12.10.5 Confirm non-auth users cannot approve

**Acceptance**

* Only allowlisted user can approve or trigger apply

**Proof**

* Manual smoke: incognito cannot approve, authenticated user can

---

### T12.11 Railway Deploy (Web Service)
<!-- STATUS: PENDING -->

**Goal:** Deploy web alongside API + worker.

**Subtasks**

* T12.11.1 Add Railway service for `apps/web`
* T12.11.2 Set `VITE_API_BASE_URL` to API public URL
* T12.11.3 Ensure API CORS allows that origin
* T12.11.4 Smoke test production: list workflows and open detail page

**Acceptance**

* Deployed dashboard works end-to-end in production

**Proof**

* Production URL shows workflows
