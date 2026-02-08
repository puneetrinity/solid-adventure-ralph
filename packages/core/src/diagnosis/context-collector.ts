/**
 * Context Collector
 *
 * Captures comprehensive failure context for diagnosis.
 */

import { PrismaClient } from '@prisma/client';
import {
  FailureContext,
  FailureEvent,
  PolicyViolationInfo,
  DiagnosisConfig,
  DEFAULT_DIAGNOSIS_CONFIG,
} from './types';

// ============================================================================
// Context Collector
// ============================================================================

export class ContextCollector {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: Partial<DiagnosisConfig> = {}
  ) {}

  private get maxEvents(): number {
    return this.config.maxEvents ?? DEFAULT_DIAGNOSIS_CONFIG.maxEvents;
  }

  /**
   * Collect failure context for a failed workflow run.
   */
  async collectFailureContext(
    workflowId: string,
    runId: string
  ): Promise<FailureContext> {
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
    const involvedFiles = this.extractInvolvedFiles(
      run.inputs as Record<string, unknown>,
      run.outputs as Record<string, unknown> | null
    );

    // Extract stack trace from error message
    const { message, stackTrace } = this.parseErrorMessage(run.errorMsg || '');

    return {
      workflowId,
      runId,
      jobName: run.jobName,
      errorMessage: message,
      stackTrace,
      workflowState: run.workflow.state,
      inputs: run.inputs as Record<string, unknown>,
      partialOutputs: run.outputs as Record<string, unknown> | undefined,
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
  async collectFromWorkflowState(workflowId: string): Promise<FailureContext | null> {
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
  private async collectRecentEvents(workflowId: string): Promise<FailureEvent[]> {
    const events = await this.prisma.workflowEvent.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: this.maxEvents,
    });

    return events.reverse().map(event => ({
      type: event.type,
      timestamp: event.createdAt,
      payload: event.payload as Record<string, unknown>,
    }));
  }

  /**
   * Collect policy violations.
   */
  private async collectPolicyViolations(
    workflowId: string
  ): Promise<PolicyViolationInfo[]> {
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
  private extractInvolvedFiles(
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown> | null
  ): string[] {
    const files = new Set<string>();

    const extractPaths = (obj: unknown, depth = 0): void => {
      if (depth > 5) return; // Prevent infinite recursion

      if (typeof obj === 'string') {
        // Check if it looks like a file path
        if (obj.includes('/') && !obj.startsWith('http') && obj.match(/\.\w{1,5}$/)) {
          files.add(obj);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(item => extractPaths(item, depth + 1));
      } else if (obj && typeof obj === 'object') {
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
  private parseErrorMessage(errorMsg: string): { message: string; stackTrace?: string } {
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

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a context collector instance.
 */
export function createContextCollector(
  prisma: PrismaClient,
  config?: Partial<DiagnosisConfig>
): ContextCollector {
  return new ContextCollector(prisma, config);
}
