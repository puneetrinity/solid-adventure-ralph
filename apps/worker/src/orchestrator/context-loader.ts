import type { PrismaClient } from '@prisma/client';
import type { TransitionContext } from '@arch-orchestrator/core/workflow/transition';

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

  return {
    workflowId,
    hasPatchSets: workflow.patchSets.length > 0,
    latestPatchSetId: latestPatchSet?.id,
    hasApprovalToApply: hasApproval,
    hasBlockingPolicyViolations: false // Phase 4: load from policy_violations table
  };
}
