# Workflow State Machine

## States
INGESTED
TRIAGE_DONE
DESIGN_DONE
SCOPE_FROZEN
PATCHES_PROPOSED
WAITING_USER_APPROVAL
APPLYING_PATCHES
PR_OPEN
VERIFYING_CI
DONE
NEEDS_HUMAN
BLOCKED_POLICY
FAILED

## Rules
- LLM outputs never directly change state.
- Orchestrator transitions only when gate conditions are met or explicit user approval occurs.
- Scope artifacts are frozen at SCOPE_FROZEN.

## Typical flow
INGESTED
→ TRIAGE_DONE
→ DESIGN_DONE
→ SCOPE_FROZEN (Gate0 pass)
→ PATCHES_PROPOSED (Gate2-lite results recorded)
→ WAITING_USER_APPROVAL
→ APPLYING_PATCHES (approval event)
→ PR_OPEN
→ VERIFYING_CI (CI events)
→ DONE (Gate3+ pass)

## Halt conditions
- NEEDS_HUMAN:
  - missing info
  - repeated failures
  - determinism violation
- BLOCKED_POLICY:
  - forbidden diffs
  - forbidden write attempt
  - frozen file modification without override
