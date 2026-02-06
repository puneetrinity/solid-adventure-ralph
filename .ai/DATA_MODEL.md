# Data Model (Postgres / Prisma)

## Tables
- repos
- workflows
- workflow_events (append-only)
- workflow_runs (stage attempts)
- artifacts
- patch_sets
- patches
- gate_results
- policy_violations
- pull_requests
- ci_runs

## Required fields (high level)
repos:
- owner, name, default_branch, installation_id

workflows:
- repo_id, state, base_ref, base_sha, source_type, source_issue_number, title

workflow_events:
- workflow_id, event_type, payload(json), created_at

workflow_runs:
- workflow_id, stage, attempt, context_hash, model_id, prompt_version, status, started_at, ended_at

artifacts:
- workflow_id, kind, path, content, content_sha, created_at

patch_sets:
- workflow_id, title, base_sha, status(proposed/approved/rejected/applied), approved_at, approved_by, selection(json)

patches:
- patch_set_id, task_id, title, summary, diff, files(json), adds_tests, risk_level, proposed_commands(json)

gate_results:
- run_id, gate_name, pass, evidence(json)

policy_violations:
- workflow_id, scope(artifact/patch/github_action), entity_id(optional), rule_id, severity(warn/block), message, details(json)

pull_requests:
- workflow_id, repo_id, number, url, branch, head_sha, status

ci_runs:
- workflow_id, pr_id, provider, check_suite_id, status, conclusion, url
