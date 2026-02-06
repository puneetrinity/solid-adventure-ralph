# Agent Operating Rules

## Mission
Build the orchestrator app described in .ai/REQUIREMENTS.md under constraints in .ai/CONSTRAINTS.md and exclusions in .ai/NON_GOALS.md.

## Hard rules (must)
- Do NOT change these scope files:
  - .ai/REQUIREMENTS.md
  - .ai/NON_GOALS.md
  - .ai/CONSTRAINTS.md
  - .ai/ARCHITECTURE.md
  - .ai/API_CONTRACT.md
  - .ai/DATA_MODEL.md
  - .ai/WORKFLOW_STATE_MACHINE.md
  - .ai/POLICY_ENGINE.md
  - .ai/GATES.md
  - .ai/QUALITY_GATES.md
  - .ai/SECURITY_MODEL.md
- If scope must change: write a "Scope Change Request" in .ai/OPEN_QUESTIONS.md and STOP.
- The system must propose patches (diffs) WITHOUT writing to GitHub contents until explicit approval is recorded.
- The orchestrator decides state transitions; LLM output cannot set state.
- CI / .ai/QUALITY_GATES.md defines "done".

## Output discipline
- Every code change must map to a task in .ai/PLAN.md.
- Update .ai/RUNBOOK.md when adding env vars, queues, DB migrations, or operational steps.
- Prefer smallest viable changes; follow existing conventions.

## Stuck protocol
If blocked:
1) Write the blocker + options in .ai/OPEN_QUESTIONS.md
2) Propose the safest next step
3) STOP
