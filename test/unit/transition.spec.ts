import { transition, TransitionContext } from '@core/workflow/transition';

function baseCtx(): TransitionContext {
  return {
    workflowId: 'w1',
    hasPatchSets: false,
    latestPatchSetId: undefined,
    hasApprovalToApply: false,
    hasBlockingPolicyViolations: false
  };
}

describe('transition() contract', () => {
  describe('INGESTED state', () => {
    test('E_WORKFLOW_CREATED enqueues ingest_context', () => {
      const res = transition('INGESTED', { type: 'E_WORKFLOW_CREATED' }, baseCtx());
      expect(res.nextState).toBe('INGESTED');
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'ingest_context', payload: { workflowId: 'w1' } }
      ]);
    });

    test('ingest_context completed -> PATCHES_PROPOSED when patchset exists', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1' };
      const res = transition('INGESTED', { type: 'E_JOB_COMPLETED', stage: 'ingest_context', result: { baseSha: 'x' } }, ctx);
      expect(res.nextState).toBe('PATCHES_PROPOSED');
      expect(res.enqueue).toEqual([]);
    });

    test('ingest_context completed -> NEEDS_HUMAN when no patchsets', () => {
      const ctx = { ...baseCtx(), hasPatchSets: false };
      const res = transition('INGESTED', { type: 'E_JOB_COMPLETED', stage: 'ingest_context', result: { baseSha: 'x' } }, ctx);
      expect(res.nextState).toBe('NEEDS_HUMAN');
    });

    test('job failed -> FAILED', () => {
      const res = transition('INGESTED', { type: 'E_JOB_FAILED', stage: 'ingest_context', error: 'boom' }, baseCtx());
      expect(res.nextState).toBe('FAILED');
    });
  });

  describe('PATCHES_PROPOSED state', () => {
    test('normalizes to WAITING_USER_APPROVAL when patchsets exist', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1' };
      const res = transition('PATCHES_PROPOSED', { type: 'E_JOB_COMPLETED', stage: 'ingest_context' }, ctx);
      expect(res.nextState).toBe('WAITING_USER_APPROVAL');
    });

    test('normalizes to NEEDS_HUMAN when no patchsets', () => {
      const ctx = { ...baseCtx(), hasPatchSets: false };
      const res = transition('PATCHES_PROPOSED', { type: 'E_JOB_COMPLETED', stage: 'ingest_context' }, ctx);
      expect(res.nextState).toBe('NEEDS_HUMAN');
    });
  });

  describe('WAITING_USER_APPROVAL state', () => {
    test('approval recorded -> APPLYING_PATCHES and enqueues apply_patches', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1', hasApprovalToApply: true };
      const res = transition('WAITING_USER_APPROVAL', { type: 'E_APPROVAL_RECORDED' }, ctx);
      expect(res.nextState).toBe('APPLYING_PATCHES');
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'apply_patches', payload: { workflowId: 'w1', patchSetId: 'ps1' } }
      ]);
    });

    test('approval recorded but missing approval -> stays waiting', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1', hasApprovalToApply: false };
      const res = transition('WAITING_USER_APPROVAL', { type: 'E_APPROVAL_RECORDED' }, ctx);
      expect(res.nextState).toBe('WAITING_USER_APPROVAL');
      expect(res.enqueue).toEqual([]);
    });
  });

  describe('APPLYING_PATCHES state', () => {
    test('job completed -> PR_OPEN if PR created', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1', hasApprovalToApply: true };
      const res = transition('APPLYING_PATCHES', { type: 'E_JOB_COMPLETED', stage: 'apply_patches', result: { prNumber: 1 } }, ctx);
      expect(res.nextState).toBe('PR_OPEN');
    });

    test('job completed with pr object -> PR_OPEN', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1', hasApprovalToApply: true };
      const res = transition('APPLYING_PATCHES', { type: 'E_JOB_COMPLETED', stage: 'apply_patches', result: { pr: { number: 1 } } }, ctx);
      expect(res.nextState).toBe('PR_OPEN');
    });

    test('job failed with WRITE_BLOCKED -> BLOCKED_POLICY', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1', hasApprovalToApply: true };
      const res = transition('APPLYING_PATCHES', { type: 'E_JOB_FAILED', stage: 'apply_patches', error: 'WRITE_BLOCKED_NO_APPROVAL' }, ctx);
      expect(res.nextState).toBe('BLOCKED_POLICY');
    });

    test('job failed with other error -> FAILED', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1', hasApprovalToApply: true };
      const res = transition('APPLYING_PATCHES', { type: 'E_JOB_FAILED', stage: 'apply_patches', error: 'network timeout' }, ctx);
      expect(res.nextState).toBe('FAILED');
    });
  });

  describe('PR_OPEN state (Phase 6)', () => {
    test('CI success -> DONE', () => {
      const res = transition('PR_OPEN', { type: 'E_CI_COMPLETED', result: { conclusion: 'success' } }, baseCtx());
      expect(res.nextState).toBe('DONE');
    });

    test('CI failure -> NEEDS_HUMAN', () => {
      const res = transition('PR_OPEN', { type: 'E_CI_COMPLETED', result: { conclusion: 'failure' } }, baseCtx());
      expect(res.nextState).toBe('NEEDS_HUMAN');
    });
  });

  describe('Policy evaluation (Phase 4)', () => {
    test('blocking violations -> BLOCKED_POLICY from any state', () => {
      const res = transition('WAITING_USER_APPROVAL', { type: 'E_POLICY_EVALUATED', result: { hasBlockingViolations: true } }, baseCtx());
      expect(res.nextState).toBe('BLOCKED_POLICY');
    });
  });

  describe('Terminal states', () => {
    test('DONE stays DONE', () => {
      const res = transition('DONE', { type: 'E_WORKFLOW_CREATED' }, baseCtx());
      expect(res.nextState).toBe('DONE');
    });

    test('FAILED stays FAILED', () => {
      const res = transition('FAILED', { type: 'E_WORKFLOW_CREATED' }, baseCtx());
      expect(res.nextState).toBe('FAILED');
    });

    test('BLOCKED_POLICY stays BLOCKED_POLICY', () => {
      const res = transition('BLOCKED_POLICY', { type: 'E_WORKFLOW_CREATED' }, baseCtx());
      expect(res.nextState).toBe('BLOCKED_POLICY');
    });

    test('NEEDS_HUMAN stays NEEDS_HUMAN', () => {
      const res = transition('NEEDS_HUMAN', { type: 'E_WORKFLOW_CREATED' }, baseCtx());
      expect(res.nextState).toBe('NEEDS_HUMAN');
    });
  });
});
