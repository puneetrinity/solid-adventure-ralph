/**
 * Diagnosis Service
 *
 * Main service for failure diagnosis, artifact generation, and fix proposals.
 */
import { PrismaClient } from '@prisma/client';
import { DiagnosisResult, FixProposal, DiagnosisConfig } from './types';
import type { LLMRunner } from '../llm';
export declare class DiagnosisService {
    private readonly prisma;
    private readonly config;
    private readonly collector;
    private readonly diagnoser;
    constructor(prisma: PrismaClient, runner?: LLMRunner, config?: Partial<DiagnosisConfig>);
    private get persistDiagnosis();
    private get autoGenerateFixes();
    private get minFixConfidence();
    /**
     * Diagnose a failed workflow run.
     */
    diagnoseRun(workflowId: string, runId: string): Promise<DiagnosisResult>;
    /**
     * Diagnose the most recent failure in a workflow.
     */
    diagnoseWorkflow(workflowId: string): Promise<DiagnosisResult | null>;
    /**
     * Diagnose and propose fixes in one call.
     */
    diagnoseAndProposeFixes(workflowId: string, runId: string): Promise<{
        diagnosis: DiagnosisResult;
        proposals: FixProposal[];
    }>;
    /**
     * Create a fix proposal for a potential fix.
     */
    createFixProposal(diagnosis: DiagnosisResult, fixIndex: number): Promise<FixProposal>;
    /**
     * Approve a fix proposal.
     */
    approveFixProposal(proposal: FixProposal, approvedBy: string, notes?: string): Promise<FixProposal>;
    /**
     * Reject a fix proposal.
     */
    rejectFixProposal(proposal: FixProposal, rejectedBy: string, reason?: string): Promise<FixProposal>;
    /**
     * Persist diagnosis as an artifact.
     */
    private persistDiagnosisArtifact;
    /**
     * Format diagnosis as markdown artifact.
     */
    private formatDiagnosisArtifact;
    /**
     * Generate a PatchSet for a fix.
     */
    private generateFixPatchSet;
    /**
     * Generate a unified diff from a suggested change.
     */
    private generateDiff;
    /**
     * Record a diagnosis event.
     */
    private recordDiagnosisEvent;
    /**
     * Record a fix proposal event.
     */
    private recordFixProposalEvent;
    /**
     * Hash content for deduplication.
     */
    private hashContent;
}
/**
 * Create a diagnosis service instance.
 */
export declare function createDiagnosisService(prisma: PrismaClient, runner?: LLMRunner, config?: Partial<DiagnosisConfig>): DiagnosisService;
