import type { WorkflowState, TransitionEvent, EnqueueJob } from './states';

export type TransitionContext = {
  workflowId: string;

  // data that affects decisions (must be loaded by orchestrator)
  hasPatchSets: boolean;
  latestPatchSetId?: string;

  hasApprovalToApply: boolean;

  // Phase 4+ hooks (safe to ignore until implemented)
  hasBlockingPolicyViolations?: boolean;

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
        return result('PATCHES_PROPOSED', [], 'Ingest completed with patch sets');
      }
      return result('NEEDS_HUMAN', [], 'Ingest completed but no patch sets created');
    }

    if (event.type === 'E_JOB_FAILED' && event.stage === 'ingest_context') {
      return result('FAILED', [], `Ingest failed: ${event.error}`);
    }
  }

  // PATCHES_PROPOSED normalizes to WAITING_USER_APPROVAL
  if (current === 'PATCHES_PROPOSED') {
    // Any event in this state should normalize to WAITING_USER_APPROVAL
    if (ctx.hasPatchSets) {
      return result('WAITING_USER_APPROVAL', [], 'Patches proposed, awaiting user approval');
    }
    return result('NEEDS_HUMAN', [], 'No patch sets available');
  }

  // WAITING_USER_APPROVAL state transitions
  if (current === 'WAITING_USER_APPROVAL') {
    if (event.type === 'E_APPROVAL_RECORDED') {
      if (ctx.hasApprovalToApply && ctx.latestPatchSetId) {
        return result('APPLYING_PATCHES', [
          { queue: 'workflow', name: 'apply_patches', payload: { workflowId: ctx.workflowId, patchSetId: ctx.latestPatchSetId } }
        ], 'Approval recorded, enqueueing apply_patches');
      }
      return result('WAITING_USER_APPROVAL', [], 'Approval event received but approval not valid');
    }
  }

  // APPLYING_PATCHES state transitions
  if (current === 'APPLYING_PATCHES') {
    if (event.type === 'E_JOB_COMPLETED' && event.stage === 'apply_patches') {
      if (event.result?.prNumber || event.result?.pr) {
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
    if (event.type === 'E_CI_COMPLETED') {
      if (event.result.conclusion === 'success') {
        return result('DONE', [], 'CI passed, workflow complete');
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
