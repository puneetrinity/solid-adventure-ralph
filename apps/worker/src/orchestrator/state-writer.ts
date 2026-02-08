import type { PrismaClient } from '@prisma/client';
import type { WorkflowState, TransitionResult } from '@arch-orchestrator/core';

/**
 * Persists the transition result: updates workflow state and records event.
 * This is the ONLY place that writes workflow.state.
 */
export async function writeTransitionResult(
  prisma: PrismaClient,
  workflowId: string,
  previousState: WorkflowState,
  result: TransitionResult,
  triggerEvent: any
): Promise<void> {
  // Only update if state actually changed
  if (previousState !== result.nextState) {
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { state: result.nextState }
    });
  }

  // Always record the transition event for audit
  await prisma.workflowEvent.create({
    data: {
      workflowId,
      type: 'orchestrator.transition',
      payload: {
        previousState,
        nextState: result.nextState,
        reason: result.reason,
        triggerEvent,
        enqueuedJobs: result.enqueue.map(j => j.name)
      }
    }
  });
}
