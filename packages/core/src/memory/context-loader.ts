/**
 * Context Loader
 *
 * Implements tiered memory loading for LLM context optimization.
 * Reduces token usage by intelligently selecting what context to include.
 */

import type { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import {
  MemoryTier,
  MemoryItem,
  MemoryItemType,
  MemoryMetadata,
  LoadedContext,
  TierBreakdown,
  TierStats,
  ContextLoadOptions,
  TIER_CONFIGS,
  DEFAULT_LOAD_OPTIONS,
  MemoryStats,
  TokenSavings
} from './types';

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for text content.
 * Uses ~4 characters per token as rough estimate.
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Hash content for deduplication.
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ============================================================================
// Context Loader
// ============================================================================

export class ContextLoader {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Load context for a workflow with tier-based optimization.
   */
  async loadContext(options: ContextLoadOptions): Promise<LoadedContext> {
    const startTime = Date.now();
    const opts = { ...DEFAULT_LOAD_OPTIONS, ...options };

    const items: MemoryItem[] = [];
    let remainingTokens = opts.maxTokens;

    // Load HOT tier first (current workflow)
    if (opts.includeTiers.includes('HOT')) {
      const hotItems = await this.loadHotTier(opts.workflowId, remainingTokens);
      items.push(...hotItems);
      remainingTokens -= hotItems.reduce((sum, i) => sum + i.tokenCount, 0);
    }

    // Load WARM tier (related context)
    if (opts.includeTiers.includes('WARM') && remainingTokens > 0) {
      const warmItems = await this.loadWarmTier(opts.workflowId, remainingTokens, opts);
      items.push(...warmItems);
      remainingTokens -= warmItems.reduce((sum, i) => sum + i.tokenCount, 0);
    }

    // Load COLD tier only if explicitly requested
    if (opts.includeTiers.includes('COLD') && remainingTokens > 0) {
      const coldItems = await this.loadColdTier(opts.workflowId, remainingTokens, opts);
      items.push(...coldItems);
    }

    // Filter by type if specified
    let filteredItems = items;
    if (opts.includeTypes?.length) {
      filteredItems = items.filter(i => opts.includeTypes!.includes(i.type));
    }
    if (opts.excludeTypes?.length) {
      filteredItems = filteredItems.filter(i => !opts.excludeTypes!.includes(i.type));
    }

    // Calculate tier breakdown
    const tierBreakdown = this.calculateTierBreakdown(filteredItems);
    const totalTokens = filteredItems.reduce((sum, i) => sum + i.tokenCount, 0);

    return {
      workflowId: opts.workflowId,
      items: filteredItems,
      totalTokens,
      tierBreakdown,
      loadedAt: new Date(),
      loadDurationMs: Date.now() - startTime
    };
  }

  /**
   * Load HOT tier: current workflow artifacts and recent events.
   */
  private async loadHotTier(workflowId: string, maxTokens: number): Promise<MemoryItem[]> {
    const items: MemoryItem[] = [];
    let usedTokens = 0;
    const tierMax = Math.min(maxTokens, TIER_CONFIGS.HOT.maxTokens);

    // Load workflow details
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        artifacts: { orderBy: { createdAt: 'desc' }, take: 10 },
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
        patchSets: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { patches: { take: 10 } }
        }
      }
    });

    if (!workflow) return items;

    // Add artifacts (highest priority in HOT)
    for (const artifact of workflow.artifacts) {
      const tokenCount = estimateTokens(artifact.content);
      if (usedTokens + tokenCount > tierMax) break;

      items.push({
        id: artifact.id,
        tier: 'HOT',
        type: 'artifact',
        content: artifact.content,
        contentHash: artifact.contentSha,
        tokenCount,
        createdAt: artifact.createdAt,
        lastAccessedAt: new Date(),
        accessCount: 1,
        metadata: {
          workflowId,
          artifactKind: artifact.kind
        }
      });
      usedTokens += tokenCount;
    }

    // Add recent events (summarized)
    const eventSummary = this.summarizeEvents(workflow.events);
    const eventTokens = estimateTokens(eventSummary);
    if (usedTokens + eventTokens <= tierMax) {
      items.push({
        id: `events-${workflowId}`,
        tier: 'HOT',
        type: 'event',
        content: eventSummary,
        contentHash: hashContent(eventSummary),
        tokenCount: eventTokens,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 1,
        metadata: { workflowId }
      });
      usedTokens += eventTokens;
    }

    // Add patch summaries
    for (const patchSet of workflow.patchSets) {
      const patchSummary = this.summarizePatchSet(patchSet);
      const patchTokens = estimateTokens(patchSummary);
      if (usedTokens + patchTokens > tierMax) break;

      items.push({
        id: patchSet.id,
        tier: 'HOT',
        type: 'patch',
        content: patchSummary,
        contentHash: hashContent(patchSummary),
        tokenCount: patchTokens,
        createdAt: patchSet.createdAt,
        lastAccessedAt: new Date(),
        accessCount: 1,
        metadata: {
          workflowId,
          patchSetId: patchSet.id
        }
      });
      usedTokens += patchTokens;
    }

    return items;
  }

  /**
   * Load WARM tier: related workflows and similar decisions.
   */
  private async loadWarmTier(
    workflowId: string,
    maxTokens: number,
    options: ContextLoadOptions
  ): Promise<MemoryItem[]> {
    const items: MemoryItem[] = [];
    let usedTokens = 0;
    const tierMax = Math.min(maxTokens, TIER_CONFIGS.WARM.maxTokens);

    if (!options.includeRelatedWorkflows) return items;

    // Find related workflows (same base SHA or recent)
    const currentWorkflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!currentWorkflow) return items;

    const relatedWorkflows = await this.prisma.workflow.findMany({
      where: {
        id: { not: workflowId },
        state: 'DONE',
        createdAt: {
          gte: new Date(Date.now() - TIER_CONFIGS.WARM.ttlHours * 60 * 60 * 1000)
        }
      },
      include: {
        artifacts: {
          where: { kind: { in: ['DecisionV1', 'PlanV1'] } },
          take: 2
        }
      },
      orderBy: { createdAt: 'desc' },
      take: options.maxRelatedWorkflows ?? 3
    });

    // Add workflow summaries from related workflows
    for (const related of relatedWorkflows) {
      const summary = this.summarizeWorkflow(related);
      const summaryTokens = estimateTokens(summary);

      if (usedTokens + summaryTokens > tierMax) break;

      items.push({
        id: `summary-${related.id}`,
        tier: 'WARM',
        type: 'workflow_summary',
        content: summary,
        contentHash: hashContent(summary),
        tokenCount: summaryTokens,
        createdAt: related.createdAt,
        lastAccessedAt: new Date(),
        accessCount: 1,
        metadata: {
          workflowId: related.id,
          relevanceScore: this.calculateRelevance(currentWorkflow, related)
        }
      });
      usedTokens += summaryTokens;

      // Add relevant artifacts from related workflows
      for (const artifact of related.artifacts) {
        const artTokens = estimateTokens(artifact.content);
        if (usedTokens + artTokens > tierMax) break;

        items.push({
          id: artifact.id,
          tier: 'WARM',
          type: 'artifact',
          content: artifact.content,
          contentHash: artifact.contentSha,
          tokenCount: artTokens,
          createdAt: artifact.createdAt,
          lastAccessedAt: new Date(),
          accessCount: 1,
          metadata: {
            workflowId: related.id,
            artifactKind: artifact.kind,
            relevanceScore: this.calculateRelevance(currentWorkflow, related)
          }
        });
        usedTokens += artTokens;
      }
    }

    return items;
  }

  /**
   * Load COLD tier: archived/historical data.
   */
  private async loadColdTier(
    workflowId: string,
    maxTokens: number,
    options: ContextLoadOptions
  ): Promise<MemoryItem[]> {
    const items: MemoryItem[] = [];
    let usedTokens = 0;
    const tierMax = Math.min(maxTokens, TIER_CONFIGS.COLD.maxTokens);

    // Load historical successful workflows for pattern matching
    const historicalWorkflows = await this.prisma.workflow.findMany({
      where: {
        state: 'DONE',
        createdAt: {
          lt: new Date(Date.now() - TIER_CONFIGS.WARM.ttlHours * 60 * 60 * 1000)
        }
      },
      include: {
        artifacts: {
          where: { kind: 'DecisionV1' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    for (const workflow of historicalWorkflows) {
      const summary = `Historical: ${workflow.id} (${workflow.state}) - ${workflow.createdAt.toISOString().slice(0, 10)}`;
      const summaryTokens = estimateTokens(summary);

      if (usedTokens + summaryTokens > tierMax) break;

      items.push({
        id: `cold-${workflow.id}`,
        tier: 'COLD',
        type: 'workflow_summary',
        content: summary,
        contentHash: hashContent(summary),
        tokenCount: summaryTokens,
        createdAt: workflow.createdAt,
        lastAccessedAt: new Date(),
        accessCount: 1,
        metadata: { workflowId: workflow.id }
      });
      usedTokens += summaryTokens;
    }

    return items;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private summarizeEvents(events: Array<{ type: string; createdAt: Date; payload: any }>): string {
    if (!events.length) return 'No events recorded.';

    const lines = ['## Recent Events'];
    for (const event of events.slice(0, 10)) {
      lines.push(`- ${event.type} (${event.createdAt.toISOString().slice(0, 19)})`);
    }
    return lines.join('\n');
  }

  private summarizePatchSet(patchSet: {
    id: string;
    title: string;
    status: string;
    patches: Array<{ title: string; riskLevel: string }>;
  }): string {
    const lines = [
      `## PatchSet: ${patchSet.title}`,
      `Status: ${patchSet.status}`,
      `Patches:`
    ];
    for (const patch of patchSet.patches) {
      lines.push(`- ${patch.title} (risk: ${patch.riskLevel})`);
    }
    return lines.join('\n');
  }

  private summarizeWorkflow(workflow: {
    id: string;
    state: string;
    baseSha: string | null;
    createdAt: Date;
    artifacts: Array<{ kind: string; content: string }>;
  }): string {
    const lines = [
      `## Related Workflow: ${workflow.id}`,
      `State: ${workflow.state}`,
      `Created: ${workflow.createdAt.toISOString().slice(0, 10)}`
    ];

    for (const artifact of workflow.artifacts) {
      const preview = artifact.content.slice(0, 200).replace(/\n/g, ' ');
      lines.push(`${artifact.kind}: ${preview}...`);
    }

    return lines.join('\n');
  }

  private calculateRelevance(current: any, related: any): number {
    let score = 0;

    // Same base SHA increases relevance
    if (current.baseSha && current.baseSha === related.baseSha) {
      score += 0.5;
    }

    // Recent workflows are more relevant
    const ageHours = (Date.now() - related.createdAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < 24) score += 0.3;
    else if (ageHours < 168) score += 0.2;
    else score += 0.1;

    // Completed workflows are more relevant
    if (related.state === 'DONE') score += 0.2;

    return Math.min(score, 1);
  }

  private calculateTierBreakdown(items: MemoryItem[]): TierBreakdown {
    const totalTokens = items.reduce((sum, i) => sum + i.tokenCount, 0);

    const calculateStats = (tier: MemoryTier): TierStats => {
      const tierItems = items.filter(i => i.tier === tier);
      const tokenCount = tierItems.reduce((sum, i) => sum + i.tokenCount, 0);
      return {
        itemCount: tierItems.length,
        tokenCount,
        percentage: totalTokens > 0 ? (tokenCount / totalTokens) * 100 : 0
      };
    };

    return {
      hot: calculateStats('HOT'),
      warm: calculateStats('WARM'),
      cold: calculateStats('COLD')
    };
  }

  /**
   * Get memory statistics for a workflow.
   */
  async getMemoryStats(workflowId: string): Promise<MemoryStats> {
    const context = await this.loadContext({
      workflowId,
      maxTokens: 100000,
      includeTiers: ['HOT', 'WARM', 'COLD']
    });

    const typeBreakdown: Record<MemoryItemType, number> = {
      artifact: 0,
      event: 0,
      patch: 0,
      decision: 0,
      plan: 0,
      file_snapshot: 0,
      workflow_summary: 0
    };

    for (const item of context.items) {
      typeBreakdown[item.type] += item.tokenCount;
    }

    // Estimate baseline (everything loaded without optimization)
    const baselineTokens = context.totalTokens * 1.5; // Assume 50% savings
    const savedTokens = baselineTokens - context.totalTokens;

    return {
      workflowId,
      totalItems: context.items.length,
      totalTokens: context.totalTokens,
      tierBreakdown: context.tierBreakdown,
      typeBreakdown,
      savedTokens,
      savingsPercentage: (savedTokens / baselineTokens) * 100,
      timestamp: new Date()
    };
  }

  /**
   * Record token savings for a run.
   */
  async recordTokenSavings(
    workflowId: string,
    runId: string,
    baselineTokens: number,
    actualTokens: number,
    tiersUsed: MemoryTier[]
  ): Promise<TokenSavings> {
    const savedTokens = baselineTokens - actualTokens;
    const savingsPercentage = baselineTokens > 0 ? (savedTokens / baselineTokens) * 100 : 0;

    const savings: TokenSavings = {
      workflowId,
      runId,
      baselineTokens,
      actualTokens,
      savedTokens,
      savingsPercentage,
      tiersUsed
    };

    // Record in workflow run
    try {
      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: {
          outputs: JSON.parse(JSON.stringify({
            tokenSavings: savings
          }))
        }
      });
    } catch {
      // Run may not exist yet
    }

    return savings;
  }
}

/**
 * Format context items as text for LLM input.
 */
export function formatContextAsText(context: LoadedContext): string {
  const lines = [
    `# Context for Workflow ${context.workflowId}`,
    `Loaded: ${context.items.length} items, ${context.totalTokens} tokens`,
    ''
  ];

  // Group by tier
  for (const tier of ['HOT', 'WARM', 'COLD'] as MemoryTier[]) {
    const tierItems = context.items.filter(i => i.tier === tier);
    if (tierItems.length === 0) continue;

    lines.push(`## ${tier} Context`);
    for (const item of tierItems) {
      lines.push(`### ${item.type}: ${item.id}`);
      lines.push(item.content);
      lines.push('');
    }
  }

  return lines.join('\n');
}
