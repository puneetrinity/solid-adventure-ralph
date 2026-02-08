"use strict";
/**
 * Context Loader
 *
 * Implements tiered memory loading for LLM context optimization.
 * Reduces token usage by intelligently selecting what context to include.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextLoader = void 0;
exports.estimateTokens = estimateTokens;
exports.hashContent = hashContent;
exports.formatContextAsText = formatContextAsText;
const crypto_1 = require("crypto");
const types_1 = require("./types");
// ============================================================================
// Token Estimation
// ============================================================================
/**
 * Estimate token count for text content.
 * Uses ~4 characters per token as rough estimate.
 */
function estimateTokens(content) {
    return Math.ceil(content.length / 4);
}
/**
 * Hash content for deduplication.
 */
function hashContent(content) {
    return (0, crypto_1.createHash)('sha256').update(content).digest('hex').slice(0, 16);
}
// ============================================================================
// Context Loader
// ============================================================================
class ContextLoader {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * Load context for a workflow with tier-based optimization.
     */
    async loadContext(options) {
        const startTime = Date.now();
        const opts = { ...types_1.DEFAULT_LOAD_OPTIONS, ...options };
        const items = [];
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
            filteredItems = items.filter(i => opts.includeTypes.includes(i.type));
        }
        if (opts.excludeTypes?.length) {
            filteredItems = filteredItems.filter(i => !opts.excludeTypes.includes(i.type));
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
    async loadHotTier(workflowId, maxTokens) {
        const items = [];
        let usedTokens = 0;
        const tierMax = Math.min(maxTokens, types_1.TIER_CONFIGS.HOT.maxTokens);
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
        if (!workflow)
            return items;
        // Add artifacts (highest priority in HOT)
        for (const artifact of workflow.artifacts) {
            const tokenCount = estimateTokens(artifact.content);
            if (usedTokens + tokenCount > tierMax)
                break;
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
            if (usedTokens + patchTokens > tierMax)
                break;
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
    async loadWarmTier(workflowId, maxTokens, options) {
        const items = [];
        let usedTokens = 0;
        const tierMax = Math.min(maxTokens, types_1.TIER_CONFIGS.WARM.maxTokens);
        if (!options.includeRelatedWorkflows)
            return items;
        // Find related workflows (same base SHA or recent)
        const currentWorkflow = await this.prisma.workflow.findUnique({
            where: { id: workflowId }
        });
        if (!currentWorkflow)
            return items;
        const relatedWorkflows = await this.prisma.workflow.findMany({
            where: {
                id: { not: workflowId },
                state: 'DONE',
                createdAt: {
                    gte: new Date(Date.now() - types_1.TIER_CONFIGS.WARM.ttlHours * 60 * 60 * 1000)
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
            if (usedTokens + summaryTokens > tierMax)
                break;
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
                if (usedTokens + artTokens > tierMax)
                    break;
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
    async loadColdTier(workflowId, maxTokens, options) {
        const items = [];
        let usedTokens = 0;
        const tierMax = Math.min(maxTokens, types_1.TIER_CONFIGS.COLD.maxTokens);
        // Load historical successful workflows for pattern matching
        const historicalWorkflows = await this.prisma.workflow.findMany({
            where: {
                state: 'DONE',
                createdAt: {
                    lt: new Date(Date.now() - types_1.TIER_CONFIGS.WARM.ttlHours * 60 * 60 * 1000)
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
            if (usedTokens + summaryTokens > tierMax)
                break;
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
    summarizeEvents(events) {
        if (!events.length)
            return 'No events recorded.';
        const lines = ['## Recent Events'];
        for (const event of events.slice(0, 10)) {
            lines.push(`- ${event.type} (${event.createdAt.toISOString().slice(0, 19)})`);
        }
        return lines.join('\n');
    }
    summarizePatchSet(patchSet) {
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
    summarizeWorkflow(workflow) {
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
    calculateRelevance(current, related) {
        let score = 0;
        // Same base SHA increases relevance
        if (current.baseSha && current.baseSha === related.baseSha) {
            score += 0.5;
        }
        // Recent workflows are more relevant
        const ageHours = (Date.now() - related.createdAt.getTime()) / (1000 * 60 * 60);
        if (ageHours < 24)
            score += 0.3;
        else if (ageHours < 168)
            score += 0.2;
        else
            score += 0.1;
        // Completed workflows are more relevant
        if (related.state === 'DONE')
            score += 0.2;
        return Math.min(score, 1);
    }
    calculateTierBreakdown(items) {
        const totalTokens = items.reduce((sum, i) => sum + i.tokenCount, 0);
        const calculateStats = (tier) => {
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
    async getMemoryStats(workflowId) {
        const context = await this.loadContext({
            workflowId,
            maxTokens: 100000,
            includeTiers: ['HOT', 'WARM', 'COLD']
        });
        const typeBreakdown = {
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
    async recordTokenSavings(workflowId, runId, baselineTokens, actualTokens, tiersUsed) {
        const savedTokens = baselineTokens - actualTokens;
        const savingsPercentage = baselineTokens > 0 ? (savedTokens / baselineTokens) * 100 : 0;
        const savings = {
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
        }
        catch {
            // Run may not exist yet
        }
        return savings;
    }
}
exports.ContextLoader = ContextLoader;
/**
 * Format context items as text for LLM input.
 */
function formatContextAsText(context) {
    const lines = [
        `# Context for Workflow ${context.workflowId}`,
        `Loaded: ${context.items.length} items, ${context.totalTokens} tokens`,
        ''
    ];
    // Group by tier
    for (const tier of ['HOT', 'WARM', 'COLD']) {
        const tierItems = context.items.filter(i => i.tier === tier);
        if (tierItems.length === 0)
            continue;
        lines.push(`## ${tier} Context`);
        for (const item of tierItems) {
            lines.push(`### ${item.type}: ${item.id}`);
            lines.push(item.content);
            lines.push('');
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=context-loader.js.map