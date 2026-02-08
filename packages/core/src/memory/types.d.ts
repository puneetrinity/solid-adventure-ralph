/**
 * Memory Types
 *
 * Core types for tiered memory management.
 */
/**
 * Memory tier classification.
 *
 * HOT: Current workflow context - always loaded, highest priority
 * WARM: Related workflows and similar decisions - loaded on demand
 * COLD: Historical/archived data - loaded only when explicitly requested
 */
export type MemoryTier = 'HOT' | 'WARM' | 'COLD';
/**
 * Memory item with tier classification.
 */
export interface MemoryItem {
    id: string;
    tier: MemoryTier;
    type: MemoryItemType;
    content: string;
    contentHash: string;
    tokenCount: number;
    createdAt: Date;
    lastAccessedAt: Date;
    accessCount: number;
    metadata: MemoryMetadata;
}
/**
 * Types of memory items.
 */
export type MemoryItemType = 'artifact' | 'event' | 'patch' | 'decision' | 'plan' | 'file_snapshot' | 'workflow_summary';
/**
 * Metadata for memory items.
 */
export interface MemoryMetadata {
    workflowId: string;
    artifactKind?: string;
    eventType?: string;
    patchSetId?: string;
    filePath?: string;
    relevanceScore?: number;
}
/**
 * Loaded context for LLM calls.
 */
export interface LoadedContext {
    workflowId: string;
    items: MemoryItem[];
    totalTokens: number;
    tierBreakdown: TierBreakdown;
    loadedAt: Date;
    loadDurationMs: number;
}
/**
 * Token usage by tier.
 */
export interface TierBreakdown {
    hot: TierStats;
    warm: TierStats;
    cold: TierStats;
}
/**
 * Statistics for a single tier.
 */
export interface TierStats {
    itemCount: number;
    tokenCount: number;
    percentage: number;
}
/**
 * Options for context loading.
 */
export interface ContextLoadOptions {
    workflowId: string;
    maxTokens: number;
    includeTiers: MemoryTier[];
    includeTypes?: MemoryItemType[];
    excludeTypes?: MemoryItemType[];
    maxAgeHours?: number;
    minRelevanceScore?: number;
    includeRelatedWorkflows?: boolean;
    maxRelatedWorkflows?: number;
}
/**
 * Default loading options.
 */
export declare const DEFAULT_LOAD_OPTIONS: Partial<ContextLoadOptions>;
/**
 * Configuration for tier behavior.
 */
export interface TierConfig {
    tier: MemoryTier;
    maxTokens: number;
    priority: number;
    ttlHours: number;
    autoLoad: boolean;
}
/**
 * Default tier configurations.
 */
export declare const TIER_CONFIGS: Record<MemoryTier, TierConfig>;
/**
 * Memory usage statistics.
 */
export interface MemoryStats {
    workflowId: string;
    totalItems: number;
    totalTokens: number;
    tierBreakdown: TierBreakdown;
    typeBreakdown: Record<MemoryItemType, number>;
    savedTokens: number;
    savingsPercentage: number;
    timestamp: Date;
}
/**
 * Token savings tracking.
 */
export interface TokenSavings {
    workflowId: string;
    runId: string;
    baselineTokens: number;
    actualTokens: number;
    savedTokens: number;
    savingsPercentage: number;
    tiersUsed: MemoryTier[];
}
