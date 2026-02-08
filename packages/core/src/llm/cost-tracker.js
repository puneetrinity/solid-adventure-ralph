"use strict";
/**
 * Cost & Token Tracking
 *
 * Tracks token usage, costs, and enforces budget limits.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostTracker = exports.MODEL_PRICING = exports.DEFAULT_BUDGET = void 0;
exports.calculateCost = calculateCost;
exports.formatCost = formatCost;
exports.buildCostEstimateResponse = buildCostEstimateResponse;
// ============================================================================
// Default Budget
// ============================================================================
exports.DEFAULT_BUDGET = {
    maxTokensPerRun: 50000,
    maxTokensPerWorkflow: 500000,
    maxCostPerWorkflow: 1000, // $10
    maxCostPerDay: 5000 // $50
};
// ============================================================================
// Model Pricing
// ============================================================================
// Pricing per 1M tokens in cents
exports.MODEL_PRICING = {
    'gpt-4': { input: 3000, output: 6000 },
    'gpt-4-turbo': { input: 1000, output: 3000 },
    'gpt-4o': { input: 500, output: 1500 },
    'gpt-3.5-turbo': { input: 50, output: 150 },
    'claude-3-opus': { input: 1500, output: 7500 },
    'claude-3-sonnet': { input: 300, output: 1500 },
    'claude-3-haiku': { input: 25, output: 125 },
    'claude-3.5-sonnet': { input: 300, output: 1500 },
    default: { input: 100, output: 300 }
};
// ============================================================================
// Cost Calculator
// ============================================================================
/**
 * Calculate cost for token usage.
 */
function calculateCost(inputTokens, outputTokens, modelId) {
    const pricing = exports.MODEL_PRICING[modelId] ?? exports.MODEL_PRICING.default;
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return Math.ceil(inputCost + outputCost);
}
/**
 * Format cost as human-readable string.
 */
