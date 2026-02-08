import type { PrismaClient } from '@prisma/client';
import type { TransitionContext } from '@arch-orchestrator/core';

/**
 * Loads all data needed to make a transition decision.
 * This is the only place that reads DB for orchestration.
 */
export async function loadTransitionContext(
  prisma: PrismaClient,
  workflowId: string
): Promise<TransitionContext> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      patchSets: {
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      approvals: {
        where: { kind: 'apply_patches' },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const latestPatchSet = workflow.patchSets[0];
  const hasApproval = workflow.approvals.length > 0;
  const latestPatchSetId = latestPatchSet?.id;

  // Phase 4: load policy violations for the latest patch set
  let hasBlockingPolicyViolations = false;
  let hasPolicyBeenEvaluated = false;

  if (latestPatchSetId) {
    const violations = await prisma.policyViolation.findMany({
      where: { patchSetId: latestPatchSetId }
    });

    hasBlockingPolicyViolations = violations.some(v => v.severity === 'BLOCK');
    hasPolicyBeenEvaluated = violations.length > 0;
  }

  if (!hasPolicyBeenEvaluated) {
    const evalEvent = await prisma.workflowEvent.findFirst({
      where: { workflowId, type: 'worker.evaluate_policy.completed' },
      orderBy: { createdAt: 'desc' }
    });
    hasPolicyBeenEvaluated = Boolean(evalEvent);
  }

  return {
    workflowId,
    hasPatchSets: workflow.patchSets.length > 0,
    latestPatchSetId,
    hasApprovalToApply: hasApproval,
    hasBlockingPolicyViolations,
    hasPolicyBeenEvaluated
  };
}
