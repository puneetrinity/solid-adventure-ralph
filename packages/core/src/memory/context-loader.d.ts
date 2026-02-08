/**
 * Context Loader
 *
 * Implements tiered memory loading for LLM context optimization.
 * Reduces token usage by intelligently selecting what context to include.
 */
import type { PrismaClient } from '@prisma/client';
import { MemoryTier, LoadedContext, ContextLoadOptions, MemoryStats, TokenSavings } from './types';
/**
 * Estimate token count for text content.
 * Uses ~4 characters per token as rough estimate.
 */
export declare function estimateTokens(content: string): number;
/**
 * Hash content for deduplication.
 */
export declare function hashContent(content: string): string;
export declare class ContextLoader {
    private readonly prisma;
    constructor(prisma: PrismaClient);
    /**
     * Load context for a workflow with tier-based optimization.
     */
    loadContext(options: ContextLoadOptions): Promise<LoadedContext>;
    /**
     * Load HOT tier: current workflow artifacts and recent events.
     */
    private loadHotTier;
    /**
     * Load WARM tier: related workflows and similar decisions.
     */
    private loadWarmTier;
    /**
     * Load COLD tier: archived/historical data.
     */
    private loadColdTier;
    private summarizeEvents;
    private summarizePatchSet;
    private summarizeWorkflow;
    private calculateRelevance;
    private calculateTierBreakdown;
    /**
     * Get memory statistics for a workflow.
     */
    getMemoryStats(workflowId: string): Promise<MemoryStats>;
    /**
     * Record token savings for a run.
     */
    recordTokenSavings(workflowId: string, runId: string, baselineTokens: number, actualTokens: number, tiersUsed: MemoryTier[]): Promise<TokenSavings>;
}
/**
 * Format context items as text for LLM input.
 */
export declare function formatContextAsText(context: LoadedContext): string;
