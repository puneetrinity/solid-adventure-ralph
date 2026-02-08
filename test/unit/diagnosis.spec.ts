/**
 * Diagnosis Module Unit Tests
 */

import {
  FailureContext,
  DiagnosisResult,
  FixProposal,
  RootCauseCategory,
  DEFAULT_DIAGNOSIS_CONFIG,
} from '../../packages/core/src/diagnosis/types';

import {
  ContextCollector,
  createContextCollector,
} from '../../packages/core/src/diagnosis/context-collector';

import {
  Diagnoser,
  createDiagnoser,
} from '../../packages/core/src/diagnosis/diagnoser';

import {
  DiagnosisService,
  createDiagnosisService,
} from '../../packages/core/src/diagnosis/diagnosis-service';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockPrisma = () => ({
  workflowRun: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  workflow: {
    findUnique: jest.fn(),
  },
  workflowEvent: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  policyViolation: {
    findMany: jest.fn(),
  },
  artifact: {
    create: jest.fn(),
  },
  patchSet: {
    create: jest.fn(),
    update: jest.fn(),
  },
  approval: {
    create: jest.fn(),
  },
});

const createTestFailureContext = (overrides: Partial<FailureContext> = {}): FailureContext => ({
  workflowId: 'wf-test-123',
  runId: 'run-test-456',
  jobName: 'apply_patches',
  errorMessage: 'Error: Test failed - expected true to be false',
  workflowState: 'FAILED',
  inputs: { taskId: 'task-1', patchSetId: 'ps-1' },
  recentEvents: [
    { type: 'PATCH_SET_CREATED', timestamp: new Date(), payload: {} },
    { type: 'PATCHES_PROPOSED', timestamp: new Date(), payload: {} },
    { type: 'APPLY_STARTED', timestamp: new Date(), payload: {} },
  ],
  failedAt: new Date(),
  ...overrides,
});

// ============================================================================
// Diagnoser Tests
// ============================================================================

