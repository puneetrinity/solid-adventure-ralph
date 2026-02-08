# @arch-orchestrator/db

Database package for arch-orchestrator using Prisma.

## Overview

This package provides:

- Prisma client singleton for database access
- Type-safe database models
- Migration management

## Installation

```bash
npm install @arch-orchestrator/db
```

## Usage

```typescript
import { getPrisma } from '@arch-orchestrator/db';

const prisma = getPrisma();

// Create a workflow
const workflow = await prisma.workflow.create({
  data: {
    state: 'INGESTED',
    baseSha: 'abc123',
  },
});

// Find workflows with includes
const workflows = await prisma.workflow.findMany({
  include: {
    events: true,
    patchSets: {
      include: { patches: true },
    },
  },
});
```

## Models

### Workflow

Main workflow entity tracking the lifecycle of a code change request.

```prisma
model Workflow {
  id        String   @id @default(uuid())
  state     String   @default("INGESTED")
  baseSha   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  events      WorkflowEvent[]
  artifacts   Artifact[]
  patchSets   PatchSet[]
  approvals   Approval[]
  pullRequests PullRequest[]
  checkpoints Checkpoint[]
}
```

### PatchSet & Patch

Proposed code changes grouped into sets.

```prisma
model PatchSet {
  id        String   @id @default(uuid())
  workflowId String
  version   Int      @default(1)
  status    String   @default("proposed")
  baseSha   String?
  createdAt DateTime @default(now())

  workflow Workflow @relation(...)
  patches  Patch[]
}

model Patch {
  id        String   @id @default(uuid())
  patchSetId String
  title     String
  summary   String
  filePath  String?
  diff      String
  riskLevel String   @default("low")
  // ...
}
```

### Approval

Human approval records for patch sets.

```prisma
model Approval {
  id         String   @id @default(uuid())
  workflowId String
  patchSetId String
  approvedBy String
  createdAt  DateTime @default(now())
}
```

### WorkflowEvent

Audit log of all workflow events.

```prisma
model WorkflowEvent {
  id        String   @id @default(uuid())
  workflowId String
  type      String
  payload   Json?
  createdAt DateTime @default(now())
}
```

## Commands

```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name migration_name

# Deploy migrations
npx prisma migrate deploy

# Open Prisma Studio
npx prisma studio
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (e.g., `postgresql://user:pass@localhost:5432/db`) |

## License

MIT
