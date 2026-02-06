import type { PrismaClient } from '@prisma/client';
import { computeContextHash } from './context-hash';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type StartRunParams = {
  workflowId: string;
  jobName: string;
  inputs: Record<string, unknown>;
};

export type CompleteRunParams = {
  runId: string;
  outputs: Record<string, unknown>;
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
export class RunRecorder {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Start recording a new run. Call at job start.
   * Returns the run ID to use for completion/failure.
   */
  async startRun(params: StartRunParams): Promise<string> {
    const inputHash = computeContextHash(params.inputs);

    const run = await this.prisma.workflowRun.create({
      data: {
        workflowId: params.workflowId,
        jobName: params.jobName,
        status: 'running',
        inputHash,
        inputs: params.inputs,
        outputs: null,
        errorMsg: null,
        startedAt: new Date(),
        completedAt: null,
        durationMs: null
      }
    });

    return run.id;
  }

  /**
   * Mark a run as completed successfully.
   */
  async completeRun(params: CompleteRunParams): Promise<void> {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: params.runId }
    });

    if (!run) {
      throw new Error(`Run not found: ${params.runId}`);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - run.startedAt.getTime();

    await this.prisma.workflowRun.update({
      where: { id: params.runId },
      data: {
        status: 'completed',
        outputs: params.outputs,
        completedAt,
        durationMs
      }
    });
  }

  /**
   * Mark a run as failed.
   */
  async failRun(params: FailRunParams): Promise<void> {
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: params.runId }
    });

    if (!run) {
      throw new Error(`Run not found: ${params.runId}`);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - run.startedAt.getTime();

    await this.prisma.workflowRun.update({
      where: { id: params.runId },
      data: {
        status: 'failed',
        errorMsg: params.errorMsg,
        completedAt,
        durationMs
      }
    });
  }

  /**
   * Get runs for a workflow.
   */
  async getRunsForWorkflow(workflowId: string) {
    return this.prisma.workflowRun.findMany({
      where: { workflowId },
      orderBy: { startedAt: 'desc' }
    });
  }

  /**
   * Find runs with the same input hash (for caching/deduplication).
   */
  async findRunsByInputHash(inputHash: string) {
    return this.prisma.workflowRun.findMany({
      where: { inputHash, status: 'completed' },
      orderBy: { startedAt: 'desc' }
    });
  }
}
