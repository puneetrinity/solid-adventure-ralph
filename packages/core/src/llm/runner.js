"use strict";
/**
 * LLM Runner
 *
 * Core runner with retry, budget control, and structured output parsing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubLLMProvider = exports.LLMRunner = void 0;
const prompts_1 = require("./prompts");
const crypto_1 = require("crypto");
// ============================================================================
// Default Configuration
// ============================================================================
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    retryOn: ['rate_limit', 'timeout', 'server_error']
};
const DEFAULT_BUDGET = {
    maxInputTokens: 100000,
    maxOutputTokens: 8000,
    maxTotalCost: 100 // $1.00
};
class LLMRunner {
    provider;
    retryConfig;
    defaultBudget;
    prisma;
    // Session tracking
    sessionUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0
    };
    constructor(config, prisma) {
        this.provider = config.provider;
        this.retryConfig = config.retryConfig ?? DEFAULT_RETRY_CONFIG;
        this.defaultBudget = config.defaultBudget ?? DEFAULT_BUDGET;
        this.prisma = prisma;
    }
    /**
     * Run an LLM call with retry and budget control.
     */
    async run(role, userPrompt, options = {}) {
        const requestId = (0, crypto_1.randomUUID)();
        const startTime = Date.now();
        const budget = options.budget ?? this.defaultBudget;
        const promptVersion = options.promptVersion ?? (0, prompts_1.getCurrentVersion)(role);
        const roleConfig = (0, prompts_1.getRoleConfig)(role);
        // Build input
        const input = {
            role,
            promptVersion,
            messages: [
                { role: 'system', content: (0, prompts_1.getPrompt)(role, promptVersion) },
                { role: 'user', content: userPrompt }
            ],
            context: options.context,
            budget
        };
        // Check budget before call
        const estimatedInputTokens = this.provider.estimateTokens(input.messages.map((m) => m.content).join('\n'));
        if (estimatedInputTokens > budget.maxInputTokens) {
            return this.createErrorResponse('BUDGET_EXCEEDED', `Estimated input tokens (${estimatedInputTokens}) exceeds budget (${budget.maxInputTokens})`, requestId, promptVersion, role, startTime);
        }
        // Execute with retry
        let lastError;
        let retryCount = 0;
        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                const response = await this.provider.call(input);
                // Update session usage
                this.updateSessionUsage(response.usage);
                // Check if over budget
                if (response.usage.estimatedCost > budget.maxTotalCost) {
                    return this.createErrorResponse('BUDGET_EXCEEDED', `Response cost (${response.usage.estimatedCost}c) exceeds budget (${budget.maxTotalCost}c)`, requestId, promptVersion, role, startTime, response.usage, retryCount);
                }
                // Parse and validate if schema provided
                if (options.schema && response.rawContent) {
                    const parsed = options.schema.parse(response.rawContent);
                    if (parsed === null) {
                        // Parse failed - retry if configured
                        if (this.shouldRetry('parse_error', attempt)) {
                            retryCount++;
                            await this.delay(attempt);
                            continue;
                        }
                        return this.createErrorResponse('PARSE_ERROR', 'Failed to parse LLM output as JSON', requestId, promptVersion, role, startTime, response.usage, retryCount);
                    }
                    const validation = options.schema.validate(parsed);
                    if (!validation.valid) {
                        // Validation failed - retry if configured
                        if (this.shouldRetry('invalid_response', attempt)) {
                            retryCount++;
                            await this.delay(attempt);
                            continue;
                        }
                        const errorDetails = validation.errors
                            ?.map((e) => `${e.path}: ${e.message}`)
                            .join('; ');
                        return this.createErrorResponse('VALIDATION_ERROR', `Schema validation failed: ${errorDetails}`, requestId, promptVersion, role, startTime, response.usage, retryCount);
                    }
                    // Success with validated data
                    const successResponse = {
                        success: true,
                        data: validation.data,
                        rawContent: response.rawContent,
                        usage: response.usage,
                        metadata: {
                            requestId,
                            model: this.provider.modelId,
                            promptVersion,
                            role,
                            latencyMs: Date.now() - startTime,
                            retryCount,
                            timestamp: new Date()
                        }
                    };
                    // Record run if prisma available
                    await this.recordRun(successResponse, options.context?.workflowId);
                    return successResponse;
                }
                // No schema - return raw response
                const rawResponse = {
                    success: true,
                    data: response.rawContent,
                    rawContent: response.rawContent,
                    usage: response.usage,
                    metadata: {
                        requestId,
                        model: this.provider.modelId,
                        promptVersion,
                        role,
                        latencyMs: Date.now() - startTime,
                        retryCount,
                        timestamp: new Date()
                    }
                };
                await this.recordRun(rawResponse, options.context?.workflowId);
                return rawResponse;
            }
            catch (error) {
                lastError = error;
                const condition = this.classifyError(error);
                if (this.shouldRetry(condition, attempt)) {
                    retryCount++;
                    await this.delay(attempt);
                    continue;
                }
                break;
            }
        }
        return this.createErrorResponse('PROVIDER_ERROR', lastError?.message ?? 'Unknown error', requestId, promptVersion, role, startTime, undefined, retryCount);
    }
    /**
     * Get current session usage.
     */
    getSessionUsage() {
        return { ...this.sessionUsage };
    }
    /**
     * Reset session usage tracking.
     */
    resetSessionUsage() {
        this.sessionUsage = {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCost: 0
        };
    }
    /**
     * Check if session is within budget.
     */
    isWithinBudget(budget) {
        const b = budget ?? this.defaultBudget;
        return (this.sessionUsage.inputTokens <= b.maxInputTokens &&
            this.sessionUsage.outputTokens <= b.maxOutputTokens &&
            this.sessionUsage.estimatedCost <= b.maxTotalCost);
    }
    // ============================================================================
    // Private Helpers
    // ============================================================================
    updateSessionUsage(usage) {
        this.sessionUsage.inputTokens += usage.inputTokens;
        this.sessionUsage.outputTokens += usage.outputTokens;
        this.sessionUsage.totalTokens += usage.totalTokens;
        this.sessionUsage.estimatedCost += usage.estimatedCost;
    }
    shouldRetry(condition, attempt) {
        return (attempt < this.retryConfig.maxRetries &&
            this.retryConfig.retryOn.includes(condition));
    }
    classifyError(error) {
        const message = error.message.toLowerCase();
        if (message.includes('rate limit') || message.includes('429')) {
            return 'rate_limit';
        }
        if (message.includes('timeout') || message.includes('timed out')) {
            return 'timeout';
        }
        if (message.includes('500') || message.includes('502') || message.includes('503')) {
            return 'server_error';
        }
        return 'invalid_response';
    }
    async delay(attempt) {
        const delay = Math.min(this.retryConfig.baseDelayMs * Math.pow(2, attempt), this.retryConfig.maxDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
    createErrorResponse(errorCode, message, requestId, promptVersion, role, startTime, usage, retryCount = 0) {
        return {
            success: false,
            error: `${errorCode}: ${message}`,
            usage: usage ?? {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                estimatedCost: 0
            },
            metadata: {
                requestId,
                model: this.provider.modelId,
                promptVersion,
                role,
                latencyMs: Date.now() - startTime,
                retryCount,
                timestamp: new Date()
            }
        };
    }
    async recordRun(response, workflowId) {
        if (!this.prisma || !workflowId)
            return;
        try {
            await this.prisma.workflowRun.create({
                data: {
                    workflowId,
                    jobName: `llm_${response.metadata.role}`,
                    status: response.success ? 'completed' : 'failed',
                    inputHash: response.metadata.requestId,
                    inputs: {
                        promptVersion: response.metadata.promptVersion,
                        model: response.metadata.model
                    },
                    outputs: response.success
                        ? JSON.parse(JSON.stringify({
                            success: true,
                            usage: response.usage
                        }))
                        : JSON.parse(JSON.stringify({
                            success: false,
                            error: response.error
                        })),
                    errorMsg: response.error,
                    durationMs: response.metadata.latencyMs
                }
            });
        }
        catch {
            // Silently fail - don't break the LLM call for recording issues
        }
    }
}
exports.LLMRunner = LLMRunner;
// Simple cost calculation for stub provider (full implementation in cost-tracker.ts)
function calculateCost(inputTokens, outputTokens, modelId) {
    // Simplified pricing - use cost-tracker.ts for accurate pricing
    const pricing = { input: 100, output: 300 }; // default cents per 1M tokens
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return Math.ceil(inputCost + outputCost);
}
// ============================================================================
// Stub Provider (for testing)
// ============================================================================
class StubLLMProvider {
    name = 'stub';
    modelId = 'stub-model';
    responses = new Map();
    defaultResponse = '{"message": "stub response"}';
    setResponse(role, response) {
        this.responses.set(role, response);
    }
    setDefaultResponse(response) {
        this.defaultResponse = response;
    }
    async call(input) {
        const rawContent = this.responses.get(input.role) ?? this.defaultResponse;
        const inputTokens = this.estimateTokens(input.messages.map((m) => m.content).join('\n'));
        const outputTokens = this.estimateTokens(rawContent);
        return {
            success: true,
            rawContent,
            usage: {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                estimatedCost: calculateCost(inputTokens, outputTokens, this.modelId)
            },
            metadata: {
                requestId: (0, crypto_1.randomUUID)(),
                model: this.modelId,
                promptVersion: input.promptVersion,
                role: input.role,
                latencyMs: 10,
                retryCount: 0,
                timestamp: new Date()
            }
        };
    }
    estimateTokens(text) {
        // Rough estimate: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
}
exports.StubLLMProvider = StubLLMProvider;
//# sourceMappingURL=runner.js.map