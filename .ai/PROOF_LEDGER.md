# Proof Ledger

## Purpose
Auditable record of what happened, why, and what evidence supports outcomes.

## Must record per workflow run
- workflow_id, repo, base_sha
- stage, attempt
- context_hash (deterministic hash of inputs):
  - base_sha
  - issue text / UI prompt
  - artifact content_shas used as inputs
- model_id + prompt_version used
- artifacts produced (kind + content_sha + created_at)
- gate results (pass/fail + evidence)
- policy violations (warn/block + details)
- approval record:
  - approved_by
  - approved_at
  - patch_set_id + hash
- PR/CI evidence:
  - PR URL
  - CI run URLs + conclusions

## Immutability
- workflow_events are append-only
- gate_results are append-only (new evaluation creates new row)
