/**
 * Test Agent
 *
 * Specialist agent for test generation: unit tests, integration tests,
 * test fixtures, and coverage improvements.
 */
import { AgentDescription, AgentContext, AgentValidationResult, ProposalResult } from '../types';
import { BaseAgent } from '../base-agent';
import type { LLMRunner } from '../../llm';
export declare class TestAgent extends BaseAgent {
    constructor(runner?: LLMRunner);
    describe(): AgentDescription;
    validate(context: AgentContext): Promise<AgentValidationResult>;
    propose(context: AgentContext): Promise<ProposalResult>;
    private generateWithLLM;
    private buildTestPrompt;
    private generateStubProposal;
    private determineTestFiles;
    private generateTestStubDiff;
    private extractModuleName;
    private getRelativeImport;
}
