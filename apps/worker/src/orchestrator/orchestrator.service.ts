import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { getPrisma } from '@db';
import { transition, TransitionContext } from '@core/workflow/transition';
import type { WorkflowState, TransitionEvent, EnqueueJob } from '@core/workflow/states';
import { loadTransitionContext } from './context-loader';
import { writeTransitionResult } from './state-writer';

@Injectable()
export class OrchestratorService {
  private prisma = getPrisma();

  constructor(
    @InjectQueue('workflow') private readonly workflowQueue: Queue
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
    await this.workflowQueue.add(job.name, job.payload);
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
