# API Contract

## Webhooks (GitHub App)
POST /webhooks/github
- Verifies signature using raw body
- Persists workflow_event
- Creates/updates workflow and enqueues jobs

Events handled:
- issues.opened
- issue_comment.created (optional commands)
- issues.labeled (optional approval/overrides)
- check_suite.completed or check_run.completed

## UI API (Web)
POST /api/workflows
GET /api/workflows/:id
GET /api/workflows/:id/patch_sets
GET /api/patches/:id
POST /api/workflows/:id/actions/approve
POST /api/workflows/:id/actions/request_changes
POST /api/workflows/:id/actions/cancel

## Auth
- GitHub OAuth for single user (allowlist by GitHub user id)
- API uses session/JWT
