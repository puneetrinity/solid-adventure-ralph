# Requirements

## Product goal
A multi-repo dev workflow app (single-user) that:
- Ingests GitHub issues + repo context (read-only)
- Produces triage (GO/NO-GO/DEFER), architecture, scope, plan, and gates
- Produces patch proposals as diffs (PatchSets)
- Applies selected PatchSet to a branch + opens a PR only after explicit user approval
- Tracks CI status and gate results; records evidence into a Proof Ledger

## Hosting & stack
- Railway
- NestJS (API + Worker)
- Redis + BullMQ
- Postgres + Prisma
- GitHub Actions is the execution sandbox (no repo code execution on Railway)

## Core features
1) GitHub App webhook ingestion
2) Web UI API for:
   - listing workflows
   - viewing artifacts
   - viewing patch diffs + policy status
   - approving/rejecting patch sets
3) Orchestrator (deterministic state machine)
4) LLM role runners:
   - triage
   - architect
   - planner
   - proposer (patch diffs)
   - doc_fixer
5) Policy engine (frozen files, deny globs, secret detection, dependency rules, command allowlist)
6) Gate engine (Gate0..Gate5)
7) Proof Ledger (immutable event/run/gate evidence)
8) Approval gating: no GitHub contents writes before approval
9) CI ingestion (check_suite/check_run) and verification gates

## Success criteria
- Can execute a full workflow:
  Issue/UI create → artifacts → patch proposals → approval → PR → CI success → DONE
- No GitHub contents write occurs before approval (enforced + tested)
- All gates produce stored evidence (URLs/structured details)
