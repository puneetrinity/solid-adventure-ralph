/**
 * Agent Types
 *
 * Core types for the pluggable specialist agent framework.
 * Agents are PROPOSERS only - they generate PatchSets that require approval.
 */

import type { PlanTask } from '../llm/artifact-generator';

// ============================================================================
// Agent Interface
// ============================================================================

/**
 * Specialist agent types.
 */
export type AgentType =
  | 'backend'    // API, DB, services
  | 'frontend'   // UI, components
  | 'test'       // Test generation
  | 'review'     // Code review
  | 'docs'       // Documentation
  | 'refactor';  // Code refactoring

/**
 * Agent capability flags.
 */
export interface AgentCapabilities {
  canGenerateCode: boolean;
  canGenerateTests: boolean;
  canReviewCode: boolean;
  canGenerateDocs: boolean;
  canRefactor: boolean;
  filePatterns: string[];  // Glob patterns for files this agent handles
  languages: string[];     // Programming languages supported
}

/**
 * Core Agent interface - all agents must implement this.
 */
export interface Agent {
  /** Unique agent identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Agent type */
  readonly type: AgentType;

  /** Agent capabilities */
  readonly capabilities: AgentCapabilities;

  /**
   * Describe what this agent does.
   */
  describe(): AgentDescription;

  /**
   * Validate whether this agent can handle the given task.
   */
  validate(context: AgentContext): Promise<AgentValidationResult>;

  /**
   * Generate a proposal (PatchSet) for the given task.
   * This is the core functionality - agents PROPOSE, not execute.
   */
  propose(context: AgentContext): Promise<ProposalResult>;
}

/**
 * Agent description for discovery and selection.
 */
export interface AgentDescription {
  summary: string;
  specialties: string[];
  limitations: string[];
  examples: string[];
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Context provided to an agent for proposal generation.
 */
export interface AgentContext {
  workflowId: string;
  task: TaskContext;
  repo: AgentRepoContext;
  /** Previous proposals from other agents (for sequential coordination) */
  previousProposals?: PatchSetProposal[];
  constraints?: ProposalConstraints;
}

/**
 * Task context from the workflow plan.
 */
export interface TaskContext {
  id: string;
  title: string;
  description: string;
  type: PlanTask['type'];
  targetFiles: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
}

/**
 * Repository context for agents.
 * Note: Prefixed with Agent to avoid conflict with llm/artifact-generator.
 */
export interface AgentRepoContext {
  owner: string;
  repo: string;
  baseSha: string;
  defaultBranch: string;
  files: AgentFileContent[];
}

/**
 * File content snapshot for agents.
 * Note: Prefixed with Agent to avoid conflict with llm module.
 */
export interface AgentFileContent {
  path: string;
  content: string;
  language?: string;
  sha?: string;
}

/**
 * Constraints on proposal generation.
 */
export interface ProposalConstraints {
  maxFiles?: number;
  maxLinesChanged?: number;
  forbiddenPatterns?: string[];
  requiredPatterns?: string[];
  mustIncludeTests?: boolean;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Validation result for agent task compatibility.
 * Note: Prefixed with Agent to avoid conflict with llm module.
 */
export interface AgentValidationResult {
  canHandle: boolean;
  confidence: number;  // 0-1
  reason: string;
  suggestedAgent?: AgentType;
}

/**
 * Proposal result - the output of an agent's work.
 */
export interface ProposalResult {
  success: boolean;
  patchSet?: PatchSetProposal;
  error?: string;
  metadata: ProposalMetadata;
}

/**
 * A proposed set of patches.
 */
export interface PatchSetProposal {
  title: string;
  description: string;
  patches: AgentPatchProposal[];
  baseSha: string;
}

/**
 * A single proposed patch (file change).
 * Note: Prefixed with Agent to avoid conflict with llm module.
 */
export interface AgentPatchProposal {
  taskId: string;
  title: string;
  summary: string;
  diff: string;
  files: AgentPatchFile[];
  addsTests: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  commands?: string[];  // Suggested commands to run (tests, etc.)
}

/**
 * File modification info for agents.
 * Note: Prefixed with Agent to avoid conflict with llm module.
 */
export interface AgentPatchFile {
  path: string;
  action: 'create' | 'modify' | 'delete';
  additions: number;
  deletions: number;
}

/**
 * Metadata about proposal generation.
 */
export interface ProposalMetadata {
  agentId: string;
  agentType: AgentType;
  generatedAt: Date;
  durationMs: number;
  tokensUsed?: number;
  promptVersion?: string;
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Agent registry entry.
 */
export interface AgentRegistryEntry {
  agent: Agent;
  priority: number;  // Higher = preferred
  enabled: boolean;
}

/**
 * Agent selection criteria.
 */
export interface AgentSelectionCriteria {
  taskType?: PlanTask['type'];
  filePatterns?: string[];
  languages?: string[];
  capabilities?: Partial<AgentCapabilities>;
}

/**
 * Agent selection result.
 */
export interface AgentSelectionResult {
  agent: Agent;
  confidence: number;
  reason: string;
  validation: AgentValidationResult;
}
