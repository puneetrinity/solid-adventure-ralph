# Project Context: Architecture-First AI Dev Orchestrator

## What we are building

We are building a **single-user, multi-repo AI development orchestrator** that helps turn GitHub issues or product feedback into **safe, auditable code changes**.

The system:

* ingests feedback (GitHub issues or UI input)
* decides **GO / NO-GO / DEFER**
* generates **architecture, scope, plan, and quality gates**
* generates **patch proposals (diffs)** but does **not** write to the repo yet
* requires **explicit human approval** (per-PatchSet for multi-repo workflows)
* only after approval:
  * applies selected patches to a branch
  * opens a PR
  * observes CI
* verifies gates and records evidence
* finishes in a DONE / NEEDS_HUMAN / BLOCKED_POLICY state

This is **not an autonomous coding agent**.
It is a **policy- and gate-driven orchestrator**.

---

## Core principles (non-negotiable)

1. **Patches until approved**
   * The system must never write to GitHub contents before approval.
   * All GitHub writes go through a single WriteGate.
   * This invariant is enforced by code and tests.

2. **Deterministic orchestration**
   * A state machine decides what happens next.
   * LLM outputs never directly change state.
   * Gates + approvals decide transitions.

3. **Evidence first**
   * Every decision, artifact, gate result, and approval is recorded.
   * We maintain a Proof Ledger (WorkflowRun audit trail).
   * Context hashes are used to make runs reproducible.

4. **Safety over speed**
   * Policy engine blocks forbidden diffs (frozen files, CI changes, secrets, deps).
   * CI (GitHub Actions) is the execution sandbox.
   * No repo code is ever executed on our server.

5. **Architecture before code**
   * Architecture, scope, non-goals, and acceptance criteria are produced *before* patches.
   * "Looks right" is not enough; gates define "done".

---

## Current implementation state

### Implemented:

**Backend (NestJS monorepo)**
* `apps/api` - REST API server with GitHub OAuth
* `apps/worker` - BullMQ job processor with orchestrator
* Redis + BullMQ queues for job processing
* Postgres + Prisma for persistence

**Multi-Repo Support**
* WorkflowRepo model for multi-repository workflows
* Per-repo PatchSet fan-out (each repo gets its own PatchSet)
* Per-repo baseBranch handling during patch application
* Primary/secondary repo roles

**Workflow & Orchestration**
* Full state machine orchestrator (INGESTED -> PATCHES_PROPOSED -> WAITING_USER_APPROVAL -> APPLYING_PATCHES -> PR_OPEN -> VERIFYING_CI -> DONE)
* TransitionContext for state machine decisions
* Event-driven orchestration via BullMQ (E_WORKFLOW_CREATED, E_APPROVAL_RECORDED, E_CHANGES_REQUESTED, etc.)
* WorkflowEvent audit log

**Patch System**
* PatchSet / Patch data models with per-repo association
* Per-PatchSet approve/reject/request-changes workflow
* Patch preview API (`GET /patches/:id`)
* Apply patches processor with correct baseBranch per repo
* WriteGate enforcement (no GitHub writes without approval)

**GitHub Integration**
* GitHub OAuth login with token storage (GitHubAuth model)
* Repository picker with autocomplete from authenticated user's repos
* PR creation after patch application
* CI status observation

**Policy & Gates**
* PolicyViolation model (WARN/BLOCK severities)
* Policy evaluation before approval
* Gate engine infrastructure

**Web UI (React + Vite + Tailwind)**
* Workflow list with pagination and status filtering
* Workflow creation wizard with multi-repo selector
* Workflow detail page with tabs:
  - Overview (current state, PRs by repo, approvals, recent events)
  - Architecture (repo topology, change scope, file tree by directory)
  - Timeline (expandable event log with payloads)
  - Artifacts (generated docs viewer)
  - Policy (violations grouped by severity)
  - Patches (per-PatchSet approve/reject/request-changes)
  - Runs (proof ledger with stats, inputs/outputs, token usage)
* Diff viewer with syntax highlighting (prism-react-renderer)
* Real-time polling (4s intervals)
* WorkflowStatusBadge component

**Proof Ledger**
* WorkflowRun model tracking all job executions
* Token usage and cost estimation
* Agent role tracking
* Expandable run details with inputs/outputs

### Not yet implemented:

* Real LLM runner (triage / architect / planner / proposer)
* GitHub issues ingestion
* Deep repo context ingestion (full tree, structure analysis, dependency graph)
* Gate0-Gate5 full implementation
* CI verification automation
* Dependency change policy

---

## Technology stack (fixed)

* **Frontend**: React + Vite + Tailwind CSS + Lucide icons
* **Backend**: NestJS (API + Worker)
* **Queues**: BullMQ (Redis)
* **DB**: Postgres (Prisma)
* **Hosting**: Railway
* **VCS**: GitHub (GitHub OAuth)
* **CI**: GitHub Actions
* **User model**: single user (GitHub OAuth allowlist)

---

## Key domain concepts

* **Workflow**: one unit of work tied to one or more repos + feedback source
* **WorkflowRepo**: a repository participating in a workflow (primary or secondary role)
* **Artifact**: generated docs (decision, architecture, scope, plan, gates)
* **PatchSet**: a group of proposed diffs for a specific repo
* **Patch**: one diff tied to a plan task
* **Approval**: explicit record that unlocks repo writes (per-PatchSet)
* **Policy**: rules that block unsafe changes
* **PolicyViolation**: a policy breach (WARN or BLOCK severity)
* **Gate**: pass/fail checks with evidence
* **WorkflowRun**: execution record for proof ledger
* **WorkflowEvent**: audit log entry

---

## State Machine

```
INGESTED
    |
    v (E_WORKFLOW_CREATED)
PATCHES_PROPOSED
    |
    v (all repos have proposed PatchSets)
WAITING_USER_APPROVAL
    |
    +---> (E_CHANGES_REQUESTED) --> back to orchestrator for re-generation
    |
    +---> (E_PATCH_SET_REJECTED) --> FAILED
    |
    v (E_APPROVAL_RECORDED for all PatchSets)
APPLYING_PATCHES
    |
    v (all patches applied, PRs opened)
PR_OPEN
    |
    v (CI events observed)
VERIFYING_CI
    |
    +---> (CI passed) --> DONE
    |
    +---> (CI failed) --> NEEDS_HUMAN or regeneration
    |
    +---> (policy blocked) --> BLOCKED_POLICY
```

---

## What the LLM is allowed to do

* Analyze repo context (read-only)
* Generate artifacts (markdown, JSON)
* Propose diffs (as text)
* Flag risks, unknowns, and missing info
* Recommend GO / NO-GO / DEFER

## What the LLM must NOT do

* Change workflow state
* Write to GitHub contents
* Bypass policies or gates
* Assume approval
* Invent missing context silently

If something is unclear or requires scope change, the correct behavior is to **stop and ask for human input**.

---

## Success definition

A workflow is successful when:

* patches were proposed safely (for all repos in multi-repo workflows)
* approval was explicit (per-PatchSet)
* CI passed required quality gates
* evidence is recorded (proof ledger with all WorkflowRuns)
* the system ends in `DONE` without violating any invariant
