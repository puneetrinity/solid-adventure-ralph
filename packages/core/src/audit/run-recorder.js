"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunRecorder = void 0;
const context_hash_1 = require("./context-hash");
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
class RunRecorder {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * Start recording a new run. Call at job start.
     * Returns the run ID to use for completion/failure.
     */
    async startRun(params) {
        const inputHash = (0, context_hash_1.computeContextHash)(params.inputs);
        const run = await this.prisma.workflowRun.create({
            data: {
                workflowId: params.workflowId,
                jobName: params.jobName,
                status: 'running',
                inputHash,
                inputs: params.inputs,
                startedAt: new Date()
            }
        });
        return run.id;
    }
    /**
     * Mark a run as completed successfully.
     */
    async completeRun(params) {
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
    async failRun(params) {
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
    async getRunsForWorkflow(workflowId) {
        return this.prisma.workflowRun.findMany({
            where: { workflowId },
            orderBy: { startedAt: 'desc' }
        });
    }
    /**
     * Find runs with the same input hash (for caching/deduplication).
     */
    async findRunsByInputHash(inputHash) {
        return this.prisma.workflowRun.findMany({
            where: { inputHash, status: 'completed' },
            orderBy: { startedAt: 'desc' }
        });
    }
}
exports.RunRecorder = RunRecorder;
//# sourceMappingURL=run-recorder.js.map