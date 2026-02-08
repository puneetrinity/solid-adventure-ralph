/**
 * Review Agent
 *
 * Specialist agent for code review: quality assessment, best practices,
 * security review, and improvement suggestions.
 */
import { AgentDescription, AgentContext, AgentValidationResult, ProposalResult } from '../types';
import { BaseAgent } from '../base-agent';
import type { LLMRunner } from '../../llm';
export interface ReviewFinding {
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: ReviewCategory;
    file: string;
    line?: number;
    message: string;
    suggestion?: string;
}
export type ReviewCategory = 'security' | 'performance' | 'maintainability' | 'reliability' | 'best-practice' | 'style' | 'documentation';
export interface ReviewResult {
    findings: ReviewFinding[];
    summary: string;
    overallScore: number;
    recommendations: string[];
}
export declare class ReviewAgent extends BaseAgent {
    constructor(runner?: LLMRunner);
    describe(): AgentDescription;
    validate(context: AgentContext): Promise<AgentValidationResult>;
    propose(context: AgentContext): Promise<ProposalResult>;
    private generateWithLLM;
    private buildReviewPrompt;
    private generateStubProposal;
    private generateStubReview;
    private generateReviewDiff;
    private determineRiskFromFindings;
    /**
     * Perform a standalone review without generating patches
     */
    review(context: AgentContext): Promise<ReviewResult>;
}
