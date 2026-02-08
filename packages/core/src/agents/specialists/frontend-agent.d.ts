/**
 * Frontend Agent
 *
 * Specialist agent for frontend development: UI components, styling,
 * client-side logic, and user interactions.
 */
import { AgentDescription, AgentContext, AgentValidationResult, ProposalResult } from '../types';
import { BaseAgent } from '../base-agent';
import type { LLMRunner } from '../../llm';
export declare class FrontendAgent extends BaseAgent {
    constructor(runner?: LLMRunner);
    describe(): AgentDescription;
    validate(context: AgentContext): Promise<AgentValidationResult>;
    propose(context: AgentContext): Promise<ProposalResult>;
    private generateWithLLM;
    private buildFrontendPrompt;
    private generateStubProposal;
    private generateFrontendStubDiff;
}
