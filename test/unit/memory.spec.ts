/**
 * Tests for Tiered Memory Management
 */

import {
  ContextLoader,
  estimateTokens,
  hashContent,
  formatContextAsText,
  TIER_CONFIGS,
  DEFAULT_LOAD_OPTIONS,
  type MemoryTier,
  type MemoryItem,
  type LoadedContext,
  type ContextLoadOptions
} from '../../packages/core/src/memory';

// Mock Prisma
const createMockPrisma = () => ({
  workflow: {
    findUnique: jest.fn(),
    findMany: jest.fn()
  },
  workflowRun: {
    update: jest.fn()
  }
});

describe('Token Estimation', () => {
  it('should estimate tokens at ~4 chars per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('test')).toBe(1);
    expect(estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75 -> 3
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  it('should round up token count', () => {
    expect(estimateTokens('ab')).toBe(1); // 2 / 4 = 0.5 -> 1
    expect(estimateTokens('abc')).toBe(1); // 3 / 4 = 0.75 -> 1
    expect(estimateTokens('abcd')).toBe(1); // 4 / 4 = 1
    expect(estimateTokens('abcde')).toBe(2); // 5 / 4 = 1.25 -> 2
  });
});

describe('Content Hashing', () => {
  it('should produce consistent hashes', () => {
    const hash1 = hashContent('test content');
    const hash2 = hashContent('test content');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different content', () => {
    const hash1 = hashContent('content A');
    const hash2 = hashContent('content B');
    expect(hash1).not.toBe(hash2);
  });

  it('should produce 16-char hashes', () => {
    const hash = hashContent('any content');
    expect(hash.length).toBe(16);
  });
});

describe('Tier Configurations', () => {
  it('should have HOT with highest priority', () => {
    expect(TIER_CONFIGS.HOT.priority).toBe(1);
    expect(TIER_CONFIGS.WARM.priority).toBe(2);
    expect(TIER_CONFIGS.COLD.priority).toBe(3);
  });

  it('should have HOT with most tokens', () => {
    expect(TIER_CONFIGS.HOT.maxTokens).toBeGreaterThan(TIER_CONFIGS.WARM.maxTokens);
    expect(TIER_CONFIGS.WARM.maxTokens).toBeGreaterThan(TIER_CONFIGS.COLD.maxTokens);
  });

  it('should have HOT auto-load enabled', () => {
    expect(TIER_CONFIGS.HOT.autoLoad).toBe(true);
    expect(TIER_CONFIGS.WARM.autoLoad).toBe(false);
    expect(TIER_CONFIGS.COLD.autoLoad).toBe(false);
  });

  it('should have increasing TTL for colder tiers', () => {
    expect(TIER_CONFIGS.HOT.ttlHours).toBeLessThan(TIER_CONFIGS.WARM.ttlHours);
    expect(TIER_CONFIGS.WARM.ttlHours).toBeLessThan(TIER_CONFIGS.COLD.ttlHours);
  });
});

describe('Default Load Options', () => {
  it('should include HOT and WARM by default', () => {
    expect(DEFAULT_LOAD_OPTIONS.includeTiers).toContain('HOT');
    expect(DEFAULT_LOAD_OPTIONS.includeTiers).toContain('WARM');
    expect(DEFAULT_LOAD_OPTIONS.includeTiers).not.toContain('COLD');
  });

  it('should have reasonable max tokens', () => {
    expect(DEFAULT_LOAD_OPTIONS.maxTokens).toBeGreaterThan(10000);
    expect(DEFAULT_LOAD_OPTIONS.maxTokens).toBeLessThan(100000);
  });
});

describe('ContextLoader', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let loader: ContextLoader;

  beforeEach(() => {
    prisma = createMockPrisma();
    loader = new ContextLoader(prisma as any);
  });

  describe('loadContext', () => {
    it('should return empty context for missing workflow', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      const context = await loader.loadContext({
        workflowId: 'wf-missing',
        maxTokens: 10000,
        includeTiers: ['HOT']
      });

      expect(context.items).toHaveLength(0);
      expect(context.totalTokens).toBe(0);
    });

    it('should load HOT tier items', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'INGESTED',
        baseSha: 'abc123',
        artifacts: [
          { id: 'art-1', kind: 'DecisionV1', content: 'Decision content', contentSha: 'sha1', createdAt: new Date() }
        ],
        events: [
          { type: 'E_WORKFLOW_CREATED', createdAt: new Date(), payload: {} }
        ],
        patchSets: []
      });

      const context = await loader.loadContext({
        workflowId: 'wf-1',
        maxTokens: 10000,
        includeTiers: ['HOT']
      });

      expect(context.items.length).toBeGreaterThan(0);
      expect(context.items.every(i => i.tier === 'HOT')).toBe(true);
      expect(context.tierBreakdown.hot.itemCount).toBeGreaterThan(0);
    });

    it('should respect maxTokens limit', async () => {
      // Create artifact with lots of content
      const longContent = 'a'.repeat(10000); // ~2500 tokens

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'INGESTED',
        baseSha: 'abc123',
        artifacts: [
          { id: 'art-1', kind: 'Test', content: longContent, contentSha: 'sha1', createdAt: new Date() },
          { id: 'art-2', kind: 'Test', content: longContent, contentSha: 'sha2', createdAt: new Date() }
        ],
        events: [],
        patchSets: []
      });

      const context = await loader.loadContext({
        workflowId: 'wf-1',
        maxTokens: 3000, // Limit to ~3000 tokens
        includeTiers: ['HOT']
      });

      expect(context.totalTokens).toBeLessThanOrEqual(3000);
    });

    it('should load WARM tier with related workflows', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'INGESTED',
        baseSha: 'abc123',
        artifacts: [],
        events: [],
        patchSets: []
      });

      prisma.workflow.findMany.mockResolvedValue([
        {
          id: 'wf-old',
          state: 'DONE',
          baseSha: 'abc123',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          artifacts: [
            { kind: 'DecisionV1', content: 'Old decision', contentSha: 'old-sha', createdAt: new Date() }
          ]
        }
      ]);

      const context = await loader.loadContext({
        workflowId: 'wf-1',
        maxTokens: 10000,
        includeTiers: ['HOT', 'WARM'],
        includeRelatedWorkflows: true
      });

      const warmItems = context.items.filter(i => i.tier === 'WARM');
      expect(warmItems.length).toBeGreaterThan(0);
    });

    it('should filter by item type', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'INGESTED',
        baseSha: 'abc123',
        artifacts: [
          { id: 'art-1', kind: 'DecisionV1', content: 'Decision', contentSha: 'sha1', createdAt: new Date() }
        ],
        events: [
          { type: 'E_WORKFLOW_CREATED', createdAt: new Date(), payload: {} }
        ],
        patchSets: []
      });

      const context = await loader.loadContext({
        workflowId: 'wf-1',
        maxTokens: 10000,
        includeTiers: ['HOT'],
        includeTypes: ['artifact']
      });

      expect(context.items.every(i => i.type === 'artifact')).toBe(true);
    });

    it('should exclude specified types', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'INGESTED',
        baseSha: 'abc123',
        artifacts: [
          { id: 'art-1', kind: 'DecisionV1', content: 'Decision', contentSha: 'sha1', createdAt: new Date() }
        ],
        events: [
          { type: 'E_WORKFLOW_CREATED', createdAt: new Date(), payload: {} }
        ],
        patchSets: []
      });

      const context = await loader.loadContext({
        workflowId: 'wf-1',
        maxTokens: 10000,
        includeTiers: ['HOT'],
        excludeTypes: ['event']
      });

      expect(context.items.some(i => i.type === 'event')).toBe(false);
    });

    it('should calculate tier breakdown correctly', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'INGESTED',
        baseSha: 'abc123',
        artifacts: [
          { id: 'art-1', kind: 'DecisionV1', content: 'a'.repeat(400), contentSha: 'sha1', createdAt: new Date() }
        ],
        events: [],
        patchSets: []
      });

      const context = await loader.loadContext({
        workflowId: 'wf-1',
        maxTokens: 10000,
        includeTiers: ['HOT']
      });

      expect(context.tierBreakdown.hot.percentage).toBe(100);
      expect(context.tierBreakdown.warm.percentage).toBe(0);
      expect(context.tierBreakdown.cold.percentage).toBe(0);
    });

    it('should include load timing metadata', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'INGESTED',
        baseSha: 'abc123',
        artifacts: [],
        events: [],
        patchSets: []
      });

      const context = await loader.loadContext({
        workflowId: 'wf-1',
        maxTokens: 10000,
        includeTiers: ['HOT']
      });

      expect(context.loadedAt).toBeInstanceOf(Date);
      expect(context.loadDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getMemoryStats', () => {
    it('should return memory statistics', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'INGESTED',
        baseSha: 'abc123',
        artifacts: [
          { id: 'art-1', kind: 'DecisionV1', content: 'Decision content', contentSha: 'sha1', createdAt: new Date() }
        ],
        events: [],
        patchSets: []
      });

      prisma.workflow.findMany.mockResolvedValue([]);

      const stats = await loader.getMemoryStats('wf-1');

      expect(stats.workflowId).toBe('wf-1');
      expect(stats.totalItems).toBeGreaterThan(0);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.savingsPercentage).toBeGreaterThan(0);
    });
  });

  describe('recordTokenSavings', () => {
    it('should calculate savings correctly', async () => {
      prisma.workflowRun.update.mockResolvedValue({});

      const savings = await loader.recordTokenSavings(
        'wf-1',
        'run-1',
        10000,
        7000,
        ['HOT', 'WARM']
      );

      expect(savings.savedTokens).toBe(3000);
      expect(savings.savingsPercentage).toBe(30);
      expect(savings.tiersUsed).toEqual(['HOT', 'WARM']);
    });

    it('should handle zero baseline', async () => {
      const savings = await loader.recordTokenSavings(
        'wf-1',
        'run-1',
        0,
        0,
        ['HOT']
      );

      expect(savings.savingsPercentage).toBe(0);
    });
  });
});

