# Policy Engine

## Purpose
Prevent unsafe/undesired actions and enforce "patch proposals until approved".

## Policy sources
- Global policy (your defaults)
- Repo policy file (optional): .ai/POLICIES.yml
Merge: repo overrides global.

## Core policies (minimum)
1) Approval gating:
   - GitHub contents writes (create branch/push commits/open PR) allowed only after approval record exists.
2) Frozen files (cannot be modified without explicit override):
   - .ai/SCOPE.md
   - .ai/NON_GOALS.md
   - .ai/QUALITY_GATES.md
   - .ai/EXIT_CRITERIA.md (if used)
3) Deny globs (blocked by default):
   - .github/workflows/**
   - **/.env
   - **/secrets/**
4) Dependency change rule:
   - New deps in package.json/requirements/etc require explicit approval/override.
5) Secret detection:
   - Block known key patterns (BEGIN PRIVATE KEY, AWS keys, etc)
6) Command allowlist (future):
   - Any proposed verification commands must match allowlist.

## Enforcement points
- On patch proposal creation: evaluate diff, store policy_violations; mark patch BLOCK/WARN/OK.
- On approval/apply: re-evaluate policy strictly; block apply on any BLOCK.
- Before any GitHub write: policy check approval + state.

## Overrides
- UI supports creating an override with reason.
- Overrides are recorded and referenced in Proof Ledger.
- Overrides turn BLOCK → WARN for a specific rule id and workflow id only.
