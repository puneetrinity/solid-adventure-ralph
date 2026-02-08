/**
 * Tests for Gate3 - CI & Quality Gates Evaluation
 */

import {
  Gate3Service,
  defaultQualityGates,
  mapWebhookToCIEvent,
  isCIConclusionTerminal,
  isCISuccess,
  type CIEventInput,
  type CIEvidence,
  type QualityGate
} from '../../packages/core/src/policy/gate3';

// Mock Prisma
const createMockPrisma = () => ({
  pullRequest: {
    findFirst: jest.fn()
  },
  workflow: {
    findUnique: jest.fn(),
    findFirst: jest.fn()
  },
  workflowEvent: {
    create: jest.fn()
  },
  artifact: {
    create: jest.fn(),
    findFirst: jest.fn()
  }
});

describe('Gate3 Service', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let gate3: Gate3Service;

  beforeEach(() => {
    prisma = createMockPrisma();
    gate3 = new Gate3Service(prisma as any);
  });

  describe('findWorkflowForCIEvent', () => {
    it('should find workflow by PR head SHA', async () => {
      const input: CIEventInput = {
        source: 'check_suite',
        conclusion: 'success',
        headSha: 'abc123',
        owner: 'test-owner',
        repo: 'test-repo'
      };

      prisma.pullRequest.findFirst.mockResolvedValue({
        id: 'pr-1',
        workflowId: 'workflow-1',
        workflow: { id: 'workflow-1' }
      });

      const result = await gate3.findWorkflowForCIEvent(input);
      expect(result).toBe('workflow-1');
    });

    it('should find workflow by baseSha directly', async () => {
      const input: CIEventInput = {
        source: 'workflow_run',
        conclusion: 'success',
        headSha: 'abc123',
        owner: 'test-owner',
        repo: 'test-repo'
      };

      prisma.pullRequest.findFirst.mockResolvedValue(null);
      prisma.workflow.findFirst.mockResolvedValue({
        id: 'workflow-2',
        baseSha: 'abc123'
      });

      const result = await gate3.findWorkflowForCIEvent(input);
      expect(result).toBe('workflow-2');
    });

    it('should return null if no matching workflow', async () => {
      const input: CIEventInput = {
        source: 'check_run',
        conclusion: 'failure',
        headSha: 'unknown-sha',
        owner: 'test-owner',
        repo: 'test-repo'
      };

      prisma.pullRequest.findFirst.mockResolvedValue(null);
      prisma.workflow.findFirst.mockResolvedValue(null);

      const result = await gate3.findWorkflowForCIEvent(input);
      expect(result).toBeNull();
    });
  });

  describe('processCIEvent', () => {
    it('should process successful CI event', async () => {
      const input: CIEventInput = {
        source: 'workflow_run',
        conclusion: 'success',
        headSha: 'abc123',
        owner: 'test-owner',
        repo: 'test-repo',
        workflowRunId: 12345
      };

      prisma.pullRequest.findFirst.mockResolvedValue({
        id: 'pr-1',
        workflowId: 'workflow-1'
      });

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'workflow-1',
        pullRequests: [{ number: 42 }]
      });

      const result = await gate3.processCIEvent(input);

      expect(result).not.toBeNull();
      expect(result!.workflowId).toBe('workflow-1');
      expect(result!.passed).toBe(true);
      expect(result!.ciConclusion).toBe('success');
      expect(result!.transitionEvent).toEqual({
        type: 'E_CI_COMPLETED',
        result: { conclusion: 'success' }
      });
    });

    it('should process failed CI event', async () => {
      const input: CIEventInput = {
        source: 'check_suite',
        conclusion: 'failure',
        headSha: 'abc123',
        owner: 'test-owner',
        repo: 'test-repo',
        checkSuiteId: 999
      };

      prisma.pullRequest.findFirst.mockResolvedValue({
        id: 'pr-1',
        workflowId: 'workflow-1'
      });

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'workflow-1',
        pullRequests: [{ number: 42 }]
      });

      const result = await gate3.processCIEvent(input);

      expect(result).not.toBeNull();
      expect(result!.passed).toBe(false);
      expect(result!.ciConclusion).toBe('failure');
      expect(result!.transitionEvent).toEqual({
        type: 'E_CI_COMPLETED',
        result: { conclusion: 'failure' }
      });
    });

    it('should return null if no matching workflow', async () => {
      const input: CIEventInput = {
        source: 'check_run',
        conclusion: 'success',
        headSha: 'unknown',
        owner: 'test-owner',
        repo: 'test-repo'
      };

      prisma.pullRequest.findFirst.mockResolvedValue(null);
      prisma.workflow.findFirst.mockResolvedValue(null);

      const result = await gate3.processCIEvent(input);
      expect(result).toBeNull();
    });

    it('should record evidence to database', async () => {
      const input: CIEventInput = {
        source: 'workflow_run',
        conclusion: 'success',
        headSha: 'abc123',
        owner: 'test-owner',
        repo: 'test-repo',
        workflowRunId: 12345
      };

      prisma.pullRequest.findFirst.mockResolvedValue({
        id: 'pr-1',
        workflowId: 'workflow-1'
      });

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'workflow-1',
        pullRequests: [{ number: 42 }]
      });

      await gate3.processCIEvent(input);

      expect(prisma.workflowEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId: 'workflow-1',
            type: 'E_CI_COMPLETED'
          })
        })
      );

      expect(prisma.artifact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId: 'workflow-1',
            kind: 'ci_evidence'
          })
        })
      );
    });
  });

  describe('custom quality gates', () => {
    it('should support custom quality gates', async () => {
      const customGate: QualityGate = {
        name: 'coverage_check',
        required: true,
        evaluator: (evidence) => ({
          name: 'coverage_check',
          passed: false,
          reason: 'Coverage below threshold'
        })
      };

      const customGate3 = new Gate3Service(prisma as any, [
        ...defaultQualityGates,
        customGate
      ]);

      const input: CIEventInput = {
        source: 'workflow_run',
        conclusion: 'success',
        headSha: 'abc123',
        owner: 'test-owner',
        repo: 'test-repo'
      };

      prisma.pullRequest.findFirst.mockResolvedValue({
        id: 'pr-1',
        workflowId: 'workflow-1'
      });

      prisma.workflow.findUnique.mockResolvedValue({
        id: 'workflow-1',
        pullRequests: []
      });

      const result = await customGate3.processCIEvent(input);

      expect(result).not.toBeNull();
      // CI passed but custom gate failed, so overall should fail
      expect(result!.passed).toBe(false);
      expect(result!.gateResults).toHaveLength(2);
      expect(result!.gateResults.find((r) => r.name === 'coverage_check')?.passed).toBe(false);
    });
  });
});

