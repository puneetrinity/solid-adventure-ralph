import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { transition, type TransitionContext, type WorkflowState, type TransitionEvent, type EnqueueJob } from '@arch-orchestrator/core';
import { loadTransitionContext } from './context-loader';
import { writeTransitionResult } from './state-writer';

@Injectable()
export class OrchestratorService {
  private prisma = getPrisma();
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    @InjectQueue('workflow') private readonly workflowQueue: Queue,
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue,
    @InjectQueue('ingest_context') private readonly ingestContextQueue: Queue,
    @InjectQueue('apply_patches') private readonly applyPatchesQueue: Queue,
    @InjectQueue('evaluate_policy') private readonly evaluatePolicyQueue: Queue,
    @InjectQueue('feasibility') private readonly feasibilityQueue: Queue,
    @InjectQueue('architecture') private readonly architectureQueue: Queue,
    @InjectQueue('timeline') private readonly timelineQueue: Queue
  ) {}

  /**
   * Main orchestration entry point.
   * Called by the orchestrate processor when an event occurs.
   * Returns the transition result for audit logging.
   */
  async handleEvent(workflowId: string, event: TransitionEvent): Promise<{
    previousState: WorkflowState;
    nextState: WorkflowState;
    reason: string;
    enqueuedJobs: string[];
  }> {
    // 1. Load current state
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const currentState = workflow.state as WorkflowState;

    // 2. Load context for decision making
    const ctx = await loadTransitionContext(this.prisma, workflowId);

    // 3. Compute transition (pure function)
    const result = transition(currentState, event, ctx);

    // 4. Persist state change and audit event
    await writeTransitionResult(this.prisma, workflowId, currentState, result, event);

    // 5. Enqueue next jobs
    for (const job of result.enqueue) {
      await this.enqueueJob(job);
    }

    // Return result for audit
    return {
      previousState: currentState,
      nextState: result.nextState,
      reason: result.reason,
      enqueuedJobs: result.enqueue.map(j => j.name)
    };
  }

  /**
   * Enqueue a job based on the transition result.
   */
  private async enqueueJob(job: EnqueueJob): Promise<void> {
    this.logger.log(`Enqueueing job: ${job.name}`);

    // Route to correct queue based on job name
    const jobName = job.name as string;
    const payload = job.payload as Record<string, unknown>;

    if (jobName === 'ingest_context') {
      await this.ingestContextQueue.add(jobName, payload);
    } else if (jobName === 'apply_patches') {
      await this.applyPatchesQueue.add(jobName, payload);
    } else if (jobName === 'evaluate_policy') {
      await this.evaluatePolicyQueue.add(jobName, payload);
    } else if (jobName === 'feasibility_analysis') {
      await this.feasibilityQueue.add(jobName, payload);
    } else if (jobName === 'architecture_analysis') {
      await this.architectureQueue.add(jobName, payload);
    } else if (jobName === 'timeline_analysis') {
      await this.timelineQueue.add(jobName, payload);
    } else {
      // Fallback to workflow queue for unknown job types
      await this.workflowQueue.add(jobName, payload);
    }
  }

  /**
   * Helper to get current workflow state.
   */
  async getWorkflowState(workflowId: string): Promise<WorkflowState | null> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId }
    });
    return workflow?.state as WorkflowState | null;
  }
}
