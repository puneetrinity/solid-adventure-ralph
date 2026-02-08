# @arch-orchestrator/core

Core business logic package for arch-orchestrator.

## Overview

This package contains the shared business logic used by both the API and worker services, including:

- **Policy Engine**: Configurable rules for validating patches
- **Gate System**: Multi-layer validation (Gate 1, 2, 3)
- **GitHub Client**: Safe GitHub API wrapper with write protection
- **LLM Runner**: Anthropic Claude integration for patch generation
- **Workflow States**: State machine definitions and transitions
- **Audit System**: Run recording and context hashing

## Installation

```bash
npm install @arch-orchestrator/core
```

## Usage

### Policy Engine

```typescript
import { PolicyEngine } from '@arch-orchestrator/core';

const engine = new PolicyEngine({
  forbiddenPatterns: ['*.env', 'secrets/*'],
  maxDiffLines: 500,
  requireTests: true,
});

const result = await engine.evaluate(patches);
if (!result.allowed) {
  console.log('Blocked:', result.violations);
}
```

### GitHub Client

```typescript
import { GitHubClient } from '@arch-orchestrator/core';

const client = new GitHubClient({
  token: process.env.GITHUB_TOKEN,
  owner: 'your-org',
  repo: 'your-repo',
});

// Safe: reads are always allowed
const content = await client.getFileContent('src/index.ts');

// Safe: writes are gated by approval check
await client.openPullRequest({
  workflowId: 'wf_123',
  patchSetId: 'ps_456',
  title: 'Add feature',
  body: 'Description',
  branch: 'feature/add-feature',
});
```

### Workflow Transitions

```typescript
import { transition, WORKFLOW_STATE } from '@arch-orchestrator/core';

const newState = transition(WORKFLOW_STATE.PATCHES_PROPOSED, 'gate2_pass');
// Returns: WORKFLOW_STATE.WAITING_USER_APPROVAL
```

## Modules

### `/policy`

- `PolicyEngine` - Main policy evaluation engine
- `DiffParser` - Parse unified diff format
- `WriteGate` - Gate for GitHub write operations

### `/github`

- `GitHubClient` - GitHub API client with safety checks
- `PatchApplicator` - Apply patches to repository
- `WebhookService` - GitHub webhook handling

### `/llm`

- `LLMRunner` - Run LLM prompts via Anthropic API
- `CostTracker` - Track API usage and costs

### `/workflow`

- `states.ts` - Workflow state definitions
- `transition.ts` - State transition logic

### `/audit`

- `RunRecorder` - Record workflow runs
- `context-hash.ts` - Cryptographic context hashing

### `/agents`

- `AgentFramework` - Specialist agent orchestration
- `AgentRegistry` - Agent registration and discovery

### `/diagnosis`

- `DiagnosisEngine` - Self-diagnosis and recovery

### `/memory`

- `MemoryStore` - Conversation and context memory

### `/prd`

- `PrdPipeline` - PRD processing pipeline
- `TemplateService` - Template management

## Testing

```bash
npm test
```

## License

MIT
