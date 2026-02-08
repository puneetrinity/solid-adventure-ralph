import type { WorkflowState, TransitionEvent, EnqueueJob } from './states';

export type TransitionContext = {
  workflowId: string;

  // data that affects decisions (must be loaded by orchestrator)
  hasPatchSets: boolean;
  latestPatchSetId?: string;

  hasApprovalToApply: boolean;

  // Phase 4 - policy evaluation
  hasBlockingPolicyViolations?: boolean;
  hasPolicyBeenEvaluated?: boolean;

  // Multi-repo support: PatchSet tracking
  patchSetCounts?: {
    total: number;
    proposed: number;
    approved: number;
    applied: number;
  };
  patchSetsNeedingPolicy?: string[];
  patchSetsNeedingApproval?: string[];
  approvedPatchSetIds?: string[];
  allPatchSetsApplied?: boolean;

  // optional: attempt counts, retry budgets later
};

export type TransitionResult = {
  nextState: WorkflowState;
  enqueue: EnqueueJob[];
  reason: string; // human-readable, for audit/events
};

/**
 * Pure, deterministic transition function.
 * No I/O - the orchestrator builds context by reading DB,
 * calls this function, then persists the result.
 */
export function transition(
  current: WorkflowState,
  event: TransitionEvent,
  ctx: TransitionContext
): TransitionResult {
  // Helper to create result
  const result = (nextState: WorkflowState, enqueue: EnqueueJob[], reason: string): TransitionResult => ({
    nextState,
    enqueue,
    reason
  });

  // INGESTED state transitions
  if (current === 'INGESTED') {
    if (event.type === 'E_WORKFLOW_CREATED') {
      return result('INGESTED', [
        { queue: 'workflow', name: 'ingest_context', payload: { workflowId: ctx.workflowId } }
      ], 'Workflow created, enqueueing ingest_context');
    }

    if (event.type === 'E_JOB_COMPLETED' && event.stage === 'ingest_context') {
      if (ctx.hasPatchSets) {
        // Multi-repo: enqueue policy evaluation for ALL PatchSets
        const patchSetIds = ctx.patchSetsNeedingPolicy?.length
          ? ctx.patchSetsNeedingPolicy
          : ctx.latestPatchSetId
            ? [ctx.latestPatchSetId]
            : [];

        if (patchSetIds.length === 0) {
          return result('NEEDS_HUMAN', [], 'Ingest completed but no patch sets to evaluate');
        }

        const jobs: EnqueueJob[] = patchSetIds.map(patchSetId => ({
          queue: 'workflow',
          name: 'evaluate_policy',
          payload: { workflowId: ctx.workflowId, patchSetId }
        }));

        const count = ctx.patchSetCounts?.total || 1;
        return result('PATCHES_PROPOSED', jobs, `Ingest completed with ${count} patch set(s), enqueueing policy evaluation`);
      }
      return result('NEEDS_HUMAN', [], 'Ingest completed but no patch sets created');
    }

    if (event.type === 'E_JOB_FAILED' && event.stage === 'ingest_context') {
      return result('FAILED', [], `Ingest failed: ${event.error}`);
    }
  }

  // PATCHES_PROPOSED state - evaluate policy before moving to approval
  if (current === 'PATCHES_PROPOSED') {
    // Policy evaluation event
    if (event.type === 'E_POLICY_EVALUATED') {
      if (event.result.hasBlockingViolations) {
        return result('BLOCKED_POLICY', [], 'Policy violations detected in proposed patches');
      }

      // Check if there are more PatchSets needing policy evaluation
      const needsPolicy = ctx.patchSetsNeedingPolicy?.length || 0;
      if (needsPolicy > 0) {
        // More to evaluate - stay in PATCHES_PROPOSED
        return result('PATCHES_PROPOSED', [], `Policy passed for one patch set, ${needsPolicy} more pending evaluation`);
      }

      // All policies evaluated, move to approval
      const needsApproval = ctx.patchSetsNeedingApproval?.length || 0;
      return result('WAITING_USER_APPROVAL', [], `All policies evaluated, ${needsApproval} patch set(s) awaiting approval`);
    }

    // Trigger policy evaluation for any PatchSets that still need it
    const patchSetsNeedingPolicy = ctx.patchSetsNeedingPolicy || [];
    if (patchSetsNeedingPolicy.length > 0) {
      const jobs: EnqueueJob[] = patchSetsNeedingPolicy.map(patchSetId => ({
        queue: 'workflow',
        name: 'evaluate_policy',
        payload: { workflowId: ctx.workflowId, patchSetId }
      }));
      return result('PATCHES_PROPOSED', jobs, `Enqueueing policy evaluation for ${patchSetsNeedingPolicy.length} patch set(s)`);
    }

    // Fallback to latest patch set for backwards compat
    if (ctx.hasPatchSets && ctx.latestPatchSetId) {
      return result('PATCHES_PROPOSED', [
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: ctx.workflowId, patchSetId: ctx.latestPatchSetId } }
      ], 'Patches proposed, enqueueing policy evaluation');
    }

    return result('NEEDS_HUMAN', [], 'No patch sets available');
  }

  // WAITING_USER_APPROVAL state transitions
  if (current === 'WAITING_USER_APPROVAL') {
    if (event.type === 'E_APPROVAL_RECORDED') {
      // Check if policy has already been evaluated and blocked
      if (ctx.hasBlockingPolicyViolations) {
        return result('BLOCKED_POLICY', [], 'Approval recorded but policy violations exist');
      }

      // Multi-repo: enqueue apply_patches for ALL approved PatchSets
      const approvedIds = ctx.approvedPatchSetIds || [];
      if (approvedIds.length > 0) {
        const jobs: EnqueueJob[] = approvedIds.map(patchSetId => ({
          queue: 'workflow',
          name: 'apply_patches',
          payload: { workflowId: ctx.workflowId, patchSetId }
        }));
        return result('APPLYING_PATCHES', jobs, `Approval recorded, enqueueing apply_patches for ${approvedIds.length} patch set(s)`);
      }

      // Fallback to latest for backwards compat
      if (ctx.hasApprovalToApply && ctx.latestPatchSetId) {
        return result('APPLYING_PATCHES', [
          { queue: 'workflow', name: 'apply_patches', payload: { workflowId: ctx.workflowId, patchSetId: ctx.latestPatchSetId } }
        ], 'Approval recorded, enqueueing apply_patches');
      }

      return result('WAITING_USER_APPROVAL', [], 'Approval event received but no approved patch sets found');
    }

    // Policy evaluation in WAITING_USER_APPROVAL state
    if (event.type === 'E_POLICY_EVALUATED') {
      if (event.result.hasBlockingViolations) {
        return result('BLOCKED_POLICY', [], 'Policy violations detected during approval review');
      }
      // Non-blocking evaluation doesn't change state
      return result('WAITING_USER_APPROVAL', [], 'Policy evaluated with warnings only');
    }

    // User requested changes - go back to PATCHES_PROPOSED to regenerate
    if (event.type === 'E_CHANGES_REQUESTED') {
      return result('NEEDS_HUMAN', [], `Changes requested: ${event.comment || 'No comment provided'}`);
    }

    // User rejected the patch set
    if (event.type === 'E_PATCH_SET_REJECTED') {
      return result('FAILED', [], `Patch set rejected: ${event.reason || 'No reason provided'}`);
    }
  }

  // APPLYING_PATCHES state transitions
  if (current === 'APPLYING_PATCHES') {
    if (event.type === 'E_JOB_COMPLETED' && event.stage === 'apply_patches') {
      if (event.result?.prNumber || event.result?.pr) {
        // Multi-repo: check if all PatchSets are now applied
        if (ctx.allPatchSetsApplied) {
          const total = ctx.patchSetCounts?.total || 1;
          return result('PR_OPEN', [], `All ${total} patch set(s) applied, PRs opened`);
        }

        // More PatchSets still being applied - stay in APPLYING_PATCHES
        const applied = (ctx.patchSetCounts?.applied || 0) + 1; // +1 for this one
        const total = ctx.patchSetCounts?.total || 1;
        if (applied < total) {
          return result('APPLYING_PATCHES', [], `Patch set applied (${applied}/${total}), waiting for others`);
        }

        return result('PR_OPEN', [], 'Patches applied, PR opened');
      }
      return result('BLOCKED_POLICY', [], 'Apply completed but no PR created');
    }

    if (event.type === 'E_JOB_FAILED' && event.stage === 'apply_patches') {
      if (event.error.includes('WRITE_BLOCKED') || event.error.includes('NO_APPROVAL')) {
        return result('BLOCKED_POLICY', [], `Apply blocked: ${event.error}`);
      }
      return result('FAILED', [], `Apply failed: ${event.error}`);
    }
  }

  // PR_OPEN state transitions (Phase 6)
  if (current === 'PR_OPEN') {
    if (event.type === 'E_PR_MERGED') {
      return result('DONE', [], `PR #${event.prNumber} merged, workflow complete`);
    }

    if (event.type === 'E_PR_CLOSED') {
      return result('NEEDS_HUMAN', [], `PR #${event.prNumber} closed without merging`);
    }

    if (event.type === 'E_CI_COMPLETED') {
      if (event.result.conclusion === 'success') {
        // CI passed but PR not merged yet - stay in PR_OPEN
        return result('PR_OPEN', [], 'CI passed, awaiting PR merge');
      }
      return result('NEEDS_HUMAN', [], `CI ${event.result.conclusion}, needs human review`);
    }
  }

  // VERIFYING_CI state transitions (Phase 6)
  if (current === 'VERIFYING_CI') {
    if (event.type === 'E_CI_COMPLETED') {
      if (event.result.conclusion === 'success') {
        return result('DONE', [], 'CI verification passed');
      }
      return result('NEEDS_HUMAN', [], `CI verification failed: ${event.result.conclusion}`);
    }
  }

  // Policy evaluation can block from any state (Phase 4)
  if (event.type === 'E_POLICY_EVALUATED' && event.result.hasBlockingViolations) {
    return result('BLOCKED_POLICY', [], 'Policy violations detected');
  }

  // Terminal states - no transitions out
  if (current === 'DONE' || current === 'FAILED' || current === 'BLOCKED_POLICY' || current === 'NEEDS_HUMAN') {
    return result(current, [], `No transition from terminal state ${current}`);
  }

  // Default: stay in current state (unknown event)
  return result(current, [], `No transition for event ${event.type} in state ${current}`);
}
