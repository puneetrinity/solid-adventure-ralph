"use strict";
/**
 * Gate3 - CI & Quality Gates Evaluation
 *
 * This module handles:
 * 1. Mapping CI events to workflow state changes
 * 2. Evaluating quality gates (CI, coverage, etc.)
 * 3. Recording CI evidence (logs, artifacts)
 * 4. Triggering transitions to terminal states (DONE / NEEDS_HUMAN)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gate3Service = exports.defaultQualityGates = void 0;
exports.mapWebhookToCIEvent = mapWebhookToCIEvent;
exports.isCIConclusionTerminal = isCIConclusionTerminal;
exports.isCISuccess = isCISuccess;
// ============================================================================
// Default Quality Gates
// ============================================================================
exports.defaultQualityGates = [
    {
        name: 'ci_pass',
        required: true,
        evaluator: (evidence) => {
            const passed = evidence.ciConclusion === 'success';
            return {
                name: 'ci_pass',
                passed,
                reason: passed ? 'CI completed successfully' : `CI concluded with: ${evidence.ciConclusion}`,
                evidence: { conclusion: evidence.ciConclusion }
            };
        }
    }
];
// ============================================================================
// Gate3 Service
// ============================================================================
class Gate3Service {
    prisma;
    qualityGates;
    constructor(prisma, qualityGates = exports.defaultQualityGates) {
        this.prisma = prisma;
        this.qualityGates = qualityGates;
    }
    /**
     * Find the workflow associated with a CI event.
     */
    async findWorkflowForCIEvent(input) {
        // Find PR with matching head SHA
        const pr = await this.prisma.pullRequest.findFirst({
            where: {
                status: 'open',
                workflow: {
                    OR: [
                        { baseSha: input.headSha },
                        {
                            patchSets: {
                                some: {
                                    baseSha: input.headSha
                                }
                            }
                        }
                    ]
                }
            },
            include: {
                workflow: true
            }
        });
        if (pr) {
            return pr.workflowId;
        }
        // Also check if head SHA matches any workflow's baseSha directly
        const workflow = await this.prisma.workflow.findFirst({
            where: {
                baseSha: input.headSha,
                state: { in: ['PR_OPEN', 'VERIFYING_CI'] }
            }
        });
        return workflow?.id ?? null;
    }
    /**
     * Process a CI event and evaluate quality gates.
     */
    async processCIEvent(input) {
        // Find associated workflow
        const workflowId = await this.findWorkflowForCIEvent(input);
        if (!workflowId) {
            return null;
        }
        // Get workflow with PR
        const workflow = await this.prisma.workflow.findUnique({
            where: { id: workflowId },
            include: {
                pullRequests: {
                    where: { status: 'open' },
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });
        if (!workflow) {
            return null;
        }
        // Build CI evidence
        const evidence = this.buildEvidence(workflowId, input, workflow.pullRequests[0]?.number);
        // Evaluate quality gates
        const gateResults = this.evaluateGates(evidence);
        // Determine if passed
        const requiredGates = gateResults.filter((r) => this.qualityGates.find((g) => g.name === r.name)?.required);
        const passed = requiredGates.every((r) => r.passed);
        // Update evidence with gate results
        evidence.gateResults = gateResults;
        // Record CI evidence
        await this.recordEvidence(workflowId, evidence, input);
        // Create transition event
        const transitionEvent = this.createTransitionEvent(input.conclusion);
        return {
            workflowId,
            passed,
            ciConclusion: input.conclusion,
            gateResults,
            evidence,
            transitionEvent
        };
    }
    /**
     * Build CI evidence from input.
     */
    buildEvidence(workflowId, input, prNumber) {
        const evidence = {
            workflowId,
            prNumber,
            headSha: input.headSha,
            ciConclusion: input.conclusion,
            ciSource: input.source,
            ciCompletedAt: input.completedAt ?? new Date(),
            gateResults: []
        };
        // Add evidence URLs based on source
        if (input.checkSuiteId) {
            evidence.checkSuiteUrl = `https://github.com/${input.owner}/${input.repo}/runs/${input.checkSuiteId}`;
        }
        if (input.workflowRunId) {
            evidence.workflowRunUrl = `https://github.com/${input.owner}/${input.repo}/actions/runs/${input.workflowRunId}`;
        }
        evidence.commitUrl = `https://github.com/${input.owner}/${input.repo}/commit/${input.headSha}`;
        return evidence;
    }
    /**
     * Evaluate all quality gates.
     */
    evaluateGates(evidence) {
        return this.qualityGates.map((gate) => gate.evaluator(evidence));
    }
    /**
     * Record CI evidence in the database.
     */
    async recordEvidence(workflowId, evidence, input) {
        // Create workflow event with CI evidence
        await this.prisma.workflowEvent.create({
            data: {
                workflowId,
                type: 'E_CI_COMPLETED',
                payload: {
                    conclusion: input.conclusion,
                    source: input.source,
                    headSha: input.headSha,
                    webhookId: input.webhookId,
                    checkSuiteId: input.checkSuiteId,
                    workflowRunId: input.workflowRunId,
                    checkRunId: input.checkRunId,
                    gateResults: JSON.parse(JSON.stringify(evidence.gateResults)),
                    evidenceUrls: {
                        checkSuite: evidence.checkSuiteUrl,
                        workflowRun: evidence.workflowRunUrl,
                        commit: evidence.commitUrl
                    }
                }
            }
        });
        // Also store as artifact for audit
        await this.prisma.artifact.create({
            data: {
                workflowId,
                kind: 'ci_evidence',
                content: JSON.stringify(evidence, null, 2),
                contentSha: this.hashContent(JSON.stringify(evidence))
            }
        });
    }
    /**
     * Create a transition event for CI completion.
     */
    createTransitionEvent(conclusion) {
        // Map CI conclusion to our transition event format
        let mappedConclusion;
        switch (conclusion) {
            case 'success':
                mappedConclusion = 'success';
                break;
            case 'cancelled':
            case 'skipped':
                mappedConclusion = 'cancelled';
                break;
            default:
                // failure, neutral, timed_out, action_required
                mappedConclusion = 'failure';
        }
        return {
            type: 'E_CI_COMPLETED',
            result: { conclusion: mappedConclusion }
        };
    }
    /**
     * Simple content hash for artifacts.
     */
    hashContent(content) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }
    /**
     * Get CI evidence for a workflow.
     */
    async getCIEvidence(workflowId) {
        const artifact = await this.prisma.artifact.findFirst({
            where: {
                workflowId,
                kind: 'ci_evidence'
            },
            orderBy: { createdAt: 'desc' }
        });
        if (!artifact) {
            return null;
        }
        return JSON.parse(artifact.content);
    }
}
exports.Gate3Service = Gate3Service;
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Map a webhook CI event to the CIEventInput format.
 */
