/**
 * Cost & Token Tracking
 *
 * Tracks token usage, costs, and enforces budget limits.
 */

import type { PrismaClient } from '@prisma/client';
import type { AgentRole, TokenUsage, LLMResponse } from './types';
import type { MemoryTier } from '../memory/types';

// ============================================================================
// Types
// ============================================================================

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
  estimatedCost: number; // in cents
  timestamp: Date;
}

export interface WorkflowUsage {
  workflowId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number; // in cents
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
  maxCostPerWorkflow: number; // in cents
  maxCostPerDay: number; // in cents
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

// ============================================================================
// Default Budget
// ============================================================================

export const DEFAULT_BUDGET: Budget = {
  maxTokensPerRun: 50000,
  maxTokensPerWorkflow: 500000,
  maxCostPerWorkflow: 1000, // $10
  maxCostPerDay: 5000 // $50
};

// ============================================================================
// Model Pricing
// ============================================================================

// Pricing per 1M tokens in cents
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
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
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  modelId: string
): number {
  const pricing = MODEL_PRICING[modelId] ?? MODEL_PRICING.default;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.ceil(inputCost + outputCost);
}

/**
 * Format cost as human-readable string.
 */
export function formatCost(cents: number): string {
  if (cents < 100) {
    return `${cents}¢`;
  }
  return `$${(cents / 100).toFixed(2)}`;
}

// ============================================================================
// Cost Tracker
// ============================================================================

export class CostTracker {
  private budget: Budget;

  constructor(
    private readonly prisma: PrismaClient,
    budget?: Partial<Budget>
  ) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
  }

  /**
   * Record token usage for an LLM call.
   */
  async recordUsage<T>(
    workflowId: string,
    runId: string,
    response: LLMResponse<T>,
    options: {
      jobName: string;
      memoryTier?: MemoryTier;
    }
  ): Promise<TokenRecord> {
    const record: TokenRecord = {
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
  async getWorkflowUsage(workflowId: string): Promise<WorkflowUsage> {
    const runs = await this.prisma.workflowRun.findMany({
      where: {
        workflowId,
        inputTokens: { not: null }
      }
    });

    const usage: WorkflowUsage = {
      workflowId,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      runCount: runs.length,
      byAgent: {} as Record<AgentRole, AgentUsage>,
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
        const role = run.agentRole as AgentRole;
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
  async getDailyUsage(date?: Date): Promise<{ totalTokens: number; totalCost: number }> {
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
  async checkBudget(
    workflowId: string,
    estimatedTokens: number
  ): Promise<BudgetCheckResult> {
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
  setBudget(budget: Partial<Budget>): void {
    this.budget = { ...this.budget, ...budget };
  }

  /**
   * Get current budget configuration.
   */
  getBudget(): Budget {
    return { ...this.budget };
  }
}

// ============================================================================
// Cost Estimation API Response
// ============================================================================

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
export function buildCostEstimateResponse(
  usage: WorkflowUsage,
  budget: Budget
): CostEstimateResponse {
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
