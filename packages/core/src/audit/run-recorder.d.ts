import type { PrismaClient, Prisma } from '@prisma/client';
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
type JsonValue = Prisma.InputJsonValue;
export type StartRunParams = {
    workflowId: string;
    jobName: string;
    inputs: JsonValue;
};
export type CompleteRunParams = {
    runId: string;
    outputs: JsonValue;
};
export type FailRunParams = {
    runId: string;
    errorMsg: string;
};
/**
 * Records workflow job executions for full auditability.
 *
 * Each job execution creates a WorkflowRun record with:
 * - Stable input hash for deduplication/caching
 * - Raw input data for audit
 * - Output data when completed
 * - Error message when failed
 * - Timing information
 */
export declare class RunRecorder {
    private readonly prisma;
    constructor(prisma: PrismaClient);
    /**
     * Start recording a new run. Call at job start.
     * Returns the run ID to use for completion/failure.
     */
    startRun(params: StartRunParams): Promise<string>;
    /**
     * Mark a run as completed successfully.
     */
    completeRun(params: CompleteRunParams): Promise<void>;
    /**
     * Mark a run as failed.
     */
    failRun(params: FailRunParams): Promise<void>;
    /**
     * Get runs for a workflow.
     */
    getRunsForWorkflow(workflowId: string): Promise<{
        id: string;
        workflowId: string;
        status: string;
        jobName: string;
        inputHash: string;
        inputs: Prisma.JsonValue;
        outputs: Prisma.JsonValue | null;
        errorMsg: string | null;
        startedAt: Date;
        completedAt: Date | null;
        durationMs: number | null;
        inputTokens: number | null;
        outputTokens: number | null;
        totalTokens: number | null;
        estimatedCost: number | null;
        agentRole: string | null;
        promptVersion: string | null;
        memoryTier: string | null;
    }[]>;
    /**
     * Find runs with the same input hash (for caching/deduplication).
     */
    findRunsByInputHash(inputHash: string): Promise<{
        id: string;
        workflowId: string;
        status: string;
        jobName: string;
        inputHash: string;
        inputs: Prisma.JsonValue;
        outputs: Prisma.JsonValue | null;
        errorMsg: string | null;
        startedAt: Date;
        completedAt: Date | null;
        durationMs: number | null;
        inputTokens: number | null;
        outputTokens: number | null;
        totalTokens: number | null;
        estimatedCost: number | null;
        agentRole: string | null;
        promptVersion: string | null;
        memoryTier: string | null;
    }[]>;
}
export {};
