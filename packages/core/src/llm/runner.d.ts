/**
 * LLM Runner
 *
 * Core runner with retry, budget control, and structured output parsing.
 */
import type { PrismaClient } from '@prisma/client';
import { AgentRole, LLMInput, LLMResponse, LLMProvider, OutputSchema, TokenBudget, TokenUsage, RetryConfig } from './types';
export interface RunnerConfig {
    provider: LLMProvider;
    retryConfig?: RetryConfig;
    defaultBudget?: TokenBudget;
}
export declare class LLMRunner {
    private readonly provider;
    private readonly retryConfig;
    private readonly defaultBudget;
    private readonly prisma?;
    private sessionUsage;
    constructor(config: RunnerConfig, prisma?: PrismaClient);
    /**
     * Run an LLM call with retry and budget control.
     */
    run<T>(role: AgentRole, userPrompt: string, options?: {
        schema?: OutputSchema<T>;
        budget?: TokenBudget;
        context?: LLMInput['context'];
        promptVersion?: string;
    }): Promise<LLMResponse<T>>;
    /**
     * Get current session usage.
     */
    getSessionUsage(): TokenUsage;
    /**
     * Reset session usage tracking.
     */
    resetSessionUsage(): void;
    /**
     * Check if session is within budget.
     */
    isWithinBudget(budget?: TokenBudget): boolean;
    private updateSessionUsage;
    private shouldRetry;
    private classifyError;
    private delay;
    private createErrorResponse;
    private recordRun;
}
export declare class StubLLMProvider implements LLMProvider {
    name: string;
    modelId: string;
    private responses;
    private defaultResponse;
    setResponse(role: AgentRole, response: string): void;
    setDefaultResponse(response: string): void;
    call(input: LLMInput): Promise<LLMResponse>;
    estimateTokens(text: string): number;
}
