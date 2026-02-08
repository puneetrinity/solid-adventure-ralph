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

## After Each Phase/Task

1. Update `.ai/STATUS.json` with completed tasks
2. Run documentation alignment check:
   - Compare implementation against `.ai/*.md` specs
   - Update any misaligned documentation
   - See `.ai/PROMPTS/doc-alignment-check.md` for details
3. Ensure all tests pass: `npm test`

## Documentation Alignment

After modifying any of these, update corresponding docs:
- `prisma/schema.prisma` → Update `.ai/DATA_MODEL.md`
- `packages/core/src/workflow/states.ts` → Update `.ai/WORKFLOW_STATE_MACHINE.md`
- `apps/api/src/**/*.controller.ts` → Update `.ai/API_CONTRACT.md`
- `packages/core/src/policy/*` → Update `.ai/POLICY_ENGINE.md`, `.ai/GATES.md`

Prompts available:
- `.ai/PROMPTS/doc-alignment-check.md` - Verify alignment
- `.ai/PROMPTS/fix-doc-alignment.md` - Fix issues

## Notes
- Never execute repo code on the server (CI runs in GitHub Actions)
- All GitHub writes must go through WriteGate
- Documentation follows code (not the other way around)
- Future/planned features go in "## Future" sections, not mixed with current
