# Architecture

## Components
- API Service (NestJS):
  - GitHub webhooks ingress
  - Web UI API
  - Auth (GitHub OAuth for single user)
  - Enqueue jobs to BullMQ
- Worker Service (NestJS):
  - BullMQ processors for workflow stages
  - Calls LLM runners
  - Evaluates policy + gates
  - Performs GitHub writes ONLY after approval
- Postgres:
  - workflows, events, runs, artifacts
  - patch sets / patches
  - gate results, policy violations
  - PR / CI linkage
- Redis:
  - BullMQ queues
- GitHub:
  - GitHub App webhooks
  - repo read access always
  - contents write access only after approval event
- CI:
  - GitHub Actions runs tests/gates and reports status

## Trust boundaries
- No executing repo code on Railway workers
- No secrets stored in artifacts/memory/ledger
- No GitHub contents writes before approval (policy + tests enforce)

## Queue layout
- workflow: orchestration stages
- llm: model calls (rate/budget control)
- github: GitHub API operations (rate limiting, retries)

## Deployment on Railway
- Two services from same repo:
  - api (HTTP)
  - worker (processors)
- Managed Postgres + Redis
