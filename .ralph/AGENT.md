# Ralph Agent Configuration

## Prerequisites
- Node.js 18+
- PostgreSQL (for Prisma)
- Redis (for BullMQ)

## Environment Setup

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your DATABASE_URL and REDIS_URL
```

## Build Instructions

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate -- --name init
```

## Test Instructions

```bash
# Run all tests
npm test

# Run specific test file
npm test -- test/unit/transition.spec.ts
```

## Run Instructions

```bash
# Start API (terminal 1)
npm run dev:api

# Start Worker (terminal 2)
npm run dev:worker
```

## Quality Gates (from .ai/QUALITY_GATES.md)

```bash
npm run lint
npm run typecheck
npm test
```

All three must pass for a task to be complete.

## Project Structure

```
apps/
  api/          # NestJS HTTP service
  worker/       # NestJS BullMQ worker
packages/
  core/         # Shared logic (WriteGate, transition)
  db/           # Prisma client
prisma/
  schema.prisma # Database schema
test/
  unit/         # Unit tests
  invariant/    # Safety invariant tests
.ai/            # Spec files (PLAN, STATUS, etc.)
```

## Notes
- Never execute repo code on the server (CI runs in GitHub Actions)
- All GitHub writes must go through WriteGate
- Update .ai/STATUS.json after completing tasks