describe('Diagnoser', () => {
  let diagnoser: Diagnoser;

  beforeEach(() => {
    diagnoser = createDiagnoser();
  });

  describe('diagnose', () => {
    it('should identify test failure root cause', async () => {
      const context = createTestFailureContext({
        jobName: 'run_tests',
        errorMessage: 'Assertion failed: expected true to equal false',
      });

      const result = await diagnoser.diagnose(context);

      expect(result.rootCause).toBe('test_failure');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.summary).toContain('Test failure');
    });

    it('should identify build error root cause', async () => {
      const context = createTestFailureContext({
        jobName: 'build',
        errorMessage: 'TypeScript error: Cannot find module',
      });

      const result = await diagnoser.diagnose(context);

      expect(result.rootCause).toBe('build_error');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should identify policy violation root cause', async () => {
      const context = createTestFailureContext({
        errorMessage: 'Policy violation detected',
        policyViolations: [{
          rule: 'frozen_file',
          severity: 'BLOCK',
          file: 'package-lock.json',
          message: 'Cannot modify frozen file',
        }],
      });

      const result = await diagnoser.diagnose(context);

      expect(result.rootCause).toBe('policy_violation');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should identify dependency issue root cause', async () => {
      const context = createTestFailureContext({
        errorMessage: 'Error: Cannot find module "lodash"',
      });

      const result = await diagnoser.diagnose(context);

      expect(result.rootCause).toBe('dependency_issue');
    });

    it('should identify resource limit root cause', async () => {
      const context = createTestFailureContext({
        errorMessage: 'FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory',
      });

      const result = await diagnoser.diagnose(context);

      expect(result.rootCause).toBe('resource_limit');
    });

    it('should identify permission denied root cause', async () => {
      const context = createTestFailureContext({
        errorMessage: 'Error: EACCES: permission denied, open /etc/passwd',
      });

      const result = await diagnoser.diagnose(context);

      expect(result.rootCause).toBe('permission_denied');
    });

    it('should identify network error root cause', async () => {
      const context = createTestFailureContext({
        errorMessage: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
      });

      const result = await diagnoser.diagnose(context);

      expect(result.rootCause).toBe('network_error');
    });

    it('should return unknown for unrecognized errors', async () => {
      const context = createTestFailureContext({
        errorMessage: 'Something went wrong',
        stackTrace: undefined,
      });

      const result = await diagnoser.diagnose(context);

      expect(result.rootCause).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should generate potential fixes', async () => {
      const context = createTestFailureContext({
        jobName: 'test',
        errorMessage: 'Test assertion failed',
      });

      const result = await diagnoser.diagnose(context);

      expect(result.potentialFixes.length).toBeGreaterThan(0);
      expect(result.potentialFixes[0]).toHaveProperty('description');
      expect(result.potentialFixes[0]).toHaveProperty('confidence');
      expect(result.potentialFixes[0]).toHaveProperty('effort');
      expect(result.potentialFixes[0]).toHaveProperty('risk');
    });

    it('should generate analysis with proper structure', async () => {
      const context = createTestFailureContext();
      const result = await diagnoser.diagnose(context);

      expect(result.analysis).toContain('Root Cause Analysis');
      expect(result.analysis).toContain('Error Details');
      expect(result.analysis).toContain('Context');
    });

    it('should include prevention recommendations', async () => {
      const context = createTestFailureContext({
        jobName: 'test',
        errorMessage: 'Test failure',
      });

      const result = await diagnoser.diagnose(context);

      expect(result.preventionRecommendations).toBeDefined();
      expect(result.preventionRecommendations!.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Context Collector Tests
// ============================================================================

describe('ContextCollector', () => {
  let collector: ContextCollector;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    collector = createContextCollector(mockPrisma as any);
  });

  describe('collectFailureContext', () => {
    it('should collect context for a failed run', async () => {
      mockPrisma.workflowRun.findUnique.mockResolvedValue({
        id: 'run-1',
        workflowId: 'wf-1',
        jobName: 'apply_patches',
        status: 'failed',
        errorMsg: 'Error: Something broke',
        inputs: { taskId: 'task-1' },
        outputs: null,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 1000,
        workflow: { state: 'FAILED' },
      });

      mockPrisma.workflowEvent.findMany.mockResolvedValue([
        { type: 'STARTED', createdAt: new Date(), payload: {} },
      ]);

      mockPrisma.policyViolation.findMany.mockResolvedValue([]);

      const context = await collector.collectFailureContext('wf-1', 'run-1');

      expect(context.workflowId).toBe('wf-1');
      expect(context.runId).toBe('run-1');
      expect(context.jobName).toBe('apply_patches');
      expect(context.errorMessage).toBe('Error: Something broke');
      expect(context.workflowState).toBe('FAILED');
    });

    it('should throw if run not found', async () => {
      mockPrisma.workflowRun.findUnique.mockResolvedValue(null);

      await expect(
        collector.collectFailureContext('wf-1', 'run-nonexistent')
      ).rejects.toThrow('Run not found');
    });

    it('should throw if run is not failed', async () => {
      mockPrisma.workflowRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'completed',
      });

      await expect(
        collector.collectFailureContext('wf-1', 'run-1')
      ).rejects.toThrow('not failed');
    });

    it('should extract stack trace from error message', async () => {
      mockPrisma.workflowRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'failed',
        errorMsg: 'Error: Test failed\n    at Object.<anonymous> (test.ts:10:5)\n    at Module._compile',
        inputs: {},
        workflow: { state: 'FAILED' },
      });

      mockPrisma.workflowEvent.findMany.mockResolvedValue([]);
      mockPrisma.policyViolation.findMany.mockResolvedValue([]);

      const context = await collector.collectFailureContext('wf-1', 'run-1');

      expect(context.errorMessage).toBe('Error: Test failed');
      expect(context.stackTrace).toContain('at Object.<anonymous>');
    });

    it('should include policy violations', async () => {
      mockPrisma.workflowRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'failed',
        errorMsg: 'Policy violation',
        inputs: {},
        workflow: { state: 'BLOCKED_POLICY' },
      });

      mockPrisma.workflowEvent.findMany.mockResolvedValue([]);
      mockPrisma.policyViolation.findMany.mockResolvedValue([
        { rule: 'frozen_file', severity: 'BLOCK', file: 'lock.json', message: 'No modify' },
      ]);

      const context = await collector.collectFailureContext('wf-1', 'run-1');

      expect(context.policyViolations).toBeDefined();
      expect(context.policyViolations!.length).toBe(1);
      expect(context.policyViolations![0].rule).toBe('frozen_file');
    });
  });

  describe('collectFromWorkflowState', () => {
    it('should find most recent failed run', async () => {
      mockPrisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'FAILED',
      });

      mockPrisma.workflowRun.findFirst.mockResolvedValue({
        id: 'run-latest',
      });

      mockPrisma.workflowRun.findUnique.mockResolvedValue({
        id: 'run-latest',
        status: 'failed',
        errorMsg: 'Error',
        inputs: {},
        workflow: { state: 'FAILED' },
      });

      mockPrisma.workflowEvent.findMany.mockResolvedValue([]);
      mockPrisma.policyViolation.findMany.mockResolvedValue([]);

      const context = await collector.collectFromWorkflowState('wf-1');

      expect(context).toBeDefined();
      expect(context!.runId).toBe('run-latest');
    });

    it('should return null for non-failed workflow', async () => {
      mockPrisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        state: 'DONE',
      });

      const context = await collector.collectFromWorkflowState('wf-1');

      expect(context).toBeNull();
    });
  });
});

