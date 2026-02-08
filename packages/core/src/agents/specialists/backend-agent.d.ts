/**
 * Backend Agent
 *
 * Specialist agent for backend development: API endpoints, database operations,
 * services, middleware, and server-side logic.
 */
import { AgentDescription, AgentContext, AgentValidationResult, ProposalResult } from '../types';
import { BaseAgent } from '../base-agent';
import type { LLMRunner } from '../../llm';
export declare class BackendAgent extends BaseAgent {
    constructor(runner?: LLMRunner);
    describe(): AgentDescription;
    validate(context: AgentContext): Promise<AgentValidationResult>;
    propose(context: AgentContext): Promise<ProposalResult>;
    private generateWithLLM;
    private buildBackendPrompt;
    private generateStubProposal;
    private generateBackendStubDiff;
    private assessRiskLevel;
}
