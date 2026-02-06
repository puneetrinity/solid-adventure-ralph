# Gates

## Gate0: Planning correctness
Pass if:
- SCOPE/PLAN/QUALITY_GATES artifacts exist and follow required structure
- PLAN tasks each have acceptance criteria and "proved by"
- QUALITY_GATES contains runnable commands (non-empty, allowlisted)

Evidence:
- list of missing sections/tasks/commands

Fail behavior:
- regenerate docs (doc_fixer) up to N attempts, else NEEDS_HUMAN

## Gate1: Determinism (optional early)
Pass if:
- planning outputs are materially similar across two runs with same context hash

Evidence:
- similarity scores, diff summary

## Gate2: Containment
Pass if:
- no BLOCK policy violations on selected patches
- no frozen file modifications without override
- no denied globs
- no secrets detected
- dependency changes approved or overridden

Evidence:
- policy_violations list

## Gate3: Execution correctness (post-PR)
Pass if:
- CI success for QUALITY_GATES commands
- tests added/updated for changed behavior (heuristic ok initially)

Evidence:
- CI run URL, changed test files list

## Gate4: Architectural integrity (post-PR)
Pass if:
- architecture boundary checks pass (if configured)
- ADR updated when architecture changes (if required by repo policy)

Evidence:
- boundary tool output / ADR files changed

## Gate5: Operational safety (post-PR, if applicable)
Pass if:
- feature flag present where required
- rollback notes present
- minimal observability hooks present

Evidence:
- paths/strings indicating flag + rollback + metrics/logging
