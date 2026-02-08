/**
 * Tests for Cost & Token Tracking
 */

import {
  CostTracker,
  calculateCost,
  formatCost,
  buildCostEstimateResponse,
  DEFAULT_BUDGET,
  MODEL_PRICING,
  type Budget,
  type WorkflowUsage,
  type LLMResponse,
  type AgentRole
} from '../../packages/core/src/llm';

// Mock Prisma
const createMockPrisma = () => ({
  workflowRun: {
    update: jest.fn(),
    findMany: jest.fn()
  }
});

// Mock LLM response
const createMockResponse = (
  role: AgentRole,
  inputTokens: number,
  outputTokens: number
): LLMResponse<any> => ({
  success: true,
  data: {},
  rawContent: '{}',
  usage: {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCost: calculateCost(inputTokens, outputTokens, 'gpt-4')
  },
  metadata: {
    requestId: 'req-123',
    model: 'gpt-4',
    promptVersion: 'v1',
    role,
    latencyMs: 100,
    retryCount: 0,
    timestamp: new Date()
  }
});

describe('calculateCost', () => {
  it('should calculate cost for known models', () => {
    // GPT-4: 3000/6000 cents per 1M tokens
    const cost = calculateCost(10000, 5000, 'gpt-4');
    // (10000/1M * 3000) + (5000/1M * 6000) = 30 + 30 = 60 cents (in units of cents per 1M)
    // Actually: (10000 * 3000 / 1M) + (5000 * 6000 / 1M) = 30 + 30 = 60
    expect(cost).toBeGreaterThan(0);
  });

  it('should calculate higher cost for more tokens', () => {
    const lowCost = calculateCost(10000, 5000, 'gpt-4');
    const highCost = calculateCost(100000, 50000, 'gpt-4');
    expect(highCost).toBeGreaterThan(lowCost);
  });

  it('should use default pricing for unknown models', () => {
    const cost = calculateCost(10000, 5000, 'unknown-model');
    expect(cost).toBeGreaterThan(0);
  });

  it('should calculate zero for zero tokens', () => {
    const cost = calculateCost(0, 0, 'gpt-4');
    expect(cost).toBe(0);
  });

  it('should handle different model pricing', () => {
    const gpt4Cost = calculateCost(100000, 50000, 'gpt-4');
    const haikusCost = calculateCost(100000, 50000, 'claude-3-haiku');
    expect(gpt4Cost).toBeGreaterThan(haikusCost); // GPT-4 is more expensive
  });
});

describe('formatCost', () => {
  it('should format cents as cents', () => {
    expect(formatCost(50)).toBe('50¢');
    expect(formatCost(1)).toBe('1¢');
    expect(formatCost(99)).toBe('99¢');
  });

  it('should format dollars for 100+ cents', () => {
    expect(formatCost(100)).toBe('$1.00');
    expect(formatCost(150)).toBe('$1.50');
    expect(formatCost(1000)).toBe('$10.00');
    expect(formatCost(1234)).toBe('$12.34');
  });

  it('should handle zero', () => {
    expect(formatCost(0)).toBe('0¢');
  });
});

describe('DEFAULT_BUDGET', () => {
  it('should have reasonable limits', () => {
    expect(DEFAULT_BUDGET.maxTokensPerRun).toBe(50000);
    expect(DEFAULT_BUDGET.maxTokensPerWorkflow).toBe(500000);
    expect(DEFAULT_BUDGET.maxCostPerWorkflow).toBe(1000); // $10
    expect(DEFAULT_BUDGET.maxCostPerDay).toBe(5000); // $50
  });
});

describe('MODEL_PRICING', () => {
  it('should have pricing for common models', () => {
    expect(MODEL_PRICING['gpt-4']).toBeDefined();
    expect(MODEL_PRICING['gpt-4-turbo']).toBeDefined();
    expect(MODEL_PRICING['gpt-3.5-turbo']).toBeDefined();
    expect(MODEL_PRICING['claude-3-opus']).toBeDefined();
    expect(MODEL_PRICING['claude-3-sonnet']).toBeDefined();
    expect(MODEL_PRICING['claude-3-haiku']).toBeDefined();
    expect(MODEL_PRICING.default).toBeDefined();
  });

  it('should have input/output pricing', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.input).toBeGreaterThan(0);
      expect(pricing.output).toBeGreaterThan(0);
    }
  });
});