function mapWebhookToCIEvent(webhookId, eventType, payload) {
    const repoOwner = payload.repository?.owner?.login;
    const repoName = payload.repository?.name;
    if (!repoOwner || !repoName) {
        return null;
    }
    if (eventType === 'check_suite' && payload.check_suite) {
        const cs = payload.check_suite;
        return {
            source: 'check_suite',
            conclusion: cs.conclusion,
            headSha: cs.head_sha,
            owner: repoOwner,
            repo: repoName,
            webhookId,
            checkSuiteId: cs.id,
            completedAt: cs.updated_at ? new Date(cs.updated_at) : undefined
        };
    }
    if (eventType === 'workflow_run' && payload.workflow_run) {
        const wr = payload.workflow_run;
        return {
            source: 'workflow_run',
            conclusion: wr.conclusion,
            headSha: wr.head_sha,
            owner: repoOwner,
            repo: repoName,
            webhookId,
            workflowRunId: wr.id,
            name: wr.name,
            url: wr.html_url,
            startedAt: wr.run_started_at ? new Date(wr.run_started_at) : undefined,
            completedAt: wr.updated_at ? new Date(wr.updated_at) : undefined
        };
    }
    if (eventType === 'check_run' && payload.check_run) {
        const cr = payload.check_run;
        return {
            source: 'check_run',
            conclusion: cr.conclusion,
            headSha: cr.head_sha,
            owner: repoOwner,
            repo: repoName,
            webhookId,
            checkRunId: cr.id,
            name: cr.name,
            url: cr.html_url,
            startedAt: cr.started_at ? new Date(cr.started_at) : undefined,
            completedAt: cr.completed_at ? new Date(cr.completed_at) : undefined
        };
    }
    if (eventType === 'status' && payload.sha) {
        return {
            source: 'status',
            conclusion: payload.state,
            headSha: payload.sha,
            owner: repoOwner,
            repo: repoName,
            webhookId,
            name: payload.context
        };
    }
    return null;
}
/**
 * Check if a CI conclusion is terminal (workflow should complete).
 */
function isCIConclusionTerminal(conclusion) {
    // These conclusions indicate the CI run is finished
    return [
        'success',
        'failure',
        'cancelled',
        'timed_out',
        'action_required'
    ].includes(conclusion);
}
/**
 * Check if a CI conclusion indicates success.
 */
function isCISuccess(conclusion) {
    return conclusion === 'success';
}
//# sourceMappingURL=gate3.js.map