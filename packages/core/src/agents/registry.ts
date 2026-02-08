/**
 * Agent Registry
 *
 * Manages registration and discovery of specialist agents.
 * Handles agent selection based on task characteristics.
 */

import {
  Agent,
  AgentType,
  AgentRegistryEntry,
  AgentSelectionCriteria,
  AgentSelectionResult,
  AgentContext,
  AgentValidationResult,
} from './types';
import type { PlanTask } from '../llm/artifact-generator';

// ============================================================================
// Agent Registry
// ============================================================================

export class AgentRegistry {
  private readonly agents: Map<string, AgentRegistryEntry> = new Map();

  /**
   * Register an agent.
   */
  register(agent: Agent, priority = 50, enabled = true): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent already registered: ${agent.id}`);
    }

    this.agents.set(agent.id, {
      agent,
      priority,
      enabled,
    });
  }

  /**
   * Unregister an agent.
   */
  unregister(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  /**
   * Get an agent by ID.
   */
  get(agentId: string): Agent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  /**
   * Get all registered agents.
   */
  getAll(): Agent[] {
    return Array.from(this.agents.values())
      .filter(e => e.enabled)
      .sort((a, b) => b.priority - a.priority)
      .map(e => e.agent);
  }

  /**
   * Get agents by type.
   */
  getByType(type: AgentType): Agent | undefined {
    const agents = this.getAll().filter(a => a.type === type);
    return agents[0]; // Return highest priority agent of this type
  }

  /**
   * Get all agents of a specific type.
   */
  getAllByType(type: AgentType): Agent[] {
    return this.getAll().filter(a => a.type === type);
  }

  /**
   * Enable/disable an agent.
   */
  setEnabled(agentId: string, enabled: boolean): void {
    const entry = this.agents.get(agentId);
    if (entry) {
      entry.enabled = enabled;
    }
  }

  /**
   * Set agent priority.
   */
  setPriority(agentId: string, priority: number): void {
    const entry = this.agents.get(agentId);
    if (entry) {
      entry.priority = priority;
    }
  }

  /**
   * List all agent IDs.
   */
  listIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get registry size.
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Clear all agents.
   */
  clear(): void {
    this.agents.clear();
  }
}

// ============================================================================
// Agent Selector
// ============================================================================

/**
 * Task type to agent type mapping.
 */
const TASK_TYPE_MAPPING: Record<PlanTask['type'], AgentType[]> = {
  feature: ['backend', 'frontend'],
  bugfix: ['backend', 'frontend', 'review'],
  refactor: ['refactor', 'review'],
  test: ['test'],
  docs: ['docs'],
};

/**
 * File extension to language mapping.
 */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.sql': 'sql',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

export class AgentSelector {
  constructor(private readonly registry: AgentRegistry) {}

  /**
   * Select the best agent for a task context.
   */
  async select(context: AgentContext): Promise<AgentSelectionResult | null> {
    const candidates = await this.findCandidates(context);

    if (candidates.length === 0) {
      return null;
    }

    // Sort by confidence, then by priority
    candidates.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return 0; // Maintain original priority order
    });

    return candidates[0];
  }

  /**
   * Select multiple agents for parallel execution.
   */
  async selectMultiple(
    context: AgentContext,
    maxAgents = 3
  ): Promise<AgentSelectionResult[]> {
    const candidates = await this.findCandidates(context);

    // Sort and limit
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates.slice(0, maxAgents);
  }

  /**
   * Find candidate agents that can handle the task.
   */
  private async findCandidates(
    context: AgentContext
  ): Promise<AgentSelectionResult[]> {
    const candidates: AgentSelectionResult[] = [];
    const agents = this.registry.getAll();

    // Determine preferred agent types from task type
    const preferredTypes = TASK_TYPE_MAPPING[context.task.type] || ['backend'];

    // Detect languages from target files
    const languages = this.detectLanguages(context.task.targetFiles);

    for (const agent of agents) {
      // Validate if agent can handle the task
      const validation = await agent.validate(context);

      if (validation.canHandle) {
        // Calculate confidence score
        let confidence = validation.confidence;

        // Boost confidence if agent type matches preferred types
        if (preferredTypes.includes(agent.type)) {
          confidence = Math.min(1, confidence * 1.2);
        }

        // Boost confidence if agent supports detected languages
        const languageMatch = languages.some(lang =>
          agent.capabilities.languages.includes(lang)
        );
        if (languageMatch) {
          confidence = Math.min(1, confidence * 1.1);
        }

        // Boost confidence if agent handles target file patterns
        const patternMatch = context.task.targetFiles.some(file =>
          agent.capabilities.filePatterns.some(pattern =>
            this.matchesPattern(file, pattern)
          )
        );
        if (patternMatch) {
          confidence = Math.min(1, confidence * 1.1);
        }

        candidates.push({
          agent,
          confidence,
          reason: validation.reason,
          validation,
        });
      }
    }

    return candidates;
  }

  /**
   * Detect programming languages from file paths.
   */
  private detectLanguages(files: string[]): string[] {
    const languages = new Set<string>();

    for (const file of files) {
      const ext = file.substring(file.lastIndexOf('.'));
      const language = EXTENSION_LANGUAGE_MAP[ext];
      if (language) {
        languages.add(language);
      }
    }

    return Array.from(languages);
  }

  /**
   * Match a file path against a glob pattern (simplified).
   */
  private matchesPattern(file: string, pattern: string): boolean {
    // Simple glob matching (supports * and **)
    const regexPattern = pattern
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\./g, '\\.');

    return new RegExp(`^${regexPattern}$`).test(file);
  }

  /**
   * Select based on criteria (simpler method).
   */
  selectByCriteria(criteria: AgentSelectionCriteria): Agent[] {
    return this.registry.getAll().filter(agent => {
      // Filter by task type
      if (criteria.taskType) {
        const preferredTypes = TASK_TYPE_MAPPING[criteria.taskType] || [];
        if (!preferredTypes.includes(agent.type)) {
          return false;
        }
      }

      // Filter by capabilities
      if (criteria.capabilities) {
        const caps = agent.capabilities;
        if (criteria.capabilities.canGenerateCode && !caps.canGenerateCode) return false;
        if (criteria.capabilities.canGenerateTests && !caps.canGenerateTests) return false;
        if (criteria.capabilities.canReviewCode && !caps.canReviewCode) return false;
        if (criteria.capabilities.canGenerateDocs && !caps.canGenerateDocs) return false;
        if (criteria.capabilities.canRefactor && !caps.canRefactor) return false;
      }

      // Filter by languages
      if (criteria.languages?.length) {
        const hasLanguage = criteria.languages.some(lang =>
          agent.capabilities.languages.includes(lang)
        );
        if (!hasLanguage) return false;
      }

      return true;
    });
  }
}

// ============================================================================
// Global Registry Instance
// ============================================================================

/**
 * Default global agent registry.
 */
export const globalAgentRegistry = new AgentRegistry();
