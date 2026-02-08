export type WorkflowState =
  | 'INGESTED'
  | 'PATCHES_PROPOSED'
  | 'WAITING_USER_APPROVAL'
  | 'APPLYING_PATCHES'
  | 'PR_OPEN'
  | 'VERIFYING_CI'
  | 'DONE'
  | 'NEEDS_HUMAN'
  | 'BLOCKED_POLICY'
  | 'FAILED';

export type StageName = 'ingest_context' | 'apply_patches' | 'evaluate_policy';

export type WorkflowEventType =
  | 'E_WORKFLOW_CREATED'
  | 'E_JOB_COMPLETED'
  | 'E_JOB_FAILED'
  | 'E_APPROVAL_RECORDED'
  | 'E_POLICY_EVALUATED'
  | 'E_CI_COMPLETED';

export type TransitionEvent =
  | { type: 'E_WORKFLOW_CREATED' }
  | { type: 'E_APPROVAL_RECORDED' }
  | { type: 'E_JOB_COMPLETED'; stage: StageName; result?: any }
  | { type: 'E_JOB_FAILED'; stage: StageName; error: string }
  | { type: 'E_POLICY_EVALUATED'; result: { hasBlockingViolations: boolean; violationIds?: string[] } }
  | { type: 'E_CI_COMPLETED'; result: { conclusion: 'success' | 'failure' | 'cancelled' } };

export type EnqueueJob =
  | { queue: 'workflow'; name: 'ingest_context'; payload: { workflowId: string } }
  | { queue: 'workflow'; name: 'apply_patches'; payload: { workflowId: string; patchSetId: string } }
  | { queue: 'workflow'; name: 'evaluate_policy'; payload: { workflowId: string; patchSetId: string } };
