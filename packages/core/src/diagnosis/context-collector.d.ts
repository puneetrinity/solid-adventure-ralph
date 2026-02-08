/**
 * Context Collector
 *
 * Captures comprehensive failure context for diagnosis.
 */
import { PrismaClient } from '@prisma/client';
import { FailureContext, DiagnosisConfig } from './types';
export declare class ContextCollector {
    private readonly prisma;
    private readonly config;
    constructor(prisma: PrismaClient, config?: Partial<DiagnosisConfig>);
    private get maxEvents();
    /**
     * Collect failure context for a failed workflow run.
     */
    collectFailureContext(workflowId: string, runId: string): Promise<FailureContext>;
    /**
     * Collect failure context from a workflow's current failed state.
     */
    collectFromWorkflowState(workflowId: string): Promise<FailureContext | null>;
    /**
     * Collect recent workflow events.
     */
    private collectRecentEvents;
    /**
     * Collect policy violations.
     */
    private collectPolicyViolations;
    /**
     * Extract file paths from inputs/outputs.
     */
    private extractInvolvedFiles;
    /**
     * Parse error message to extract stack trace.
     */
    private parseErrorMessage;
}
/**
 * Create a context collector instance.
 */
export declare function createContextCollector(prisma: PrismaClient, config?: Partial<DiagnosisConfig>): ContextCollector;
