/**
 * Diagnosis Service
 *
 * Main service for failure diagnosis, artifact generation, and fix proposals.
 */

import { v4 as uuid } from 'uuid';
import { PrismaClient } from '@prisma/client';
import {
  FailureContext,
  DiagnosisResult,
  FixProposal,
  DiagnosisConfig,
  DEFAULT_DIAGNOSIS_CONFIG,
  PotentialFix,
} from './types';
import { ContextCollector, createContextCollector } from './context-collector';
import { Diagnoser, createDiagnoser } from './diagnoser';
import type { LLMRunner } from '../llm';
import type { AgentPatchProposal, PatchSetProposal } from '../agents/types';

// ============================================================================
// Diagnosis Service
// ============================================================================

export class DiagnosisService {
  private readonly collector: ContextCollector;
  private readonly diagnoser: Diagnoser;

  constructor(
    private readonly prisma: PrismaClient,
    runner?: LLMRunner,
    private readonly config: Partial<DiagnosisConfig> = {}
  ) {
    this.collector = createContextCollector(prisma, config);
    this.diagnoser = createDiagnoser(runner, config);
  }

  private get persistDiagnosis(): boolean {
    return this.config.persistDiagnosis ?? DEFAULT_DIAGNOSIS_CONFIG.persistDiagnosis;
  }

  private get autoGenerateFixes(): boolean {
    return this.config.autoGenerateFixes ?? DEFAULT_DIAGNOSIS_CONFIG.autoGenerateFixes;
  }

  private get minFixConfidence(): number {
    return this.config.minFixConfidence ?? DEFAULT_DIAGNOSIS_CONFIG.minFixConfidence;
  }

  // --------------------------------------------------------------------------
  // Main Diagnosis Flow
  // --------------------------------------------------------------------------

  /**
   * Diagnose a failed workflow run.
   */
  async diagnoseRun(workflowId: string, runId: string): Promise<DiagnosisResult> {
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
  async diagnoseWorkflow(workflowId: string): Promise<DiagnosisResult | null> {
    const context = await this.collector.collectFromWorkflowState(workflowId);

    if (!context) {
      return null;
    }

    return this.diagnoseRun(workflowId, context.runId);
  }

  /**
   * Diagnose and propose fixes in one call.
   */
  async diagnoseAndProposeFixes(
    workflowId: string,
    runId: string
  ): Promise<{ diagnosis: DiagnosisResult; proposals: FixProposal[] }> {
    const diagnosis = await this.diagnoseRun(workflowId, runId);

    const proposals: FixProposal[] = [];

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
  async createFixProposal(
    diagnosis: DiagnosisResult,
    fixIndex: number
  ): Promise<FixProposal> {
    const fix = diagnosis.potentialFixes[fixIndex];

    if (!fix) {
      throw new Error(`Invalid fix index: ${fixIndex}`);
    }

    const proposalId = uuid();
    let patchSetId: string | undefined;

    // Generate patches if possible
    if (fix.canAutoPatch) {
      patchSetId = await this.generateFixPatchSet(
        diagnosis.context.workflowId,
        diagnosis,
        fix
      );
    }

    const proposal: FixProposal = {
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
  async approveFixProposal(
    proposal: FixProposal,
    approvedBy: string,
    notes?: string
  ): Promise<FixProposal> {
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
        } as any,
      },
    });

    return proposal;
  }

  /**
   * Reject a fix proposal.
   */
  async rejectFixProposal(
    proposal: FixProposal,
    rejectedBy: string,
    reason?: string
  ): Promise<FixProposal> {
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
        } as any,
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
  private async persistDiagnosisArtifact(
    workflowId: string,
    diagnosis: DiagnosisResult
  ): Promise<string> {
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
  private formatDiagnosisArtifact(diagnosis: DiagnosisResult): string {
    const lines: string[] = [];

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
  private async generateFixPatchSet(
    workflowId: string,
    diagnosis: DiagnosisResult,
    fix: PotentialFix
  ): Promise<string> {
    // Create a PatchSet with the fix
    const patches: AgentPatchProposal[] = [];

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
    } else {
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
  private generateDiff(change: { file: string; before?: string; after?: string }): string {
    if (!change.before && !change.after) {
      return '';
    }

    const lines: string[] = [];
    lines.push(`--- a/${change.file}`);
    lines.push(`+++ b/${change.file}`);

    const beforeLines = (change.before || '').split('\n');
    const afterLines = (change.after || '').split('\n');

    lines.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);

    for (const line of beforeLines) {
      if (line) lines.push(`-${line}`);
    }
    for (const line of afterLines) {
      if (line) lines.push(`+${line}`);
    }

    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // Event Recording
  // --------------------------------------------------------------------------

  /**
   * Record a diagnosis event.
   */
  private async recordDiagnosisEvent(
    workflowId: string,
    diagnosis: DiagnosisResult
  ): Promise<void> {
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
        } as any,
      },
    });
  }

  /**
   * Record a fix proposal event.
   */
  private async recordFixProposalEvent(
    workflowId: string,
    proposal: FixProposal,
    fix: PotentialFix
  ): Promise<void> {
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
        } as any,
      },
    });
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Hash content for deduplication.
   */
  private hashContent(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a diagnosis service instance.
 */
export function createDiagnosisService(
  prisma: PrismaClient,
  runner?: LLMRunner,
  config?: Partial<DiagnosisConfig>
): DiagnosisService {
  return new DiagnosisService(prisma, runner, config);
}