describe('formatContextAsText', () => {
  it('should format context items as text', () => {
    const context: LoadedContext = {
      workflowId: 'wf-1',
      items: [
        {
          id: 'item-1',
          tier: 'HOT',
          type: 'artifact',
          content: 'Artifact content here',
          contentHash: 'hash1',
          tokenCount: 10,
          createdAt: new Date(),
          lastAccessedAt: new Date(),
          accessCount: 1,
          metadata: { workflowId: 'wf-1' }
        },
        {
          id: 'item-2',
          tier: 'WARM',
          type: 'workflow_summary',
          content: 'Related workflow summary',
          contentHash: 'hash2',
          tokenCount: 5,
          createdAt: new Date(),
          lastAccessedAt: new Date(),
          accessCount: 1,
          metadata: { workflowId: 'wf-old' }
        }
      ],
      totalTokens: 15,
      tierBreakdown: {
        hot: { itemCount: 1, tokenCount: 10, percentage: 66.7 },
        warm: { itemCount: 1, tokenCount: 5, percentage: 33.3 },
        cold: { itemCount: 0, tokenCount: 0, percentage: 0 }
      },
      loadedAt: new Date(),
      loadDurationMs: 10
    };

    const text = formatContextAsText(context);

    expect(text).toContain('# Context for Workflow wf-1');
    expect(text).toContain('## HOT Context');
    expect(text).toContain('## WARM Context');
    expect(text).toContain('Artifact content here');
    expect(text).toContain('Related workflow summary');
    expect(text).not.toContain('## COLD Context'); // No cold items
  });

  it('should handle empty context', () => {
    const context: LoadedContext = {
      workflowId: 'wf-1',
      items: [],
      totalTokens: 0,
      tierBreakdown: {
        hot: { itemCount: 0, tokenCount: 0, percentage: 0 },
        warm: { itemCount: 0, tokenCount: 0, percentage: 0 },
        cold: { itemCount: 0, tokenCount: 0, percentage: 0 }
      },
      loadedAt: new Date(),
      loadDurationMs: 0
    };

    const text = formatContextAsText(context);

    expect(text).toContain('# Context for Workflow wf-1');
    expect(text).toContain('0 items');
  });
});
