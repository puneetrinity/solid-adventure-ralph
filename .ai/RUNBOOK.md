# Runbook

## Services (Railway)
- api: NestJS HTTP service (webhooks + UI API)
- worker: NestJS worker service (BullMQ processors)

## Infrastructure
- Postgres (DATABASE_URL)
- Redis (REDIS_URL)

## Env vars
- DATABASE_URL
- REDIS_URL
- GITHUB_APP_ID
- GITHUB_APP_PRIVATE_KEY
- GITHUB_WEBHOOK_SECRET
- GITHUB_OAUTH_CLIENT_ID
- GITHUB_OAUTH_CLIENT_SECRET
- ALLOWED_GITHUB_USER_ID (single-user)

## Operational notes
- Never execute repo code on Railway. CI runs in GitHub Actions only.
- If queues back up, scale worker or reduce concurrency.
- If GitHub rate limits hit, throttle github queue.

## Common failures
- Webhook signature mismatch: confirm raw body capture + secret
- Worker not processing: verify REDIS_URL and queue names
- Prisma migration issues: verify DATABASE_URL and migration run step
