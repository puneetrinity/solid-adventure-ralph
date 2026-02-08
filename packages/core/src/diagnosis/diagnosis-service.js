"use strict";
/**
 * Diagnosis Service
 *
 * Main service for failure diagnosis, artifact generation, and fix proposals.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosisService = void 0;
exports.createDiagnosisService = createDiagnosisService;
const uuid_1 = require("uuid");
const types_1 = require("./types");
const context_collector_1 = require("./context-collector");
const diagnoser_1 = require("./diagnoser");
// ============================================================================
// Diagnosis Service
// ============================================================================
class DiagnosisService {
    prisma;
    config;
    collector;
    diagnoser;
    constructor(prisma, runner, config = {}) {
        this.prisma = prisma;
        this.config = config;
        this.collector = (0, context_collector_1.createContextCollector)(prisma, config);
        this.diagnoser = (0, diagnoser_1.createDiagnoser)(runner, config);
    }
    get persistDiagnosis() {
        return this.config.persistDiagnosis ?? types_1.DEFAULT_DIAGNOSIS_CONFIG.persistDiagnosis;
    }
    get autoGenerateFixes() {
        return this.config.autoGenerateFixes ?? types_1.DEFAULT_DIAGNOSIS_CONFIG.autoGenerateFixes;
    }
    get minFixConfidence() {
        return this.config.minFixConfidence ?? types_1.DEFAULT_DIAGNOSIS_CONFIG.minFixConfidence;
    }
    // --------------------------------------------------------------------------
    // Main Diagnosis Flow
    // --------------------------------------------------------------------------
    /**
     * Diagnose a failed workflow run.
     */
    async diagnoseRun(workflowId, runId) {
        // Collect failure context
        const context = await this.collector.collectFailureContext(workflowId, runId);
        // Perform diagnosis
        const diagnosis = await this.diagnoser.diagnose(context);
        // Persist as artifact if configured
        if (this.persistDiagnosis) {
            await this.persistDiagnosisArtifact(workflowId, diagnosis);
        }
        // Record diagnosis event
        await this.recordDiagnosisEvent(workflowId, diagnosis);
        return diagnosis;
    }
    /**
     * Diagnose the most recent failure in a workflow.
     */
    async diagnoseWorkflow(workflowId) {
        const context = await this.collector.collectFromWorkflowState(workflowId);
        if (!context) {
            return null;
        }
        return this.diagnoseRun(workflowId, context.runId);
    }
    /**
     * Diagnose and propose fixes in one call.
     */
    async diagnoseAndProposeFixes(workflowId, runId) {
        const diagnosis = await this.diagnoseRun(workflowId, runId);
        const proposals = [];
        if (this.autoGenerateFixes) {
            // Generate fix proposals for high-confidence, auto-patchable fixes
            for (let i = 0; i < diagnosis.potentialFixes.length; i++) {
                const fix = diagnosis.potentialFixes[i];
                if (fix.confidence >= this.minFixConfidence && fix.canAutoPatch) {
                    const proposal = await this.createFixProposal(diagnosis, i);
                    proposals.push(proposal);
                }
            }
        }
        return { diagnosis, proposals };
    }
    // --------------------------------------------------------------------------
    // Fix Proposals
    // --------------------------------------------------------------------------
    /**
     * Create a fix proposal for a potential fix.
     */
    async createFixProposal(diagnosis, fixIndex) {
        const fix = diagnosis.potentialFixes[fixIndex];
        if (!fix) {
            throw new Error(`Invalid fix index: ${fixIndex}`);
        }
        const proposalId = (0, uuid_1.v4)();
        let patchSetId;
        // Generate patches if possible
        if (fix.canAutoPatch) {
            patchSetId = await this.generateFixPatchSet(diagnosis.context.workflowId, diagnosis, fix);
        }
        const proposal = {
            id: proposalId,
            diagnosisId: diagnosis.id,
            workflowId: diagnosis.context.workflowId,
            fixIndex,
            patchSetId,
            status: 'pending_approval',
            proposedAt: new Date(),
        };
        // Record the proposal as an event
        await this.recordFixProposalEvent(diagnosis.context.workflowId, proposal, fix);
        return proposal;
    }
    /**
     * Approve a fix proposal.
     */
    async approveFixProposal(proposal, approvedBy, notes) {
        // Update the proposal
        proposal.status = 'approved';
        proposal.resolvedAt = new Date();
        proposal.resolvedBy = approvedBy;
        proposal.resolutionNotes = notes;
        // If there's a PatchSet, mark it as approved
        if (proposal.patchSetId) {
            await this.prisma.patchSet.update({
                where: { id: proposal.patchSetId },
                data: {
                    status: 'approved',
                    approvedAt: new Date(),
                    approvedBy,
                },
            });
        }
        // Create an approval record
        await this.prisma.approval.create({
            data: {
                workflowId: proposal.workflowId,
                kind: 'fix_proposal',
            },
        });
        // Record event
        await this.prisma.workflowEvent.create({
            data: {
                workflowId: proposal.workflowId,
                type: 'FIX_APPROVED',
                payload: {
                    proposalId: proposal.id,
                    diagnosisId: proposal.diagnosisId,
                    patchSetId: proposal.patchSetId,
                    approvedBy,
                    notes,
                },
            },
        });
        return proposal;
    }
    /**
     * Reject a fix proposal.
     */
    async rejectFixProposal(proposal, rejectedBy, reason) {
        proposal.status = 'rejected';
        proposal.resolvedAt = new Date();
        proposal.resolvedBy = rejectedBy;
        proposal.resolutionNotes = reason;
        // If there's a PatchSet, mark it as rejected
        if (proposal.patchSetId) {
            await this.prisma.patchSet.update({
                where: { id: proposal.patchSetId },
                data: { status: 'rejected' },
            });
        }
        // Record event
        await this.prisma.workflowEvent.create({
            data: {
                workflowId: proposal.workflowId,
                type: 'FIX_REJECTED',
                payload: {
                    proposalId: proposal.id,
                    diagnosisId: proposal.diagnosisId,
                    rejectedBy,
                    reason,
                },
            },
        });
        return proposal;
    }
    // --------------------------------------------------------------------------
    // Artifact Generation
    // --------------------------------------------------------------------------
    /**
     * Persist diagnosis as an artifact.
     */
    async persistDiagnosisArtifact(workflowId, diagnosis) {
        const content = this.formatDiagnosisArtifact(diagnosis);
        const contentSha = this.hashContent(content);
        const artifact = await this.prisma.artifact.create({
            data: {
                workflowId,
                kind: 'DIAGNOSIS',
                content,
                contentSha,
            },
        });
        return artifact.id;
    }
    /**
     * Format diagnosis as markdown artifact.
     */
    formatDiagnosisArtifact(diagnosis) {
        const lines = [];
        lines.push(`# Failure Diagnosis`);
        lines.push('');
        lines.push(`**ID:** ${diagnosis.id}`);
        lines.push(`**Diagnosed:** ${diagnosis.diagnosedAt.toISOString()}`);
        lines.push(`**Duration:** ${diagnosis.diagnosisDurationMs}ms`);
        lines.push('');
        lines.push(`## Summary`);
        lines.push(diagnosis.summary);
        lines.push('');
        lines.push(`## Root Cause`);
        lines.push(`**Category:** ${diagnosis.rootCause.replace(/_/g, ' ')}`);
        lines.push(`**Confidence:** ${(diagnosis.confidence * 100).toFixed(0)}%`);
        lines.push('');
        lines.push(diagnosis.analysis);
        lines.push('');
        if (diagnosis.potentialFixes.length > 0) {
            lines.push(`## Potential Fixes`);
            lines.push('');
            for (let i = 0; i < diagnosis.potentialFixes.length; i++) {
                const fix = diagnosis.potentialFixes[i];
                lines.push(`### Fix ${i + 1}: ${fix.description}`);
                lines.push(`- **Confidence:** ${(fix.confidence * 100).toFixed(0)}%`);
                lines.push(`- **Effort:** ${fix.effort}`);
                lines.push(`- **Risk:** ${fix.risk}`);
                lines.push(`- **Auto-patchable:** ${fix.canAutoPatch ? 'Yes' : 'No'}`);
                if (fix.verificationCommands && fix.verificationCommands.length > 0) {
                    lines.push(`- **Verification:** \`${fix.verificationCommands.join(' && ')}\``);
                }
                lines.push('');
            }
        }
        if (diagnosis.relatedPatterns && diagnosis.relatedPatterns.length > 0) {
            lines.push(`## Related Patterns`);
            for (const pattern of diagnosis.relatedPatterns) {
                lines.push(`- ${pattern}`);
            }
            lines.push('');
        }
        if (diagnosis.preventionRecommendations && diagnosis.preventionRecommendations.length > 0) {
            lines.push(`## Prevention Recommendations`);
            for (const rec of diagnosis.preventionRecommendations) {
                lines.push(`- ${rec}`);
            }
            lines.push('');
        }
        return lines.join('\n');
    }
    // --------------------------------------------------------------------------
    // Fix PatchSet Generation
    // --------------------------------------------------------------------------
    /**
     * Generate a PatchSet for a fix.
     */
    async generateFixPatchSet(workflowId, diagnosis, fix) {
        // Create a PatchSet with the fix
        const patches = [];
        if (fix.suggestedChanges && fix.suggestedChanges.length > 0) {
            // Generate actual patches from suggested changes
            for (const change of fix.suggestedChanges) {
                patches.push({
                    taskId: `fix-${diagnosis.id}`,
                    title: change.description,
                    summary: `Fix for: ${diagnosis.summary}`,
                    diff: this.generateDiff(change),
                    files: [{
                            path: change.file,
                            action: 'modify',
                            additions: (change.after?.split('\n').length || 0),
                            deletions: (change.before?.split('\n').length || 0),
                        }],
                    addsTests: false,
                    riskLevel: fix.risk,
                    commands: fix.verificationCommands,
                });
            }
        }
        else {
            // Create a placeholder patch
            patches.push({
                taskId: `fix-${diagnosis.id}`,
                title: fix.description,
                summary: `Proposed fix for: ${diagnosis.summary}\n\nThis fix requires manual implementation.`,
                diff: '',
                files: [],
                addsTests: false,
                riskLevel: fix.risk,
                commands: fix.verificationCommands,
            });
        }
        // Get base SHA from workflow
        const workflow = await this.prisma.workflow.findUnique({
            where: { id: workflowId },
        });
        const patchSet = await this.prisma.patchSet.create({
            data: {
                workflowId,
                title: `Fix: ${fix.description}`,
                baseSha: workflow?.baseSha || 'HEAD',
                status: 'proposed',
                patches: {
                    create: patches.map(p => ({
                        taskId: p.taskId,
                        title: p.title,
                        summary: p.summary,
                        diff: p.diff,
                        files: JSON.parse(JSON.stringify(p.files)),
                        addsTests: p.addsTests,
                        riskLevel: p.riskLevel,
                        proposedCommands: JSON.parse(JSON.stringify(p.commands || [])),
                    })),
                },
            },
        });
        return patchSet.id;
    }
    /**
     * Generate a unified diff from a suggested change.
     */
    generateDiff(change) {
        if (!change.before && !change.after) {
            return '';
        }
        const lines = [];
        lines.push(`--- a/${change.file}`);
        lines.push(`+++ b/${change.file}`);
        const beforeLines = (change.before || '').split('\n');
        const afterLines = (change.after || '').split('\n');
        lines.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);
        for (const line of beforeLines) {
            if (line)
                lines.push(`-${line}`);
        }
        for (const line of afterLines) {
            if (line)
                lines.push(`+${line}`);
        }
        return lines.join('\n');
    }
    // --------------------------------------------------------------------------
    // Event Recording
    // --------------------------------------------------------------------------
    /**
     * Record a diagnosis event.
     */
    async recordDiagnosisEvent(workflowId, diagnosis) {
        await this.prisma.workflowEvent.create({
            data: {
                workflowId,
                type: 'DIAGNOSIS_COMPLETE',
                payload: {
                    diagnosisId: diagnosis.id,
                    rootCause: diagnosis.rootCause,
                    confidence: diagnosis.confidence,
                    summary: diagnosis.summary,
                    fixCount: diagnosis.potentialFixes.length,
                    diagnosisDurationMs: diagnosis.diagnosisDurationMs,
                },
            },
        });
    }
    /**
     * Record a fix proposal event.
     */
    async recordFixProposalEvent(workflowId, proposal, fix) {
        await this.prisma.workflowEvent.create({
            data: {
                workflowId,
                type: 'FIX_PROPOSED',
                payload: {
                    proposalId: proposal.id,
                    diagnosisId: proposal.diagnosisId,
                    fixDescription: fix.description,
                    confidence: fix.confidence,
                    effort: fix.effort,
                    risk: fix.risk,
                    patchSetId: proposal.patchSetId,
                    requiresApproval: true, // Always requires approval
                },
            },
        });
    }
    // --------------------------------------------------------------------------
    // Utilities
    // --------------------------------------------------------------------------
    /**
     * Hash content for deduplication.
     */
    hashContent(content) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}
exports.DiagnosisService = DiagnosisService;
// ============================================================================
// Factory
// ============================================================================
/**
 * Create a diagnosis service instance.
 */
function createDiagnosisService(prisma, runner, config) {
    return new DiagnosisService(prisma, runner, config);
}
//# sourceMappingURL=diagnosis-service.js.map