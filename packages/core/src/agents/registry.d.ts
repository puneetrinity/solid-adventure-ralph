/**
 * Agent Registry
 *
 * Manages registration and discovery of specialist agents.
 * Handles agent selection based on task characteristics.
 */
import { Agent, AgentType, AgentSelectionCriteria, AgentSelectionResult, AgentContext } from './types';
export declare class AgentRegistry {
    private readonly agents;
    /**
     * Register an agent.
     */
    register(agent: Agent, priority?: number, enabled?: boolean): void;
    /**
     * Unregister an agent.
     */
    unregister(agentId: string): boolean;
    /**
     * Get an agent by ID.
     */
    get(agentId: string): Agent | undefined;
    /**
     * Get all registered agents.
     */
    getAll(): Agent[];
    /**
     * Get agents by type.
     */
    getByType(type: AgentType): Agent | undefined;
    /**
     * Get all agents of a specific type.
     */
    getAllByType(type: AgentType): Agent[];
    /**
     * Enable/disable an agent.
     */
    setEnabled(agentId: string, enabled: boolean): void;
    /**
     * Set agent priority.
     */
    setPriority(agentId: string, priority: number): void;
    /**
     * List all agent IDs.
     */
    listIds(): string[];
    /**
     * Get registry size.
     */
    get size(): number;
    /**
     * Clear all agents.
     */
    clear(): void;
}
export declare class AgentSelector {
    private readonly registry;
    constructor(registry: AgentRegistry);
    /**
     * Select the best agent for a task context.
     */
    select(context: AgentContext): Promise<AgentSelectionResult | null>;
    /**
     * Select multiple agents for parallel execution.
     */
    selectMultiple(context: AgentContext, maxAgents?: number): Promise<AgentSelectionResult[]>;
    /**
     * Find candidate agents that can handle the task.
     */
    private findCandidates;
    /**
     * Detect programming languages from file paths.
     */
    private detectLanguages;
    /**
     * Match a file path against a glob pattern (simplified).
     */
    private matchesPattern;
    /**
     * Select based on criteria (simpler method).
     */
    selectByCriteria(criteria: AgentSelectionCriteria): Agent[];
}
/**
 * Default global agent registry.
 */
export declare const globalAgentRegistry: AgentRegistry;