function formatCost(cents) {
    if (cents < 100) {
        return `${cents}¢`;
    }
    return `$${(cents / 100).toFixed(2)}`;
}
// ============================================================================
// Cost Tracker
// ============================================================================
class CostTracker {
    prisma;
    budget;
    constructor(prisma, budget) {
        this.prisma = prisma;
        this.budget = { ...exports.DEFAULT_BUDGET, ...budget };
    }
    /**
     * Record token usage for an LLM call.
     */
    async recordUsage(workflowId, runId, response, options) {
        const record = {
            workflowId,
            runId,
            jobName: options.jobName,
            agentRole: response.metadata.role,
            promptVersion: response.metadata.promptVersion,
            memoryTier: options.memoryTier,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            totalTokens: response.usage.totalTokens,
            estimatedCost: response.usage.estimatedCost,
            timestamp: response.metadata.timestamp
        };
        // Update workflow run with token data
        await this.prisma.workflowRun.update({
            where: { id: runId },
            data: {
                inputTokens: record.inputTokens,
                outputTokens: record.outputTokens,
                totalTokens: record.totalTokens,
                estimatedCost: record.estimatedCost,
                agentRole: record.agentRole,
                promptVersion: record.promptVersion,
                memoryTier: record.memoryTier
            }
        });
        return record;
    }
    /**
     * Get aggregated usage for a workflow.
     */
    async getWorkflowUsage(workflowId) {
        const runs = await this.prisma.workflowRun.findMany({
            where: {
                workflowId,
                inputTokens: { not: null }
            }
        });
        const usage = {
            workflowId,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            totalCost: 0,
            runCount: runs.length,
            byAgent: {},
            byJob: {}
        };
        for (const run of runs) {
            const inputTokens = run.inputTokens ?? 0;
            const outputTokens = run.outputTokens ?? 0;
            const totalTokens = run.totalTokens ?? 0;
            const cost = run.estimatedCost ?? 0;
            usage.totalInputTokens += inputTokens;
            usage.totalOutputTokens += outputTokens;
            usage.totalTokens += totalTokens;
            usage.totalCost += cost;
            // Aggregate by agent
            if (run.agentRole) {
                const role = run.agentRole;
                if (!usage.byAgent[role]) {
                    usage.byAgent[role] = {
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: 0,
                        cost: 0,
                        callCount: 0
                    };
                }
                usage.byAgent[role].inputTokens += inputTokens;
                usage.byAgent[role].outputTokens += outputTokens;
                usage.byAgent[role].totalTokens += totalTokens;
                usage.byAgent[role].cost += cost;
                usage.byAgent[role].callCount += 1;
            }
            // Aggregate by job
            if (!usage.byJob[run.jobName]) {
                usage.byJob[run.jobName] = {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                    cost: 0,
                    runCount: 0
                };
            }
            usage.byJob[run.jobName].inputTokens += inputTokens;
            usage.byJob[run.jobName].outputTokens += outputTokens;
            usage.byJob[run.jobName].totalTokens += totalTokens;
            usage.byJob[run.jobName].cost += cost;
            usage.byJob[run.jobName].runCount += 1;
        }
        return usage;
    }
    /**
     * Get daily usage across all workflows.
     */
    async getDailyUsage(date) {
        const targetDate = date ?? new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        const runs = await this.prisma.workflowRun.findMany({
            where: {
                startedAt: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                inputTokens: { not: null }
            },
            select: {
                totalTokens: true,
                estimatedCost: true
            }
        });
        return {
            totalTokens: runs.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0),
            totalCost: runs.reduce((sum, r) => sum + (r.estimatedCost ?? 0), 0)
        };
    }
    /**
     * Check if usage is within budget.
     */
    async checkBudget(workflowId, estimatedTokens) {
        const workflowUsage = await this.getWorkflowUsage(workflowId);
        const dailyUsage = await this.getDailyUsage();
        const currentUsage = {
            workflowTokens: workflowUsage.totalTokens,
            workflowCost: workflowUsage.totalCost,
            dailyCost: dailyUsage.totalCost
        };
        // Check per-run limit
        if (estimatedTokens > this.budget.maxTokensPerRun) {
            return {
                allowed: false,
                reason: `Estimated tokens (${estimatedTokens}) exceeds per-run limit (${this.budget.maxTokensPerRun})`,
                currentUsage,
                limits: this.budget
            };
        }
        // Check per-workflow limit
        if (workflowUsage.totalTokens + estimatedTokens > this.budget.maxTokensPerWorkflow) {
            return {
                allowed: false,
                reason: `Would exceed workflow token limit (${this.budget.maxTokensPerWorkflow})`,
                currentUsage,
                limits: this.budget
            };
        }
        // Check workflow cost limit
        if (workflowUsage.totalCost > this.budget.maxCostPerWorkflow) {
            return {
                allowed: false,
                reason: `Workflow cost (${formatCost(workflowUsage.totalCost)}) exceeds limit (${formatCost(this.budget.maxCostPerWorkflow)})`,
                currentUsage,
                limits: this.budget
            };
        }
        // Check daily cost limit
        if (dailyUsage.totalCost > this.budget.maxCostPerDay) {
            return {
                allowed: false,
                reason: `Daily cost (${formatCost(dailyUsage.totalCost)}) exceeds limit (${formatCost(this.budget.maxCostPerDay)})`,
                currentUsage,
                limits: this.budget
            };
        }
        return {
            allowed: true,
            currentUsage,
            limits: this.budget
        };
    }
    /**
     * Update budget limits.
     */
    setBudget(budget) {
        this.budget = { ...this.budget, ...budget };
    }
    /**
     * Get current budget configuration.
     */
    getBudget() {
        return { ...this.budget };
    }
}
exports.CostTracker = CostTracker;
/**
 * Build cost estimation response from workflow usage.
 */
function buildCostEstimateResponse(usage, budget) {
    const byAgent = Object.entries(usage.byAgent).map(([role, data]) => ({
        role,
        tokens: data.totalTokens,
        cost: data.cost,
        formattedCost: formatCost(data.cost),
        calls: data.callCount
    }));
    const byJob = Object.entries(usage.byJob).map(([job, data]) => ({
        job,
        tokens: data.totalTokens,
        cost: data.cost,
        formattedCost: formatCost(data.cost),
        runs: data.runCount
    }));
    const tokensRemaining = Math.max(0, budget.maxTokensPerWorkflow - usage.totalTokens);
    const costRemaining = Math.max(0, budget.maxCostPerWorkflow - usage.totalCost);
    const percentUsed = budget.maxCostPerWorkflow > 0
        ? (usage.totalCost / budget.maxCostPerWorkflow) * 100
        : 0;
    return {
        workflow: {
            id: usage.workflowId,
            totalTokens: usage.totalTokens,
            totalCost: usage.totalCost,
            formattedCost: formatCost(usage.totalCost),
            runCount: usage.runCount
        },
        byAgent,
        byJob,
        budget: {
            tokensRemaining,
            costRemaining,
            formattedCostRemaining: formatCost(costRemaining),
            percentUsed: Math.round(percentUsed * 10) / 10
        }
    };
}
//# sourceMappingURL=cost-tracker.js.map