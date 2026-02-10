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
      // Now enqueues policy evaluation for the patch set
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps1' } }
      ]);
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
    test('enqueues policy evaluation when patchsets exist', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1' };
      const res = transition('PATCHES_PROPOSED', { type: 'E_JOB_COMPLETED', stage: 'ingest_context' }, ctx);
      expect(res.nextState).toBe('PATCHES_PROPOSED');
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps1' } }
      ]);
    });

    test('moves to WAITING_USER_APPROVAL after policy passes', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1' };
      const res = transition('PATCHES_PROPOSED', { type: 'E_POLICY_EVALUATED', result: { hasBlockingViolations: false } }, ctx);
      expect(res.nextState).toBe('WAITING_USER_APPROVAL');
    });

    test('blocks on policy violations', () => {
      const ctx = { ...baseCtx(), hasPatchSets: true, latestPatchSetId: 'ps1' };
      const res = transition('PATCHES_PROPOSED', { type: 'E_POLICY_EVALUATED', result: { hasBlockingViolations: true } }, ctx);
      expect(res.nextState).toBe('BLOCKED_POLICY');
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
    test('CI success -> stays PR_OPEN awaiting merge', () => {
      const res = transition('PR_OPEN', { type: 'E_CI_COMPLETED', result: { conclusion: 'success' } }, baseCtx());
      expect(res.nextState).toBe('PR_OPEN');
      expect(res.reason).toContain('awaiting PR merge');
    });

    test('CI failure -> NEEDS_HUMAN', () => {
      const res = transition('PR_OPEN', { type: 'E_CI_COMPLETED', result: { conclusion: 'failure' } }, baseCtx());
      expect(res.nextState).toBe('NEEDS_HUMAN');
    });

    test('PR merged -> DONE', () => {
      const res = transition('PR_OPEN', { type: 'E_PR_MERGED', prNumber: 123 }, baseCtx());
      expect(res.nextState).toBe('DONE');
    });

    test('PR closed -> NEEDS_HUMAN', () => {
      const res = transition('PR_OPEN', { type: 'E_PR_CLOSED', prNumber: 123 }, baseCtx());
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

    test('REJECTED stays REJECTED', () => {
      const res = transition('REJECTED', { type: 'E_WORKFLOW_CREATED' }, baseCtx());
      expect(res.nextState).toBe('REJECTED');
    });
  });

  // ============================================================================
  // Gated Pipeline Tests
  // ============================================================================

  describe('Gated Pipeline: E_WORKFLOW_CREATED', () => {
    test('enqueues feasibility_analysis when currentStage is feasibility', () => {
      const ctx = { ...baseCtx(), currentStage: 'feasibility' as const };
      const res = transition('INGESTED', { type: 'E_WORKFLOW_CREATED' }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'feasibility_analysis', payload: { workflowId: 'w1' } }
      ]);
      expect(res.reason).toContain('gated pipeline');
    });

    test('enqueues ingest_context when no currentStage (legacy)', () => {
      const ctx = baseCtx();
      const res = transition('INGESTED', { type: 'E_WORKFLOW_CREATED' }, ctx);
      expect(res.nextState).toBe('INGESTED');
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'ingest_context', payload: { workflowId: 'w1' } }
      ]);
    });
  });

  describe('Gated Pipeline: E_STAGE_APPROVED transitions', () => {
    test('feasibility -> architecture enqueues architecture_analysis', () => {
      const ctx = { ...baseCtx(), currentStage: 'feasibility' as const };
      const res = transition('INGESTED', {
        type: 'E_STAGE_APPROVED',
        stage: 'feasibility',
        nextStage: 'architecture'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'architecture_analysis', payload: { workflowId: 'w1' } }
      ]);
      expect(res.reason).toContain('feasibility approved');
    });

    test('architecture -> timeline enqueues timeline_analysis', () => {
      const ctx = { ...baseCtx(), currentStage: 'architecture' as const };
      const res = transition('INGESTED', {
        type: 'E_STAGE_APPROVED',
        stage: 'architecture',
        nextStage: 'timeline'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'timeline_analysis', payload: { workflowId: 'w1' } }
      ]);
      expect(res.reason).toContain('architecture approved');
    });

    test('timeline -> patches enqueues ingest_context', () => {
      const ctx = { ...baseCtx(), currentStage: 'timeline' as const };
      const res = transition('INGESTED', {
        type: 'E_STAGE_APPROVED',
        stage: 'timeline',
        nextStage: 'patches'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'ingest_context', payload: { workflowId: 'w1' } }
      ]);
      expect(res.reason).toContain('timeline approved');
    });

    test('patches -> policy enqueues evaluate_policy for each patch set', () => {
      const ctx = {
        ...baseCtx(),
        currentStage: 'patches' as const,
        hasPatchSets: true,
        patchSetsNeedingPolicy: ['ps1', 'ps2']
      };
      const res = transition('INGESTED', {
        type: 'E_STAGE_APPROVED',
        stage: 'patches',
        nextStage: 'policy'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps1' } },
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps2' } }
      ]);
      expect(res.reason).toContain('2 patch set(s)');
    });

    test('patches -> policy uses latestPatchSetId as fallback', () => {
      const ctx = {
        ...baseCtx(),
        currentStage: 'patches' as const,
        hasPatchSets: true,
        latestPatchSetId: 'ps-fallback'
      };
      const res = transition('INGESTED', {
        type: 'E_STAGE_APPROVED',
        stage: 'patches',
        nextStage: 'policy'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps-fallback' } }
      ]);
    });

    test('policy -> pr enqueues apply_patches for each patch set', () => {
      const ctx = {
        ...baseCtx(),
        currentStage: 'policy' as const,
        hasPatchSets: true,
        patchSetsNeedingApproval: ['ps1', 'ps2']
      };
      const res = transition('INGESTED', {
        type: 'E_STAGE_APPROVED',
        stage: 'policy',
        nextStage: 'pr'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'apply_patches', payload: { workflowId: 'w1', patchSetId: 'ps1' } },
        { queue: 'workflow', name: 'apply_patches', payload: { workflowId: 'w1', patchSetId: 'ps2' } }
      ]);
    });
  });

  describe('Gated Pipeline: E_STAGE_REJECTED', () => {
    test('stage rejection transitions to REJECTED', () => {
      const ctx = { ...baseCtx(), currentStage: 'feasibility' as const };
      const res = transition('INGESTED', {
        type: 'E_STAGE_REJECTED',
        stage: 'feasibility',
        reason: 'Not feasible for current codebase'
      }, ctx);
      expect(res.nextState).toBe('REJECTED');
      expect(res.reason).toContain('feasibility rejected');
      expect(res.reason).toContain('Not feasible');
    });

    test('rejection works from any gated stage', () => {
      const stages = ['architecture', 'timeline', 'patches', 'policy'] as const;
      for (const stage of stages) {
        const ctx = { ...baseCtx(), currentStage: stage };
        const res = transition('INGESTED', {
          type: 'E_STAGE_REJECTED',
          stage,
          reason: 'Rejected'
        }, ctx);
        expect(res.nextState).toBe('REJECTED');
      }
    });
  });

  describe('Gated Pipeline: E_STAGE_CHANGES_REQUESTED', () => {
    test('changes requested for policy re-enqueues evaluate_policy', () => {
      const ctx = {
        ...baseCtx(),
        currentStage: 'policy' as const,
        hasPatchSets: true,
        patchSetsNeedingPolicy: ['ps1', 'ps2']
      };
      const res = transition('INGESTED', {
        type: 'E_STAGE_CHANGES_REQUESTED',
        stage: 'policy',
        reason: 'Need to re-evaluate after changes'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps1' } },
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps2' } }
      ]);
      expect(res.reason).toContain('re-evaluating');
    });

    test('changes requested for patches re-enqueues ingest_context', () => {
      const ctx = { ...baseCtx(), currentStage: 'patches' as const };
      const res = transition('INGESTED', {
        type: 'E_STAGE_CHANGES_REQUESTED',
        stage: 'patches',
        reason: 'Regenerate patches with different approach'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'ingest_context', payload: { workflowId: 'w1' } }
      ]);
      expect(res.reason).toContain('re-generating patches');
    });

    test('changes requested for feasibility re-enqueues feasibility_analysis', () => {
      const ctx = { ...baseCtx(), currentStage: 'feasibility' as const };
      const res = transition('INGESTED', {
        type: 'E_STAGE_CHANGES_REQUESTED',
        stage: 'feasibility',
        reason: 'Reassess with new constraints'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'feasibility_analysis', payload: { workflowId: 'w1' } }
      ]);
    });

    test('changes requested for architecture re-enqueues architecture_analysis', () => {
      const ctx = { ...baseCtx(), currentStage: 'architecture' as const };
      const res = transition('INGESTED', {
        type: 'E_STAGE_CHANGES_REQUESTED',
        stage: 'architecture',
        reason: 'Consider different component structure'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'architecture_analysis', payload: { workflowId: 'w1' } }
      ]);
    });

    test('changes requested for timeline re-enqueues timeline_analysis', () => {
      const ctx = { ...baseCtx(), currentStage: 'timeline' as const };
      const res = transition('INGESTED', {
        type: 'E_STAGE_CHANGES_REQUESTED',
        stage: 'timeline',
        reason: 'Revise milestones'
      }, ctx);
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'timeline_analysis', payload: { workflowId: 'w1' } }
      ]);
    });
  });

  describe('Gated Pipeline: E_JOB_COMPLETED for stages', () => {
    test('feasibility job completed does not change state', () => {
      const ctx = { ...baseCtx(), currentStage: 'feasibility' as const };
      const res = transition('INGESTED', {
        type: 'E_JOB_COMPLETED',
        stage: 'feasibility',
        result: { recommendation: 'proceed' }
      }, ctx);
      expect(res.nextState).toBe('INGESTED');
      expect(res.reason).toContain('awaiting user approval');
    });

    test('architecture job completed does not change state', () => {
      const ctx = { ...baseCtx(), currentStage: 'architecture' as const };
      const res = transition('INGESTED', {
        type: 'E_JOB_COMPLETED',
        stage: 'architecture',
        result: {}
      }, ctx);
      expect(res.nextState).toBe('INGESTED');
      expect(res.reason).toContain('awaiting user approval');
    });

    test('timeline job completed does not change state', () => {
      const ctx = { ...baseCtx(), currentStage: 'timeline' as const };
      const res = transition('INGESTED', {
        type: 'E_JOB_COMPLETED',
        stage: 'timeline',
        result: {}
      }, ctx);
      expect(res.nextState).toBe('INGESTED');
      expect(res.reason).toContain('awaiting user approval');
    });
  });

  describe('Gated Pipeline: E_JOB_FAILED for stages', () => {
    test('feasibility job failed -> NEEDS_HUMAN', () => {
      const ctx = { ...baseCtx(), currentStage: 'feasibility' as const };
      const res = transition('INGESTED', {
        type: 'E_JOB_FAILED',
        stage: 'feasibility',
        error: 'LLM API error'
      }, ctx);
      expect(res.nextState).toBe('NEEDS_HUMAN');
      expect(res.reason).toContain('Feasibility analysis failed');
    });

    test('architecture job failed -> NEEDS_HUMAN', () => {
      const ctx = { ...baseCtx(), currentStage: 'architecture' as const };
      const res = transition('INGESTED', {
        type: 'E_JOB_FAILED',
        stage: 'architecture',
        error: 'timeout'
      }, ctx);
      expect(res.nextState).toBe('NEEDS_HUMAN');
      expect(res.reason).toContain('Architecture analysis failed');
    });

    test('timeline job failed -> NEEDS_HUMAN', () => {
      const ctx = { ...baseCtx(), currentStage: 'timeline' as const };
      const res = transition('INGESTED', {
        type: 'E_JOB_FAILED',
        stage: 'timeline',
        error: 'timeout'
      }, ctx);
      expect(res.nextState).toBe('NEEDS_HUMAN');
      expect(res.reason).toContain('Timeline analysis failed');
    });
  });

  describe('Multi-repo PatchSet handling', () => {
    test('ingest_context completed enqueues policy for all patch sets', () => {
      const ctx = {
        ...baseCtx(),
        hasPatchSets: true,
        patchSetsNeedingPolicy: ['ps1', 'ps2', 'ps3'],
        patchSetCounts: { total: 3, proposed: 3, approved: 0, applied: 0 }
      };
      const res = transition('INGESTED', {
        type: 'E_JOB_COMPLETED',
        stage: 'ingest_context',
        result: { baseSha: 'abc123' }
      }, ctx);
      expect(res.nextState).toBe('PATCHES_PROPOSED');
      expect(res.enqueue).toHaveLength(3);
      expect(res.enqueue).toContainEqual(
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps1' } }
      );
      expect(res.enqueue).toContainEqual(
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps2' } }
      );
      expect(res.enqueue).toContainEqual(
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps3' } }
      );
    });

    test('approval enqueues apply_patches for all approved patch sets', () => {
      const ctx = {
        ...baseCtx(),
        hasPatchSets: true,
        approvedPatchSetIds: ['ps1', 'ps2'],
        hasApprovalToApply: true,
        patchSetCounts: { total: 2, proposed: 0, approved: 2, applied: 0 }
      };
      const res = transition('WAITING_USER_APPROVAL', { type: 'E_APPROVAL_RECORDED' }, ctx);
      expect(res.nextState).toBe('APPLYING_PATCHES');
      expect(res.enqueue).toHaveLength(2);
      expect(res.enqueue).toContainEqual(
        { queue: 'workflow', name: 'apply_patches', payload: { workflowId: 'w1', patchSetId: 'ps1' } }
      );
      expect(res.enqueue).toContainEqual(
        { queue: 'workflow', name: 'apply_patches', payload: { workflowId: 'w1', patchSetId: 'ps2' } }
      );
    });

    test('partial apply_patches completion stays in APPLYING_PATCHES', () => {
      const ctx = {
        ...baseCtx(),
        hasPatchSets: true,
        patchSetCounts: { total: 3, proposed: 0, approved: 0, applied: 1 },
        allPatchSetsApplied: false
      };
      const res = transition('APPLYING_PATCHES', {
        type: 'E_JOB_COMPLETED',
        stage: 'apply_patches',
        result: { prNumber: 123 }
      }, ctx);
      expect(res.nextState).toBe('APPLYING_PATCHES');
      expect(res.reason).toContain('waiting for others');
    });

    test('all patch sets applied transitions to PR_OPEN', () => {
      const ctx = {
        ...baseCtx(),
        hasPatchSets: true,
        patchSetCounts: { total: 3, proposed: 0, approved: 0, applied: 3 },
        allPatchSetsApplied: true
      };
      const res = transition('APPLYING_PATCHES', {
        type: 'E_JOB_COMPLETED',
        stage: 'apply_patches',
        result: { prNumber: 123 }
      }, ctx);
      expect(res.nextState).toBe('PR_OPEN');
      expect(res.reason).toContain('All 3 patch set(s) applied');
    });
  });
});
