# Project Context: Architecture-First AI Dev Orchestrator

## What we are building

We are building a **single-user, multi-repo AI development orchestrator** that helps turn GitHub issues or product feedback into **safe, auditable code changes**.

The system:

* ingests feedback (GitHub issues or UI input)
* decides **GO / NO-GO / DEFER**
* generates **architecture, scope, plan, and quality gates**
* generates **patch proposals (diffs)** but does **not** write to the repo yet
* requires **explicit human approval**
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
   * We maintain a Proof Ledger (audit trail).
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

### Already implemented:

* NestJS monorepo (`api` + `worker`)
* Redis + BullMQ queues
* Postgres + Prisma
* Workflow creation and ingestion job
* PatchSet / Patch data models
* Patch preview API (`GET /patches/:id`)
* Approval endpoint
* Apply job stub using a WriteGate
* Hard invariant test: **no GitHub writes without approval**

### Not yet implemented:

* Real GitHub App + Octokit integration
* Webhook ingestion (issues, CI events)
* Real orchestrator transition engine
* Policy engine on diffs (frozen files, deny globs, secrets)
* Gate engine (Gate0–Gate5)
* LLM runner (triage / architect / planner / proposer)
* Real patch application (commit diffs, open PR)
* CI verification and DONE state
* Web UI

---

## Technology stack (fixed)

* **Backend**: NestJS (API + Worker)
* **Queues**: BullMQ (Redis)
* **DB**: Postgres (Prisma)
* **Hosting**: Railway
* **VCS**: GitHub (GitHub App)
* **CI**: GitHub Actions
* **User model**: single user (GitHub OAuth allowlist)

---

## Key domain concepts

* **Workflow**: one unit of work tied to a repo + feedback source
* **Artifact**: generated docs (decision, architecture, scope, plan, gates)
* **PatchSet**: a group of proposed diffs
* **Patch**: one diff tied to a plan task
* **Approval**: explicit record that unlocks repo writes
* **Policy**: rules that block unsafe changes
* **Gate**: pass/fail checks with evidence
* **Proof Ledger**: immutable audit log

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

* patches were proposed safely
* approval was explicit
* CI passed required quality gates
* evidence is recorded
* the system ends in `DONE` without violating any invariant
