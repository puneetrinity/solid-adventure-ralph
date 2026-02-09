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
        orderBy: { createdAt: 'asc' }
      },
      approvals: {
        where: { kind: 'apply_patches' },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const patchSets = workflow.patchSets;
  const hasPatchSets = patchSets.length > 0;

  // Categorize PatchSets by status
  const proposedPatchSets = patchSets.filter(ps => ps.status === 'proposed');
  const approvedPatchSets = patchSets.filter(ps => ps.status === 'approved');
  const appliedPatchSets = patchSets.filter(ps => ps.status === 'applied');

  // Get the latest PatchSet for backwards compatibility
  const latestPatchSet = patchSets[patchSets.length - 1];
  const latestPatchSetId = latestPatchSet?.id;

  // Check if there's at least one approval recorded
  const hasApproval = workflow.approvals.length > 0;

  // Get PatchSets that need approval (proposed and passed policy)
  const patchSetsNeedingApproval: string[] = [];
  const patchSetsNeedingPolicy: string[] = [];

  // For each proposed PatchSet, check policy status
  for (const ps of proposedPatchSets) {
    const violations = await prisma.policyViolation.findMany({
      where: { patchSetId: ps.id }
    });

    const hasBlockingViolations = violations.some(v => v.severity === 'BLOCK');

    // Check if policy has been evaluated
    const evalEvent = await prisma.workflowEvent.findFirst({
      where: {
        workflowId,
        type: 'worker.evaluate_policy.completed',
        payload: { path: ['patchSetId'], equals: ps.id }
      }
    });

    const hasPolicyBeenEvaluated = evalEvent !== null || violations.length > 0;

    if (!hasPolicyBeenEvaluated) {
      patchSetsNeedingPolicy.push(ps.id);
    } else if (!hasBlockingViolations) {
      patchSetsNeedingApproval.push(ps.id);
    }
  }

  // Check for blocking violations across all PatchSets
  let hasBlockingPolicyViolations = false;
  if (latestPatchSetId) {
    const violations = await prisma.policyViolation.findMany({
      where: { patchSetId: latestPatchSetId }
    });
    hasBlockingPolicyViolations = violations.some(v => v.severity === 'BLOCK');
  }

  // Check if policy has been evaluated for the latest PatchSet
  let hasPolicyBeenEvaluated = false;
  if (latestPatchSetId) {
    const violations = await prisma.policyViolation.findMany({
      where: { patchSetId: latestPatchSetId }
    });
    hasPolicyBeenEvaluated = violations.length > 0;

    if (!hasPolicyBeenEvaluated) {
      const evalEvent = await prisma.workflowEvent.findFirst({
        where: { workflowId, type: 'worker.evaluate_policy.completed' },
        orderBy: { createdAt: 'desc' }
      });
      hasPolicyBeenEvaluated = Boolean(evalEvent);
    }
  }

  return {
    workflowId,
    hasPatchSets,
    latestPatchSetId,
    hasApprovalToApply: hasApproval,
    hasBlockingPolicyViolations,
    hasPolicyBeenEvaluated,

    // Multi-repo support: counts and lists
    patchSetCounts: {
      total: patchSets.length,
      proposed: proposedPatchSets.length,
      approved: approvedPatchSets.length,
      applied: appliedPatchSets.length
    },
    patchSetsNeedingPolicy,
    patchSetsNeedingApproval,
    approvedPatchSetIds: approvedPatchSets.map(ps => ps.id),
    allPatchSetsApplied: hasPatchSets && appliedPatchSets.length === patchSets.length,

    // Gated pipeline context
    currentStage: workflow.stage as any,
    stageStatus: workflow.stageStatus
  };
}
