# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-02-07

### Added

#### Phase 0 - Safety Spine
- Repository monorepo structure with `apps/api`, `apps/worker`, `packages/core`, `packages/db`
- NestJS API with health check endpoint
- BullMQ worker with Redis connection
- Prisma database client with PostgreSQL
- Workflow creation and event logging
- WriteGate safety invariant - all GitHub writes require approval

#### Phase 1 - Patch Proposal Loop
- PatchSet and Patch data models
- Patch proposal creation during context ingestion
- Patch preview API (`GET /api/patches/:id`)

#### Phase 2 - Approval & Controlled Execution
- Approval model and recording
- Approval endpoint (`POST /api/workflows/:id/actions/approve`)
- Gated patch application (only after approval)

#### Phase 3 - Orchestrator
- BullMQ orchestrator with job processing
- Workflow runs with proof ledger
- State transitions via deterministic state machine

#### Phase 4 - Policy Engine & Gate2
- PolicyEngine with configurable rules
- Forbidden file pattern detection
- Diff size limits and test requirements
- Gate 2 validation before user approval

#### Phase 5 - Real GitHub Integration
- OctokitClient for GitHub API operations
- File content fetching and branch operations
- Pull request creation with safety checks
- Webhook handler for PR events

#### Phase 6 - CI & Completion
- Jest test suite with 481+ unit tests
- Safety invariant tests
- TypeScript strict mode

#### Phase 7 - LLM Integration
- LLMRunner with Anthropic Claude integration
- Cost tracking for API usage
- Prompt templates for patch generation

#### Phase 8 - Context & Memory
- MemoryStore for conversation context
- CodeFRAME-inspired context loading
- Semantic file ranking

#### Phase 9 - PRD & Templates
- PRD processing pipeline
- Template service for patch generation
- Configurable template library

#### Phase 10 - Specialist Agents
- Agent framework with registry
- Specialist agent orchestration
- Agent-specific prompts and capabilities

#### Phase 11 - Self-Diagnosis & Recovery
- DiagnosisEngine for error analysis
- Checkpoint model for workflow recovery
- Automatic retry with state restoration

#### Phase 12 - Web Dashboard
- Vite + React + TypeScript frontend
- Tailwind CSS styling
- Workflow list with pagination and filtering
- Workflow detail with tabs (Overview, Timeline, Artifacts, Patches)
- Patch diff viewer with syntax highlighting
- Approval/Reject/Request Changes UI
- Real-time polling for updates
- GitHub OAuth authentication
- API hardening with CORS and error normalization
- Railway deployment configuration

#### Phase 13 - Documentation
- OpenAPI/Swagger documentation at `/api/docs`
- Request/response DTOs with validation
- Root README with quick start and architecture diagrams
- Package and app-specific READMEs
- Environment variables documentation
- CHANGELOG with Keep-a-Changelog format

### Security
- All GitHub writes gated behind explicit approval
- JWT-based authentication with HTTP-only cookies
- Single-user allowlist for dashboard access
- Policy engine blocks forbidden file patterns

## [0.1.0] - 2026-02-06

### Added
- Initial project scaffold
- Basic NestJS API and worker setup
- Prisma schema for workflows

[Unreleased]: https://github.com/your-org/arch-orchestrator/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/arch-orchestrator/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/your-org/arch-orchestrator/releases/tag/v0.1.0
