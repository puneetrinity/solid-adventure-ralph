/**
 * Base Agent
 *
 * Abstract base class for specialist agents.
 * Provides common functionality and enforces the Agent interface.
 */
import { Agent, AgentType, AgentCapabilities, AgentDescription, AgentContext, AgentValidationResult, ProposalResult, PatchSetProposal, AgentPatchProposal, AgentPatchFile, ProposalMetadata } from './types';
import type { LLMRunner } from '../llm';
/**
 * Base agent configuration.
 */
export interface BaseAgentConfig {
    id: string;
    name: string;
    type: AgentType;
    capabilities: AgentCapabilities;
    runner?: LLMRunner;
}
/**
 * Abstract base class for all specialist agents.
 */
export declare abstract class BaseAgent implements Agent {
    readonly id: string;
    readonly name: string;
    readonly type: AgentType;
    readonly capabilities: AgentCapabilities;
    protected readonly runner?: LLMRunner;
    constructor(config: BaseAgentConfig);
    /**
     * Describe what this agent does.
     */
    abstract describe(): AgentDescription;
    /**
     * Validate whether this agent can handle the given task.
     */
    abstract validate(context: AgentContext): Promise<AgentValidationResult>;
    /**
     * Generate a proposal for the given task.
     */
    abstract propose(context: AgentContext): Promise<ProposalResult>;
    /**
     * Create a successful proposal result.
     */
    protected createSuccess(patchSet: PatchSetProposal, startTime: Date, tokensUsed?: number): ProposalResult;
    /**
     * Create a failed proposal result.
     */
    protected createFailure(error: string, startTime: Date): ProposalResult;
    /**
     * Create proposal metadata.
     */
    protected createMetadata(startTime: Date, tokensUsed?: number): ProposalMetadata;
    /**
     * Create a patch from a file change.
     */
    protected createPatch(taskId: string, title: string, summary: string, diff: string, files: AgentPatchFile[], options?: {
        addsTests?: boolean;
        riskLevel?: 'low' | 'medium' | 'high';
        commands?: string[];
    }): AgentPatchProposal;
    /**
     * Generate a unified diff for a file change.
     */
    protected generateDiff(path: string, oldContent: string, newContent: string): string;
    /**
     * Calculate file stats from content diff.
     */
    protected calculateFileStats(oldContent: string, newContent: string): {
        additions: number;
        deletions: number;
    };
    /**
     * Check if agent can handle file based on patterns.
     */
    protected canHandleFile(path: string): boolean;
    /**
     * Check if agent supports the language.
     */
    protected supportsLanguage(language: string): boolean;
}
/**
 * A stub agent that generates mock proposals for testing.
 */
export declare class StubAgent extends BaseAgent {
    constructor(type?: AgentType);
    describe(): AgentDescription;
    validate(context: AgentContext): Promise<AgentValidationResult>;
    propose(context: AgentContext): Promise<ProposalResult>;
}