describe('Default Quality Gates', () => {
  const ciPassGate = defaultQualityGates.find((g) => g.name === 'ci_pass')!;

  it('should pass for successful CI', () => {
    const evidence: CIEvidence = {
      workflowId: 'w1',
      headSha: 'abc123',
      ciConclusion: 'success',
      ciSource: 'workflow_run',
      ciCompletedAt: new Date(),
      gateResults: []
    };

    const result = ciPassGate.evaluator(evidence);
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('CI completed successfully');
  });

  it('should fail for failed CI', () => {
    const evidence: CIEvidence = {
      workflowId: 'w1',
      headSha: 'abc123',
      ciConclusion: 'failure',
      ciSource: 'check_suite',
      ciCompletedAt: new Date(),
      gateResults: []
    };

    const result = ciPassGate.evaluator(evidence);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('failure');
  });

  it('should fail for cancelled CI', () => {
    const evidence: CIEvidence = {
      workflowId: 'w1',
      headSha: 'abc123',
      ciConclusion: 'cancelled',
      ciSource: 'workflow_run',
      ciCompletedAt: new Date(),
      gateResults: []
    };

    const result = ciPassGate.evaluator(evidence);
    expect(result.passed).toBe(false);
  });
});

describe('mapWebhookToCIEvent', () => {
  it('should map check_suite event', () => {
    const payload = {
      check_suite: {
        id: 123,
        conclusion: 'success',
        head_sha: 'abc123',
        updated_at: '2024-01-01T00:00:00Z'
      },
      repository: {
        name: 'test-repo',
        owner: { login: 'test-owner' }
      }
    };

    const result = mapWebhookToCIEvent('webhook-1', 'check_suite', payload);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('check_suite');
    expect(result!.conclusion).toBe('success');
    expect(result!.headSha).toBe('abc123');
    expect(result!.checkSuiteId).toBe(123);
  });

  it('should map workflow_run event', () => {
    const payload = {
      workflow_run: {
        id: 456,
        name: 'CI',
        conclusion: 'failure',
        head_sha: 'def456',
        html_url: 'https://github.com/test-owner/test-repo/actions/runs/456'
      },
      repository: {
        name: 'test-repo',
        owner: { login: 'test-owner' }
      }
    };

    const result = mapWebhookToCIEvent('webhook-2', 'workflow_run', payload);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('workflow_run');
    expect(result!.conclusion).toBe('failure');
    expect(result!.workflowRunId).toBe(456);
    expect(result!.name).toBe('CI');
    expect(result!.url).toBe('https://github.com/test-owner/test-repo/actions/runs/456');
  });

  it('should map check_run event', () => {
    const payload = {
      check_run: {
        id: 789,
        name: 'build',
        conclusion: 'success',
        head_sha: 'ghi789',
        html_url: 'https://github.com/test-owner/test-repo/runs/789'
      },
      repository: {
        name: 'test-repo',
        owner: { login: 'test-owner' }
      }
    };

    const result = mapWebhookToCIEvent('webhook-3', 'check_run', payload);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('check_run');
    expect(result!.checkRunId).toBe(789);
    expect(result!.name).toBe('build');
  });

  it('should map status event', () => {
    const payload = {
      sha: 'status-sha',
      state: 'success',
      context: 'ci/jenkins',
      repository: {
        name: 'test-repo',
        owner: { login: 'test-owner' }
      }
    };

    const result = mapWebhookToCIEvent('webhook-4', 'status', payload);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('status');
    expect(result!.headSha).toBe('status-sha');
    expect(result!.name).toBe('ci/jenkins');
  });

  it('should return null for missing repository', () => {
    const payload = {
      check_suite: {
        id: 123,
        conclusion: 'success',
        head_sha: 'abc123'
      }
    };

    const result = mapWebhookToCIEvent('webhook-5', 'check_suite', payload);
    expect(result).toBeNull();
  });

  it('should return null for unknown event type', () => {
    const payload = {
      repository: {
        name: 'test-repo',
        owner: { login: 'test-owner' }
      }
    };

    const result = mapWebhookToCIEvent('webhook-6', 'push', payload);
    expect(result).toBeNull();
  });
});

describe('isCIConclusionTerminal', () => {
  it('should return true for terminal conclusions', () => {
    expect(isCIConclusionTerminal('success')).toBe(true);
    expect(isCIConclusionTerminal('failure')).toBe(true);
    expect(isCIConclusionTerminal('cancelled')).toBe(true);
    expect(isCIConclusionTerminal('timed_out')).toBe(true);
    expect(isCIConclusionTerminal('action_required')).toBe(true);
  });

  it('should return false for non-terminal conclusions', () => {
    expect(isCIConclusionTerminal('neutral')).toBe(false);
    expect(isCIConclusionTerminal('skipped')).toBe(false);
  });
});

describe('isCISuccess', () => {
  it('should return true only for success', () => {
    expect(isCISuccess('success')).toBe(true);
    expect(isCISuccess('failure')).toBe(false);
    expect(isCISuccess('cancelled')).toBe(false);
    expect(isCISuccess('neutral')).toBe(false);
  });
});
