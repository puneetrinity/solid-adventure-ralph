/**
 * Cost & Token Tracking
 *
 * Tracks token usage, costs, and enforces budget limits.
 */
import type { PrismaClient } from '@prisma/client';
import type { AgentRole, LLMResponse } from './types';
import type { MemoryTier } from '../memory/types';
export interface TokenRecord {
    workflowId: string;
    runId: string;
    jobName: string;
    agentRole?: AgentRole;
    promptVersion?: string;
    memoryTier?: MemoryTier;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
    timestamp: Date;
}
export interface WorkflowUsage {
    workflowId: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCost: number;
    runCount: number;
    byAgent: Record<AgentRole, AgentUsage>;
    byJob: Record<string, JobUsage>;
}
export interface AgentUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    callCount: number;
}
export interface JobUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    runCount: number;
}
export interface Budget {
    maxTokensPerRun: number;
    maxTokensPerWorkflow: number;
    maxCostPerWorkflow: number;
    maxCostPerDay: number;
}
export interface BudgetCheckResult {
    allowed: boolean;
    reason?: string;
    currentUsage: {
        workflowTokens: number;
        workflowCost: number;
        dailyCost: number;
    };
    limits: Budget;
}
export declare const DEFAULT_BUDGET: Budget;
export declare const MODEL_PRICING: Record<string, {
    input: number;
    output: number;
}>;
/**
 * Calculate cost for token usage.
 */
export declare function calculateCost(inputTokens: number, outputTokens: number, modelId: string): number;
/**
 * Format cost as human-readable string.
 */
export declare function formatCost(cents: number): string;
export declare class CostTracker {
    private readonly prisma;
    private budget;
    constructor(prisma: PrismaClient, budget?: Partial<Budget>);
    /**
     * Record token usage for an LLM call.
     */
    recordUsage<T>(workflowId: string, runId: string, response: LLMResponse<T>, options: {
        jobName: string;
        memoryTier?: MemoryTier;
    }): Promise<TokenRecord>;
    /**
     * Get aggregated usage for a workflow.
     */
    getWorkflowUsage(workflowId: string): Promise<WorkflowUsage>;
    /**
     * Get daily usage across all workflows.
     */
    getDailyUsage(date?: Date): Promise<{
        totalTokens: number;
        totalCost: number;
    }>;
    /**
     * Check if usage is within budget.
     */
    checkBudget(workflowId: string, estimatedTokens: number): Promise<BudgetCheckResult>;
    /**
     * Update budget limits.
     */
    setBudget(budget: Partial<Budget>): void;
    /**
     * Get current budget configuration.
     */
    getBudget(): Budget;
}
export interface CostEstimateResponse {
    workflow: {
        id: string;
        totalTokens: number;
        totalCost: number;
        formattedCost: string;
        runCount: number;
    };
    byAgent: Array<{
        role: string;
        tokens: number;
        cost: number;
        formattedCost: string;
        calls: number;
    }>;
    byJob: Array<{
        job: string;
        tokens: number;
        cost: number;
        formattedCost: string;
        runs: number;
    }>;
    budget: {
        tokensRemaining: number;
        costRemaining: number;
        formattedCostRemaining: string;
        percentUsed: number;
    };
}
/**
 * Build cost estimation response from workflow usage.
 */
export declare function buildCostEstimateResponse(usage: WorkflowUsage, budget: Budget): CostEstimateResponse;