describe('CostTracker', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let tracker: CostTracker;

  beforeEach(() => {
    prisma = createMockPrisma();
    tracker = new CostTracker(prisma as any);
  });

  describe('recordUsage', () => {
    it('should record token usage to workflow run', async () => {
      const response = createMockResponse('architect', 1000, 500);

      const record = await tracker.recordUsage('wf-1', 'run-1', response, {
        jobName: 'ingest_context'
      });

      expect(record.workflowId).toBe('wf-1');
      expect(record.runId).toBe('run-1');
      expect(record.inputTokens).toBe(1000);
      expect(record.outputTokens).toBe(500);
      expect(record.agentRole).toBe('architect');

      expect(prisma.workflowRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          agentRole: 'architect'
        })
      });
    });

    it('should include memory tier when provided', async () => {
      const response = createMockResponse('coder', 2000, 1000);

      await tracker.recordUsage('wf-1', 'run-1', response, {
        jobName: 'generate_patches',
        memoryTier: 'HOT'
      });

      expect(prisma.workflowRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          memoryTier: 'HOT'
        })
      });
    });
  });

  describe('getWorkflowUsage', () => {
    it('should aggregate usage from workflow runs', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([
        {
          id: 'run-1',
          jobName: 'ingest_context',
          agentRole: 'architect',
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          estimatedCost: 10
        },
        {
          id: 'run-2',
          jobName: 'generate_patches',
          agentRole: 'coder',
          inputTokens: 2000,
          outputTokens: 1000,
          totalTokens: 3000,
          estimatedCost: 20
        }
      ]);

      const usage = await tracker.getWorkflowUsage('wf-1');

      expect(usage.totalInputTokens).toBe(3000);
      expect(usage.totalOutputTokens).toBe(1500);
      expect(usage.totalTokens).toBe(4500);
      expect(usage.totalCost).toBe(30);
      expect(usage.runCount).toBe(2);
    });

    it('should aggregate by agent role', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([
        { id: 'r1', jobName: 'j1', agentRole: 'architect', inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 5 },
        { id: 'r2', jobName: 'j2', agentRole: 'architect', inputTokens: 200, outputTokens: 100, totalTokens: 300, estimatedCost: 10 },
        { id: 'r3', jobName: 'j3', agentRole: 'coder', inputTokens: 500, outputTokens: 250, totalTokens: 750, estimatedCost: 20 }
      ]);

      const usage = await tracker.getWorkflowUsage('wf-1');

      expect(usage.byAgent.architect.totalTokens).toBe(450);
      expect(usage.byAgent.architect.callCount).toBe(2);
      expect(usage.byAgent.coder.totalTokens).toBe(750);
      expect(usage.byAgent.coder.callCount).toBe(1);
    });

    it('should aggregate by job name', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([
        { id: 'r1', jobName: 'ingest_context', agentRole: 'architect', inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCost: 5 },
        { id: 'r2', jobName: 'ingest_context', agentRole: 'architect', inputTokens: 200, outputTokens: 100, totalTokens: 300, estimatedCost: 10 },
        { id: 'r3', jobName: 'apply_patches', agentRole: 'coder', inputTokens: 500, outputTokens: 250, totalTokens: 750, estimatedCost: 20 }
      ]);

      const usage = await tracker.getWorkflowUsage('wf-1');

      expect(usage.byJob['ingest_context'].totalTokens).toBe(450);
      expect(usage.byJob['ingest_context'].runCount).toBe(2);
      expect(usage.byJob['apply_patches'].totalTokens).toBe(750);
      expect(usage.byJob['apply_patches'].runCount).toBe(1);
    });
  });

  describe('getDailyUsage', () => {
    it('should sum daily usage', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([
        { totalTokens: 1000, estimatedCost: 10 },
        { totalTokens: 2000, estimatedCost: 20 },
        { totalTokens: 500, estimatedCost: 5 }
      ]);

      const usage = await tracker.getDailyUsage();

      expect(usage.totalTokens).toBe(3500);
      expect(usage.totalCost).toBe(35);
    });
  });

  describe('checkBudget', () => {
    it('should allow within budget', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([]);

      const result = await tracker.checkBudget('wf-1', 10000);

      expect(result.allowed).toBe(true);
    });

    it('should block when per-run limit exceeded', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([]);

      const result = await tracker.checkBudget('wf-1', 100000); // Over 50k limit

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('per-run limit');
    });

    it('should block when workflow limit exceeded', async () => {
      // Mock existing usage near limit
      prisma.workflowRun.findMany.mockResolvedValue([
        { inputTokens: 200000, outputTokens: 200000, totalTokens: 400000, estimatedCost: 500, agentRole: 'coder', jobName: 'job' }
      ]);

      // Request 40000 tokens (within per-run limit) which would push workflow over 500k total
      const result = await tracker.checkBudget('wf-1', 40000);

      // Total would be 400000 + 40000 = 440000 which is under 500k, so need more existing usage
      // Actually set to check: 400000 + X > 500000, X must exceed per-run first
      // Let's request more existing usage
      prisma.workflowRun.findMany.mockResolvedValue([
        { inputTokens: 250000, outputTokens: 200000, totalTokens: 450000, estimatedCost: 500, agentRole: 'coder', jobName: 'job' }
      ]);

      const result2 = await tracker.checkBudget('wf-1', 40000);

      // 450000 + 40000 = 490000, still under 500000
      // Need to push it over - but 50001 would trigger per-run limit first
      // This test needs a smaller request after high existing usage
      prisma.workflowRun.findMany.mockResolvedValue([
        { inputTokens: 250000, outputTokens: 230000, totalTokens: 480000, estimatedCost: 500, agentRole: 'coder', jobName: 'job' }
      ]);

      const result3 = await tracker.checkBudget('wf-1', 30000);
      // 480000 + 30000 = 510000 > 500000, and 30000 < 50000 per-run limit
      expect(result3.allowed).toBe(false);
      expect(result3.reason).toContain('workflow token limit');
    });

    it('should block when workflow cost exceeded', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([
        { inputTokens: 100000, outputTokens: 50000, totalTokens: 150000, estimatedCost: 1500, agentRole: 'coder', jobName: 'job' }
      ]);

      const result = await tracker.checkBudget('wf-1', 1000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cost');
    });

    it('should include current usage in result', async () => {
      prisma.workflowRun.findMany.mockResolvedValue([
        { inputTokens: 1000, outputTokens: 500, totalTokens: 1500, estimatedCost: 10, agentRole: 'coder', jobName: 'job' }
      ]);

      const result = await tracker.checkBudget('wf-1', 1000);

      expect(result.currentUsage.workflowTokens).toBe(1500);
      expect(result.currentUsage.workflowCost).toBe(10);
    });
  });

  describe('budget configuration', () => {
    it('should allow custom budget', () => {
      const customTracker = new CostTracker(prisma as any, {
        maxTokensPerRun: 100000,
        maxCostPerWorkflow: 5000
      });

      const budget = customTracker.getBudget();
      expect(budget.maxTokensPerRun).toBe(100000);
      expect(budget.maxCostPerWorkflow).toBe(5000);
      expect(budget.maxTokensPerWorkflow).toBe(DEFAULT_BUDGET.maxTokensPerWorkflow);
    });

    it('should allow updating budget', () => {
      tracker.setBudget({ maxCostPerDay: 10000 });

      const budget = tracker.getBudget();
      expect(budget.maxCostPerDay).toBe(10000);
    });
  });
});

describe('buildCostEstimateResponse', () => {
  it('should build API response from usage', () => {
    const usage: WorkflowUsage = {
      workflowId: 'wf-1',
      totalInputTokens: 3000,
      totalOutputTokens: 1500,
      totalTokens: 4500,
      totalCost: 30,
      runCount: 3,
      byAgent: {
        architect: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500, cost: 10, callCount: 1 },
        coder: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000, cost: 20, callCount: 2 }
      } as any,
      byJob: {
        ingest_context: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500, cost: 10, runCount: 1 },
        generate_patches: { inputTokens: 2000, outputTokens: 1000, totalTokens: 3000, cost: 20, runCount: 2 }
      }
    };

    const response = buildCostEstimateResponse(usage, DEFAULT_BUDGET);

    expect(response.workflow.id).toBe('wf-1');
    expect(response.workflow.totalTokens).toBe(4500);
    expect(response.workflow.formattedCost).toBe('30¢');
    expect(response.byAgent).toHaveLength(2);
    expect(response.byJob).toHaveLength(2);
    expect(response.budget.tokensRemaining).toBe(500000 - 4500);
    expect(response.budget.percentUsed).toBe(3); // 30/1000 = 3%
  });
});
