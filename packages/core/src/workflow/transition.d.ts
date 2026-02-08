import type { WorkflowState, TransitionEvent, EnqueueJob } from './states';
export type TransitionContext = {
    workflowId: string;
    hasPatchSets: boolean;
    latestPatchSetId?: string;
    hasApprovalToApply: boolean;
    hasBlockingPolicyViolations?: boolean;
    hasPolicyBeenEvaluated?: boolean;
};
export type TransitionResult = {
    nextState: WorkflowState;
    enqueue: EnqueueJob[];
    reason: string;
};
/**
 * Pure, deterministic transition function.
 * No I/O - the orchestrator builds context by reading DB,
 * calls this function, then persists the result.
 */
export declare function transition(current: WorkflowState, event: TransitionEvent, ctx: TransitionContext): TransitionResult;
