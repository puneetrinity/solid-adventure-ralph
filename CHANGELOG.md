# [1.8.0](https://github.com/puneetrinity/solid-adventure-ralph/compare/v1.0.0...v1.8.0) (2026-02-09)


### Bug Fixes

* Add htmlUrl to RepositoryInfo ([1a98641](https://github.com/puneetrinity/solid-adventure-ralph/commit/1a9864108b0dfa8b9715faccce4d87bec433bade))
* add OpenSSL 1.1 compat package to Alpine Dockerfiles ([3e5338e](https://github.com/puneetrinity/solid-adventure-ralph/commit/3e5338e76e20b4969ccc73498c3ff1ce13da6d49))
* Add tsconfig.base.json to Dockerfiles ([2ee9be0](https://github.com/puneetrinity/solid-adventure-ralph/commit/2ee9be08a7c4079a20c89c8f5ed428996186db50))
* Add unified Railway config for monorepo ([dd5d2be](https://github.com/puneetrinity/solid-adventure-ralph/commit/dd5d2bebd477796905b135e38fcbcce171b77fbd))
* **api:** fix TypeScript build errors ([bfbd2b2](https://github.com/puneetrinity/solid-adventure-ralph/commit/bfbd2b2ca444ea598d9729668161af94f5ca79e8))
* **api:** update Dockerfile.api ([0d6f5d4](https://github.com/puneetrinity/solid-adventure-ralph/commit/0d6f5d428de0430ff0b631b39efb45e8fdb74f8e))
* **auth:** add debug logging for auth cookie issues ([fde420f](https://github.com/puneetrinity/solid-adventure-ralph/commit/fde420fa3c615170bda3f9776d703ec8d9fb2512))
* **auth:** add redirect_uri to token exchange and improve error logging ([e148090](https://github.com/puneetrinity/solid-adventure-ralph/commit/e148090bc12228c0b53eb4adb7f4077f6c51c667))
* **auth:** add Set-Cookie header logging for debugging ([98b08bc](https://github.com/puneetrinity/solid-adventure-ralph/commit/98b08bc4b5843cc0e9771a26c3ee7ffc0df07243))
* **auth:** use SameSite=None for cross-origin cookie in production ([58fd7ef](https://github.com/puneetrinity/solid-adventure-ralph/commit/58fd7ef1bd1513eba744545b40e78f594c3321d1))
* **ci:** build packages before typecheck ([749b06c](https://github.com/puneetrinity/solid-adventure-ralph/commit/749b06c7429b07328203d7c7703dc30feeb0c636))
* Correct StubGitHubClient return types ([7ee112c](https://github.com/puneetrinity/solid-adventure-ralph/commit/7ee112cd9483812905d34e824b6e8fbf04fe7392))
* **docker:** use multi-stage builds for TypeScript compilation ([5b8ecfb](https://github.com/puneetrinity/solid-adventure-ralph/commit/5b8ecfbba57d5434233d3390b81e0e5b3cf4c906))
* Force rebuild with cache bust ([51156a3](https://github.com/puneetrinity/solid-adventure-ralph/commit/51156a307b8da29bd6307e59b3b5fbb5c4337589))
* improve validation and LLM usage tracking ([3640c62](https://github.com/puneetrinity/solid-adventure-ralph/commit/3640c62d8e590deef2117c1dbb1dd088618332cf))
* **llm:** handle provider error response in LLMRunner ([fd5e804](https://github.com/puneetrinity/solid-adventure-ralph/commit/fd5e804f0ec0d8f0266d8149ac7d4263d59799b4))
* **llm:** update to llama-3.3-70b-versatile (3.1 deprecated) ([f7fc4f1](https://github.com/puneetrinity/solid-adventure-ralph/commit/f7fc4f1eddaa6be4691faff396f5d8eee37fb9ea))
* Move Dockerfiles to root for Railway ([a02cb0b](https://github.com/puneetrinity/solid-adventure-ralph/commit/a02cb0b60ee325e0ec4fe079892de00873781d02))
* omit devDependencies in production Docker builds ([9aadab9](https://github.com/puneetrinity/solid-adventure-ralph/commit/9aadab9890d07f13f79ec92c0dd8f3b678e91d82))
* **orchestrator:** load policy violations into transition context ([5bd572b](https://github.com/puneetrinity/solid-adventure-ralph/commit/5bd572ba75ff13cedcebbf46102b09cf7234cb0a))
* Point tsconfig paths to dist output for proper monorepo build ([62bbb4f](https://github.com/puneetrinity/solid-adventure-ralph/commit/62bbb4f92ee0c21bfaaac534f3d7a88be4afe825))
* Railway build issues ([627ccac](https://github.com/puneetrinity/solid-adventure-ralph/commit/627ccacbf2446ad1648bd18bfeb8ae538a4f6c51))
* Railway deployment issues ([50356e5](https://github.com/puneetrinity/solid-adventure-ralph/commit/50356e580ec1433bb68b5fed1a9bdf2ca1091eda))
* switch to node:20-bullseye-slim for Prisma OpenSSL compatibility ([71b9829](https://github.com/puneetrinity/solid-adventure-ralph/commit/71b98297685bb1ca5bce44679bc3c5c044cbaa80))
* **test:** add tsconfig.test.json for proper path resolution ([4da2440](https://github.com/puneetrinity/solid-adventure-ralph/commit/4da244070fac6e1f72851f77b331e7cdc47029f2))
* update package-lock.json for playwright ([2f424c3](https://github.com/puneetrinity/solid-adventure-ralph/commit/2f424c37f7b0fe670e88bfd900c9cb28706976c1))
* update package-lock.json with rxjs dependency ([b5206a3](https://github.com/puneetrinity/solid-adventure-ralph/commit/b5206a34ab945b2ba7a48f35734241a1e31d6c1b))
* Update worker processors for @nestjs/bullmq v10 ([ca14140](https://github.com/puneetrinity/solid-adventure-ralph/commit/ca14140744ad3128871935596a850190d6948b32))
* Use Dockerfiles for all services ([798e274](https://github.com/puneetrinity/solid-adventure-ralph/commit/798e2748ab07d6fd323083c7e6b854aaf9c785e8))
* Use npm install instead of ci, swagger v8 ([7d55e97](https://github.com/puneetrinity/solid-adventure-ralph/commit/7d55e97341389688726a1ffcf93e3071227faffc))
* use Prisma binary target for OpenSSL 3.x on Alpine ([ddc5020](https://github.com/puneetrinity/solid-adventure-ralph/commit/ddc5020d1f532607c69e2137284dcc0d93c1bf9f))
* use valid Groq model llama-3.3-70b-versatile ([c5252d3](https://github.com/puneetrinity/solid-adventure-ralph/commit/c5252d3b382fa69e2dbc8651f4484c4830b94259))
* various fixes for Railway deployment ([8fcd561](https://github.com/puneetrinity/solid-adventure-ralph/commit/8fcd56192752719d74451ea71b7e10e8a01cf074))
* **web:** cache bust for fresh build ([980b581](https://github.com/puneetrinity/solid-adventure-ralph/commit/980b5813c2431b1539eb5a27885d732f1d7b161b))
* **web:** remove unused shortenSha function ([9e6fe45](https://github.com/puneetrinity/solid-adventure-ralph/commit/9e6fe45d0d85a86042298740fa690562dc6bf94b))
* **web:** update Dockerfile and nginx config ([ccd7c28](https://github.com/puneetrinity/solid-adventure-ralph/commit/ccd7c2857f6775316d089da04c34c60e448a4bd0))
* **worker:** add bash to Alpine image for npm scripts ([13a2966](https://github.com/puneetrinity/solid-adventure-ralph/commit/13a2966cc91dfa221e32a7441e50ce3c58c14467))
* **worker:** add rxjs and reflect-metadata dependencies ([5967671](https://github.com/puneetrinity/solid-adventure-ralph/commit/59676711d46a1dc26d72960867326ad92b043715))
* **worker:** add start.sh script for Railway ([86f82e7](https://github.com/puneetrinity/solid-adventure-ralph/commit/86f82e725b227b879e651196b62ac39309e788a6))
* **worker:** force cache invalidation for bash install ([8baca68](https://github.com/puneetrinity/solid-adventure-ralph/commit/8baca68c0f6d99a7c469ee6ce76f255253f3075c))
* **worker:** force npm ci cache invalidation ([68512ae](https://github.com/puneetrinity/solid-adventure-ralph/commit/68512aed37d2168d6f25117117e664bffffd7085))
* **worker:** increase LLM budget from 10c to 50c per call ([56dab91](https://github.com/puneetrinity/solid-adventure-ralph/commit/56dab91284066b18bc01019ccbe1651c2944df18))
* **worker:** processors enqueue to orchestrate queue ([87e411a](https://github.com/puneetrinity/solid-adventure-ralph/commit/87e411aae124c7f469780f8dd8d4144fa210b3a0))
* **worker:** register all queues and fix queue routing ([68a0206](https://github.com/puneetrinity/solid-adventure-ralph/commit/68a0206ab6a09baf356dfc251bb87eca7448ef98))
* **worker:** resolve circular import for GITHUB_CLIENT_TOKEN ([85ad1da](https://github.com/puneetrinity/solid-adventure-ralph/commit/85ad1dac18bbcb74d0969a77451bc74be0593cd1))
* **worker:** use PatchApplicator for proper diff application ([f008222](https://github.com/puneetrinity/solid-adventure-ralph/commit/f008222abe3e04a3278d9ed94a62a876ae60cf61))
* **worker:** use workspace install for npm ci ([607401d](https://github.com/puneetrinity/solid-adventure-ralph/commit/607401d294d96af9e5492467530122faac7ec51b))


### Features

* add cancel/delete workflow functionality ([921c778](https://github.com/puneetrinity/solid-adventure-ralph/commit/921c778c7ed983de506ad4b21c225ee0f430584e))
* add evaluate_policy processor and fix validation ([91ff3dc](https://github.com/puneetrinity/solid-adventure-ralph/commit/91ff3dc9ec3276005d549ccf0ed792c8b383242b))
* add gated workflow pipeline with feasibility stage ([223334f](https://github.com/puneetrinity/solid-adventure-ralph/commit/223334fb163265f51cd80a04ba125dd1590b7288))
* add multi-file patching and context UI enhancements ([54d24ce](https://github.com/puneetrinity/solid-adventure-ralph/commit/54d24ce5dd5fdba82766682a6bb6535b76a48143))
* add multi-repo support and goal/context fields ([583626a](https://github.com/puneetrinity/solid-adventure-ralph/commit/583626ac9b0670e761e73fbcf44881f1ba90e4ed))
* add repo context persistence ([62a34b5](https://github.com/puneetrinity/solid-adventure-ralph/commit/62a34b5bdaed50876151c22eea5bb168ee1424b4))
* add repo-scoped views and filtering ([7559334](https://github.com/puneetrinity/solid-adventure-ralph/commit/7559334bf14fc1c0daa3f457408c6a220e788969))
* **auth:** add Authorization header fallback for third-party cookie blocking ([63fa6a9](https://github.com/puneetrinity/solid-adventure-ralph/commit/63fa6a93bcfe7f2a3677cc71520b15fa3feb7660))
* complete gated pipeline with architecture/timeline processors ([3b68a2b](https://github.com/puneetrinity/solid-adventure-ralph/commit/3b68a2bcfe63c46f3687ce3c79c74b3143638999))
* complete Phase 4-6 pending items ([ac183d4](https://github.com/puneetrinity/solid-adventure-ralph/commit/ac183d4171564d509b46a81d4416361757aad3ae))
* complete Phase-12 multi-repo and UI enhancements ([7faf3e6](https://github.com/puneetrinity/solid-adventure-ralph/commit/7faf3e65f20c6b1d281dce4bf9fc42e2064f1823))
* implement real GitHub + Groq LLM integration ([6cfa541](https://github.com/puneetrinity/solid-adventure-ralph/commit/6cfa54129999999f53c52c8f5188ccbd0e123fd7))
* **llm:** switch to Llama 4 Scout for better cost/performance ([5d49121](https://github.com/puneetrinity/solid-adventure-ralph/commit/5d49121520c63744fe3d3c96ead9e99bf8f96407))
* repo-first UI, gated pipeline fixes, and test scaffolding ([dc20d64](https://github.com/puneetrinity/solid-adventure-ralph/commit/dc20d64f878dc026edd249e9f90d838af24a96ff))
* update processors to use goal/context and multi-repo ([67f7c5b](https://github.com/puneetrinity/solid-adventure-ralph/commit/67f7c5b16a0ad399c62db60aa6f082df68a88a3a))
* **web:** add Feasibility tab and gate-locking UI ([6ef65cf](https://github.com/puneetrinity/solid-adventure-ralph/commit/6ef65cf09797cedf681ce42608cbce37cc733c8f))
* **web:** add New Workflow button with modal ([1e8a598](https://github.com/puneetrinity/solid-adventure-ralph/commit/1e8a5984e12d42ac5ba6bebcc85093256b75fc93))
* **web:** connect dashboard to API ([952cd99](https://github.com/puneetrinity/solid-adventure-ralph/commit/952cd9997bedbfc692ddc1d67ef1788209a1e50b))



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
- Workflow detail with tabs (Overview, Timeline, Artifacts, Patches, Policy, Runs, Architecture)
- Patch diff viewer with syntax highlighting
- Approval/Reject/Request Changes UI
- Real-time polling for updates
- GitHub OAuth authentication
- GitHub repo autocomplete in workflow create modal
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