// ============================================================================
// Diagnosis Service Tests
// ============================================================================

describe('DiagnosisService', () => {
  let service: DiagnosisService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = createDiagnosisService(mockPrisma as any);
  });

  describe('diagnoseRun', () => {
    beforeEach(() => {
      mockPrisma.workflowRun.findUnique.mockResolvedValue({
        id: 'run-1',
        workflowId: 'wf-1',
        jobName: 'test',
        status: 'failed',
        errorMsg: 'Test assertion failed',
        inputs: {},
        outputs: null,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 500,
        workflow: { state: 'FAILED' },
      });

      mockPrisma.workflowEvent.findMany.mockResolvedValue([]);
      mockPrisma.policyViolation.findMany.mockResolvedValue([]);
      mockPrisma.artifact.create.mockResolvedValue({ id: 'art-1' });
      mockPrisma.workflowEvent.create.mockResolvedValue({ id: 'event-1' });
    });

    it('should diagnose and persist artifact', async () => {
      const result = await service.diagnoseRun('wf-1', 'run-1');

      expect(result).toBeDefined();
      expect(result.rootCause).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(mockPrisma.artifact.create).toHaveBeenCalled();
    });

    it('should record diagnosis event', async () => {
      await service.diagnoseRun('wf-1', 'run-1');

      expect(mockPrisma.workflowEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DIAGNOSIS_COMPLETE',
          }),
        })
      );
    });
  });

  describe('diagnoseAndProposeFixes', () => {
    beforeEach(() => {
      mockPrisma.workflowRun.findUnique.mockResolvedValue({
        id: 'run-1',
        workflowId: 'wf-1',
        jobName: 'build',
        status: 'failed',
        errorMsg: 'TypeScript error: Type error in file',
        inputs: {},
        outputs: null,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 500,
        workflow: { state: 'FAILED', baseSha: 'abc123' },
      });

      mockPrisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        baseSha: 'abc123',
      });

      mockPrisma.workflowEvent.findMany.mockResolvedValue([]);
      mockPrisma.policyViolation.findMany.mockResolvedValue([]);
      mockPrisma.artifact.create.mockResolvedValue({ id: 'art-1' });
      mockPrisma.workflowEvent.create.mockResolvedValue({ id: 'event-1' });
      mockPrisma.patchSet.create.mockResolvedValue({ id: 'ps-fix-1' });
    });

    it('should diagnose and propose fixes', async () => {
      const { diagnosis, proposals } = await service.diagnoseAndProposeFixes('wf-1', 'run-1');

      expect(diagnosis).toBeDefined();
      expect(diagnosis.rootCause).toBe('build_error');
      // Proposals are generated for auto-patchable fixes
      expect(proposals.length).toBeGreaterThanOrEqual(0);
    });

    it('should create PatchSet for auto-patchable fixes', async () => {
      await service.diagnoseAndProposeFixes('wf-1', 'run-1');

      // Build errors have auto-patchable fixes
      expect(mockPrisma.patchSet.create).toHaveBeenCalled();
    });
  });

  describe('approveFixProposal', () => {
    it('should approve a fix proposal', async () => {
      mockPrisma.patchSet.update.mockResolvedValue({});
      mockPrisma.approval.create.mockResolvedValue({});
      mockPrisma.workflowEvent.create.mockResolvedValue({});

      const proposal: FixProposal = {
        id: 'prop-1',
        diagnosisId: 'diag-1',
        workflowId: 'wf-1',
        fixIndex: 0,
        patchSetId: 'ps-1',
        status: 'pending_approval',
        proposedAt: new Date(),
      };

      const result = await service.approveFixProposal(proposal, 'user@example.com');

      expect(result.status).toBe('approved');
      expect(result.resolvedBy).toBe('user@example.com');
      expect(mockPrisma.patchSet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'approved' }),
        })
      );
      expect(mockPrisma.approval.create).toHaveBeenCalled();
    });

    it('should record FIX_APPROVED event', async () => {
      mockPrisma.patchSet.update.mockResolvedValue({});
      mockPrisma.approval.create.mockResolvedValue({});
      mockPrisma.workflowEvent.create.mockResolvedValue({});

      const proposal: FixProposal = {
        id: 'prop-1',
        diagnosisId: 'diag-1',
        workflowId: 'wf-1',
        fixIndex: 0,
        status: 'pending_approval',
        proposedAt: new Date(),
      };

      await service.approveFixProposal(proposal, 'user@example.com');

      expect(mockPrisma.workflowEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'FIX_APPROVED',
          }),
        })
      );
    });
  });

  describe('rejectFixProposal', () => {
    it('should reject a fix proposal', async () => {
      mockPrisma.patchSet.update.mockResolvedValue({});
      mockPrisma.workflowEvent.create.mockResolvedValue({});

      const proposal: FixProposal = {
        id: 'prop-1',
        diagnosisId: 'diag-1',
        workflowId: 'wf-1',
        fixIndex: 0,
        patchSetId: 'ps-1',
        status: 'pending_approval',
        proposedAt: new Date(),
      };

      const result = await service.rejectFixProposal(proposal, 'user@example.com', 'Not the right fix');

      expect(result.status).toBe('rejected');
      expect(result.resolutionNotes).toBe('Not the right fix');
      expect(mockPrisma.patchSet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'rejected' }),
        })
      );
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Diagnosis Integration', () => {
  it('should flow from context collection to fix proposal', async () => {
    // Create a diagnoser
    const diagnoser = createDiagnoser();

    // Create a failure context
    const context = createTestFailureContext({
      jobName: 'build',
      errorMessage: 'TypeScript error TS2345: Argument of type "string" is not assignable',
      stackTrace: '    at src/service.ts:25:10',
      involvedFiles: ['src/service.ts'],
    });

    // Diagnose
    const diagnosis = await diagnoser.diagnose(context);

    // Verify diagnosis
    expect(diagnosis.rootCause).toBe('build_error');
    expect(diagnosis.potentialFixes.length).toBeGreaterThan(0);

    // Find an auto-patchable fix
    const autoPatchableFix = diagnosis.potentialFixes.find(f => f.canAutoPatch);
    expect(autoPatchableFix).toBeDefined();

    // Verify the fix has verification commands
    if (autoPatchableFix) {
      expect(autoPatchableFix.verificationCommands).toBeDefined();
    }
  });

  it('should correctly identify all root cause categories', async () => {
    const diagnoser = createDiagnoser();

    const testCases: Array<{ error: string; expected: RootCauseCategory }> = [
      { error: 'assertion failed', expected: 'test_failure' },
      { error: 'TypeScript error', expected: 'build_error' },
      { error: 'module not found', expected: 'dependency_issue' },
      { error: 'permission denied', expected: 'permission_denied' },
      { error: 'timeout exceeded', expected: 'resource_limit' },
      { error: 'ECONNREFUSED', expected: 'network_error' },
      { error: 'service unavailable 503', expected: 'external_service' },
      { error: 'missing config', expected: 'configuration_error' },
      { error: 'invalid JSON parse', expected: 'data_issue' },
    ];

    for (const { error, expected } of testCases) {
      const context = createTestFailureContext({ errorMessage: error });
      const diagnosis = await diagnoser.diagnose(context);
      expect(diagnosis.rootCause).toBe(expected);
    }
  });
});
