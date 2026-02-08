"use strict";
/**
 * Context Collector
 *
 * Captures comprehensive failure context for diagnosis.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextCollector = void 0;
exports.createContextCollector = createContextCollector;
const types_1 = require("./types");
// ============================================================================
// Context Collector
// ============================================================================
class ContextCollector {
    prisma;
    config;
    constructor(prisma, config = {}) {
        this.prisma = prisma;
        this.config = config;
    }
    get maxEvents() {
        return this.config.maxEvents ?? types_1.DEFAULT_DIAGNOSIS_CONFIG.maxEvents;
    }
    /**
     * Collect failure context for a failed workflow run.
     */
    async collectFailureContext(workflowId, runId) {
        // Get the failed run
        const run = await this.prisma.workflowRun.findUnique({
            where: { id: runId },
            include: {
                workflow: true,
            },
        });
        if (!run) {
            throw new Error(`Run not found: ${runId}`);
        }
        if (run.status !== 'failed') {
            throw new Error(`Run ${runId} is not failed (status: ${run.status})`);
        }
        // Get recent events
        const recentEvents = await this.collectRecentEvents(workflowId);
        // Get policy violations
        const policyViolations = await this.collectPolicyViolations(workflowId);
        // Extract involved files from inputs/outputs
        const involvedFiles = this.extractInvolvedFiles(run.inputs, run.outputs);
        // Extract stack trace from error message
        const { message, stackTrace } = this.parseErrorMessage(run.errorMsg || '');
        return {
            workflowId,
            runId,
            jobName: run.jobName,
            errorMessage: message,
            stackTrace,
            workflowState: run.workflow.state,
            inputs: run.inputs,
            partialOutputs: run.outputs,
            recentEvents,
            policyViolations: policyViolations.length > 0 ? policyViolations : undefined,
            involvedFiles: involvedFiles.length > 0 ? involvedFiles : undefined,
            failedAt: run.completedAt || run.startedAt,
            durationMs: run.durationMs ?? undefined,
        };
    }
    /**
     * Collect failure context from a workflow's current failed state.
     */
    async collectFromWorkflowState(workflowId) {
        const workflow = await this.prisma.workflow.findUnique({
            where: { id: workflowId },
        });
        if (!workflow || !['FAILED', 'NEEDS_HUMAN', 'BLOCKED_POLICY'].includes(workflow.state)) {
            return null;
        }
        // Find the most recent failed run
        const failedRun = await this.prisma.workflowRun.findFirst({
            where: {
                workflowId,
                status: 'failed',
            },
            orderBy: { startedAt: 'desc' },
        });
        if (!failedRun) {
            return null;
        }
        return this.collectFailureContext(workflowId, failedRun.id);
    }
    /**
     * Collect recent workflow events.
     */
    async collectRecentEvents(workflowId) {
        const events = await this.prisma.workflowEvent.findMany({
            where: { workflowId },
            orderBy: { createdAt: 'desc' },
            take: this.maxEvents,
        });
        return events.reverse().map(event => ({
            type: event.type,
            timestamp: event.createdAt,
            payload: event.payload,
        }));
    }
    /**
     * Collect policy violations.
     */
    async collectPolicyViolations(workflowId) {
        const violations = await this.prisma.policyViolation.findMany({
            where: { workflowId },
            orderBy: { createdAt: 'desc' },
        });
        return violations.map(v => ({
            rule: v.rule,
            severity: v.severity,
            file: v.file,
            message: v.message,
            line: v.line ?? undefined,
        }));
    }
    /**
     * Extract file paths from inputs/outputs.
     */
    extractInvolvedFiles(inputs, outputs) {
        const files = new Set();
        const extractPaths = (obj, depth = 0) => {
            if (depth > 5)
                return; // Prevent infinite recursion
            if (typeof obj === 'string') {
                // Check if it looks like a file path
                if (obj.includes('/') && !obj.startsWith('http') && obj.match(/\.\w{1,5}$/)) {
                    files.add(obj);
                }
            }
            else if (Array.isArray(obj)) {
                obj.forEach(item => extractPaths(item, depth + 1));
            }
            else if (obj && typeof obj === 'object') {
                Object.values(obj).forEach(value => extractPaths(value, depth + 1));
            }
        };
        extractPaths(inputs);
        if (outputs) {
            extractPaths(outputs);
        }
        return Array.from(files);
    }
    /**
     * Parse error message to extract stack trace.
     */
    parseErrorMessage(errorMsg) {
        // Look for stack trace patterns
        const stackMatch = errorMsg.match(/(\s+at\s+.+(\n|$))+/);
        if (stackMatch) {
            const stackStart = errorMsg.indexOf(stackMatch[0]);
            return {
                message: errorMsg.substring(0, stackStart).trim(),
                stackTrace: stackMatch[0].trim(),
            };
        }
        // Look for "Error: message\n    at ..." pattern
        const errorPattern = /^(.+?)(?:\n\s+at\s)/s;
        const match = errorMsg.match(errorPattern);
        if (match) {
            return {
                message: match[1].trim(),
                stackTrace: errorMsg.substring(match[1].length).trim(),
            };
        }
        return { message: errorMsg };
    }
}
exports.ContextCollector = ContextCollector;
// ============================================================================
// Factory
// ============================================================================
/**
 * Create a context collector instance.
 */
function createContextCollector(prisma, config) {
    return new ContextCollector(prisma, config);
}
//# sourceMappingURL=context-collector.js.map