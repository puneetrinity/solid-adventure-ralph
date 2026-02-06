# Security Model

## Trust boundaries
- Do not execute arbitrary target-repo code on Railway.
- Use GitHub Actions for test execution and CI verification.
- Do not store secrets in artifacts, logs, or the Proof Ledger.

## GitHub permissions posture
- Read-only operations are always allowed (repo contents read, issues/PR read).
- Writes to GitHub contents (branch/commit/PR open) are allowed only when:
  - approval record exists for (workflow_id, patch_set_id)
  - workflow state is WAITING_USER_APPROVAL → APPLYING_PATCHES
  - Gate2 passes (no BLOCK policy violations)

## Credentials
- Use GitHub App installation tokens (short-lived).
- Never persist tokens in DB.
- Store only app credentials in Railway env vars.

## Data handling
- Store only:
  - workflow artifacts (specs/plans/diffs)
  - structured evidence (CI URLs, gate results)
- Never store:
  - private keys beyond env var
  - production/customer data
  - .env contents from repos

## Abuse prevention (even for solo)
- Deny modifications to .github/workflows/** by default.
- Secret pattern detection blocks patch application.
- Dependency additions require explicit override.

## Audit
- All webhook events stored append-only.
- All approvals recorded with timestamp + patch_set hash.
- All gate evaluations stored with evidence.
