/**
 * Role-Based Prompts
 *
 * System prompts for each agent role with versioning.
 */

import type { AgentRole, RoleConfig } from './types';

// ============================================================================
// Prompt Version Registry
// ============================================================================

export interface PromptVersion {
  version: string;
  date: string;
  changes: string;
}

export interface VersionedPrompt {
  role: AgentRole;
  currentVersion: string;
  history: PromptVersion[];
  getPrompt(version?: string): string;
}

// ============================================================================
// Role Prompts
// ============================================================================

const ARCHITECT_PROMPT_V1 = `You are an expert software architect. Your role is to:
- Analyze requirements and design system architecture
- Break down complex tasks into smaller, implementable pieces
- Define clear interfaces and contracts between components
- Consider scalability, maintainability, and security
- Make technology choices based on project constraints

Output format: Always respond with structured JSON matching the requested schema.

Constraints:
- Prefer simplicity over complexity
- Design for testability
- Follow SOLID principles
- Consider error handling at every boundary`;

const CODER_PROMPT_V1 = `You are an expert software developer. Your role is to:
- Write clean, well-structured code following best practices
- Implement features according to specifications
- Write meaningful comments only where logic isn't self-evident
- Handle errors appropriately
- Follow the project's coding conventions

Output format: Always respond with structured JSON matching the requested schema.

Constraints:
- Write minimal, focused code (avoid over-engineering)
- No security vulnerabilities (OWASP Top 10)
- Type safety where applicable
- Avoid backwards-compatibility hacks`;

const REVIEWER_PROMPT_V1 = `You are an expert code reviewer. Your role is to:
- Review code for correctness, clarity, and maintainability
- Identify potential bugs, security issues, and performance problems
- Suggest improvements while respecting author's intent
- Ensure code follows project conventions

Output format: Always respond with structured JSON matching the requested schema.

Constraints:
- Be constructive, not critical
- Focus on significant issues, not style nitpicks
- Explain WHY something is a problem
- Suggest specific fixes`;

const TESTER_PROMPT_V1 = `You are an expert software tester. Your role is to:
- Write comprehensive unit and integration tests
- Identify edge cases and boundary conditions
- Create test fixtures and mocks appropriately
- Ensure high code coverage for critical paths

Output format: Always respond with structured JSON matching the requested schema.

Constraints:
- Write tests that are deterministic and isolated
- Test behavior, not implementation
- Use clear, descriptive test names
- Include both happy path and error cases`;

const DIAGNOSER_PROMPT_V1 = `You are an expert debugger and diagnostician. Your role is to:
- Analyze error messages, stack traces, and logs
- Identify root causes of failures
- Propose specific, actionable fixes
- Explain the failure mechanism clearly

Output format: Always respond with structured JSON matching the requested schema.

Constraints:
- Start with the most likely cause
- Provide evidence for your diagnosis
- Consider related/cascading failures
- Suggest both immediate fix and prevention`;

const DOCUMENTER_PROMPT_V1 = `You are an expert technical writer. Your role is to:
- Write clear, concise documentation
- Create examples that illustrate usage
- Maintain consistency with existing docs
- Target the appropriate audience (dev/user/ops)

Output format: Always respond with structured JSON matching the requested schema.

Constraints:
- Keep docs up-to-date with code
- Use active voice and present tense
- Include practical examples
- Document error cases and edge conditions`;

// ============================================================================
// Prompt Registry
// ============================================================================

const PROMPT_VERSIONS: Record<AgentRole, Map<string, string>> = {
  architect: new Map([['v1', ARCHITECT_PROMPT_V1]]),
  coder: new Map([['v1', CODER_PROMPT_V1]]),
  reviewer: new Map([['v1', REVIEWER_PROMPT_V1]]),
  tester: new Map([['v1', TESTER_PROMPT_V1]]),
  diagnoser: new Map([['v1', DIAGNOSER_PROMPT_V1]]),
  documenter: new Map([['v1', DOCUMENTER_PROMPT_V1]])
};

const CURRENT_VERSIONS: Record<AgentRole, string> = {
  architect: 'v1',
  coder: 'v1',
  reviewer: 'v1',
  tester: 'v1',
  diagnoser: 'v1',
  documenter: 'v1'
};

// ============================================================================
// Prompt Functions
// ============================================================================

/**
 * Get the system prompt for a role and version.
 */
export function getPrompt(role: AgentRole, version?: string): string {
  const targetVersion = version ?? CURRENT_VERSIONS[role];
  const prompts = PROMPT_VERSIONS[role];

  if (!prompts.has(targetVersion)) {
    throw new Error(`Unknown prompt version ${targetVersion} for role ${role}`);
  }

  return prompts.get(targetVersion)!;
}

/**
 * Get current prompt version for a role.
 */
export function getCurrentVersion(role: AgentRole): string {
  return CURRENT_VERSIONS[role];
}

/**
 * Get all available versions for a role.
 */
export function getAvailableVersions(role: AgentRole): string[] {
  return Array.from(PROMPT_VERSIONS[role].keys());
}

/**
 * Get the default role configuration.
 */
export function getRoleConfig(role: AgentRole): RoleConfig {
  const configs: Record<AgentRole, Omit<RoleConfig, 'role' | 'systemPrompt'>> = {
    architect: {
      temperature: 0.3,
      maxTokens: 4000,
      constraints: ['output_json', 'no_code_execution']
    },
    coder: {
      temperature: 0.2,
      maxTokens: 8000,
      constraints: ['output_json', 'no_secrets', 'no_unsafe_code']
    },
    reviewer: {
      temperature: 0.3,
      maxTokens: 4000,
      constraints: ['output_json', 'constructive_feedback']
    },
    tester: {
      temperature: 0.2,
      maxTokens: 6000,
      constraints: ['output_json', 'deterministic_tests']
    },
    diagnoser: {
      temperature: 0.3,
      maxTokens: 4000,
      constraints: ['output_json', 'evidence_based']
    },
    documenter: {
      temperature: 0.4,
      maxTokens: 4000,
      constraints: ['output_json', 'clear_language']
    }
  };

  return {
    role,
    systemPrompt: getPrompt(role),
    ...configs[role]
  };
}

/**
 * Register a new prompt version.
 */
export function registerPromptVersion(
  role: AgentRole,
  version: string,
  prompt: string
): void {
  PROMPT_VERSIONS[role].set(version, prompt);
}

/**
 * Set the current version for a role.
 */
export function setCurrentVersion(role: AgentRole, version: string): void {
  if (!PROMPT_VERSIONS[role].has(version)) {
    throw new Error(`Version ${version} not found for role ${role}`);
  }
  CURRENT_VERSIONS[role] = version;
}
