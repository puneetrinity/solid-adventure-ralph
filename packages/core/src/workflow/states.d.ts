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
  | 'FAILED'
  | 'REJECTED';

export type StageName =
  | 'ingest_context'
  | 'apply_patches'
  | 'evaluate_policy'
  | 'feasibility'
  | 'architecture'
  | 'timeline'
  | 'summary';

export type GatedStage =
  | 'feasibility'
  | 'architecture'
  | 'timeline'
  | 'summary'
  | 'patches'
  | 'policy'
  | 'pr'
  | 'done';

export type StageStatus = 'pending' | 'processing' | 'ready' | 'approved' | 'rejected' | 'blocked' | 'needs_changes';

export type WorkflowEventType =
  | 'E_WORKFLOW_CREATED'
  | 'E_JOB_COMPLETED'
  | 'E_JOB_FAILED'
  | 'E_APPROVAL_RECORDED'
  | 'E_POLICY_EVALUATED'
  | 'E_CI_COMPLETED'
  | 'E_PR_MERGED'
  | 'E_PR_CLOSED'
  | 'E_CHANGES_REQUESTED'
  | 'E_PATCH_SET_REJECTED'
  | 'E_STAGE_APPROVED'
  | 'E_STAGE_REJECTED'
  | 'E_STAGE_CHANGES_REQUESTED';

export type TransitionEvent =
  | { type: 'E_WORKFLOW_CREATED' }
  | { type: 'E_APPROVAL_RECORDED' }
  | { type: 'E_JOB_COMPLETED'; stage: StageName; result?: any }
  | { type: 'E_JOB_FAILED'; stage: StageName; error: string }
  | { type: 'E_POLICY_EVALUATED'; result: { hasBlockingViolations: boolean; violationIds?: string[] } }
  | { type: 'E_CI_COMPLETED'; result: { conclusion: 'success' | 'failure' | 'cancelled' } }
  | { type: 'E_PR_MERGED'; prNumber: number }
  | { type: 'E_PR_CLOSED'; prNumber: number }
  | { type: 'E_CHANGES_REQUESTED'; comment?: string }
  | { type: 'E_PATCH_SET_REJECTED'; reason?: string }
  | { type: 'E_STAGE_APPROVED'; stage: GatedStage; nextStage: GatedStage }
  | { type: 'E_STAGE_REJECTED'; stage: GatedStage; reason?: string }
  | { type: 'E_STAGE_CHANGES_REQUESTED'; stage: GatedStage; reason: string };

export type EnqueueJob =
  | { queue: 'workflow'; name: 'ingest_context'; payload: { workflowId: string } }
  | { queue: 'workflow'; name: 'apply_patches'; payload: { workflowId: string; patchSetId: string } }
  | { queue: 'workflow'; name: 'evaluate_policy'; payload: { workflowId: string; patchSetId: string } }
  | { queue: 'workflow'; name: 'feasibility_analysis'; payload: { workflowId: string } }
  | { queue: 'workflow'; name: 'architecture_analysis'; payload: { workflowId: string } }
  | { queue: 'workflow'; name: 'timeline_analysis'; payload: { workflowId: string } }
  | { queue: 'workflow'; name: 'summary_analysis'; payload: { workflowId: string } };
