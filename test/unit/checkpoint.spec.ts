/**
 * Checkpoint & Recovery Unit Tests
 */

import {
  Checkpoint,
  CheckpointSnapshot,
  WORKFLOW_STAGES,
  getStageByState,
  getStageByIndex,
  DEFAULT_PRUNING_CONFIG,
} from '../../packages/core/src/diagnosis/checkpoint-types';

import {
  CheckpointService,
  createCheckpointService,
} from '../../packages/core/src/diagnosis/checkpoint-service';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockPrisma = () => ({
  workflow: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  checkpoint: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  workflowEvent: {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  artifact: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  patchSet: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  approval: {
    findMany: jest.fn(),
  },
  workflowRun: {
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  },
  policyViolation: {
    count: jest.fn(),
  },
});

const createMockWorkflow = (state = 'INGESTED') => ({
  id: 'wf-test-123',
  state,
  baseSha: 'abc123',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ============================================================================
// Checkpoint Types Tests
// ============================================================================

describe('Checkpoint Types', () => {
  describe('WORKFLOW_STAGES', () => {
    it('should have all standard stages', () => {
      expect(WORKFLOW_STAGES.length).toBe(7);
      expect(WORKFLOW_STAGES[0].name).toBe('ingested');
      expect(WORKFLOW_STAGES[6].name).toBe('done');
    });

    it('should have sequential indices', () => {
      WORKFLOW_STAGES.forEach((stage, index) => {
        expect(stage.index).toBe(index);
      });
    });
  });

  describe('getStageByState', () => {
    it('should return correct stage for valid state', () => {
      const stage = getStageByState('PATCHES_PROPOSED');
      expect(stage).toBeDefined();
      expect(stage!.name).toBe('patches_proposed');
      expect(stage!.index).toBe(1);
    });

    it('should return undefined for unknown state', () => {
      const stage = getStageByState('UNKNOWN_STATE');
      expect(stage).toBeUndefined();
    });
  });

  describe('getStageByIndex', () => {
    it('should return correct stage for valid index', () => {
      const stage = getStageByIndex(3);
      expect(stage).toBeDefined();
      expect(stage!.name).toBe('applying');
      expect(stage!.state).toBe('APPLYING_PATCHES');
    });

    it('should return undefined for invalid index', () => {
      const stage = getStageByIndex(99);
      expect(stage).toBeUndefined();
    });
  });

  describe('DEFAULT_PRUNING_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_PRUNING_CONFIG.maxCheckpointsPerWorkflow).toBe(10);
      expect(DEFAULT_PRUNING_CONFIG.maxCheckpointAgeDays).toBe(30);
      expect(DEFAULT_PRUNING_CONFIG.keepFirstCheckpoint).toBe(true);
      expect(DEFAULT_PRUNING_CONFIG.preserveManualCheckpoints).toBe(true);
    });
  });
});

// ============================================================================
// Checkpoint Service Tests
// ============================================================================

describe('CheckpointService', () => {
  let service: CheckpointService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = createCheckpointService(mockPrisma as any);
  });

  describe('createAutoCheckpoint', () => {
    beforeEach(() => {
      mockPrisma.workflow.findUnique.mockResolvedValue(createMockWorkflow('PATCHES_PROPOSED'));
      mockPrisma.artifact.findMany.mockResolvedValue([]);
      mockPrisma.patchSet.findMany.mockResolvedValue([]);
      mockPrisma.approval.findMany.mockResolvedValue([]);
      mockPrisma.workflowEvent.findMany.mockResolvedValue([]);
      mockPrisma.workflowRun.findFirst.mockResolvedValue(null);
      mockPrisma.policyViolation.count.mockResolvedValue(0);
      mockPrisma.checkpoint.create.mockResolvedValue({
        id: 'cp-auto-1',
        workflowId: 'wf-test-123',
        name: 'Auto: ingestion complete',
        state: 'PATCHES_PROPOSED',
        stageIndex: 1,
        stageName: 'patches_proposed',
        snapshot: {},
        isAutomatic: true,
        createdAt: new Date(),
      });
      mockPrisma.workflowEvent.create.mockResolvedValue({ id: 'event-1' });
      mockPrisma.checkpoint.findMany.mockResolvedValue([]);
    });

    it('should create an automatic checkpoint', async () => {
      const checkpoint = await service.createAutoCheckpoint(
        'wf-test-123',
        'ingestion'
      );

      expect(checkpoint).toBeDefined();
      expect(checkpoint.isAutomatic).toBe(true);
      expect(mockPrisma.checkpoint.create).toHaveBeenCalled();
    });

    it('should record CHECKPOINT_CREATED event', async () => {
      await service.createAutoCheckpoint('wf-test-123', 'ingestion');

      expect(mockPrisma.workflowEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'CHECKPOINT_CREATED',
          }),
        })
      );
    });

    it('should capture workflow snapshot', async () => {
      mockPrisma.artifact.findMany.mockResolvedValue([
        { id: 'art-1', kind: 'SCOPE', contentSha: 'sha1', createdAt: new Date() },
      ]);
      mockPrisma.patchSet.findMany.mockResolvedValue([
        { id: 'ps-1', title: 'Fix bug', status: 'proposed', createdAt: new Date(), _count: { patches: 2 } },
      ]);

      await service.createAutoCheckpoint('wf-test-123', 'ingestion');

      const createCall = mockPrisma.checkpoint.create.mock.calls[0][0];
      expect(createCall.data.snapshot).toBeDefined();
    });
  });

  describe('createManualCheckpoint', () => {
    beforeEach(() => {
      mockPrisma.workflow.findUnique.mockResolvedValue(createMockWorkflow('WAITING_USER_APPROVAL'));
      mockPrisma.artifact.findMany.mockResolvedValue([]);
      mockPrisma.patchSet.findMany.mockResolvedValue([]);
      mockPrisma.approval.findMany.mockResolvedValue([]);
      mockPrisma.workflowEvent.findMany.mockResolvedValue([]);
      mockPrisma.workflowRun.findFirst.mockResolvedValue(null);
      mockPrisma.policyViolation.count.mockResolvedValue(0);
      mockPrisma.checkpoint.create.mockResolvedValue({
        id: 'cp-manual-1',
        workflowId: 'wf-test-123',
        name: 'Before major change',
        state: 'WAITING_USER_APPROVAL',
        stageIndex: 2,
        stageName: 'awaiting_approval',
        snapshot: {},
        isAutomatic: false,
        createdBy: 'user@example.com',
        createdAt: new Date(),
      });
      mockPrisma.workflowEvent.create.mockResolvedValue({ id: 'event-1' });
      mockPrisma.checkpoint.findMany.mockResolvedValue([]);
    });

    it('should create a manual checkpoint with user info', async () => {
      const checkpoint = await service.createManualCheckpoint(
        'wf-test-123',
        'Before major change',
        'user@example.com',
        'Saving state before big refactor'
      );

      expect(checkpoint).toBeDefined();
      expect(checkpoint.isAutomatic).toBe(false);
      expect(checkpoint.createdBy).toBe('user@example.com');
    });

    it('should include notes in metadata', async () => {
      await service.createManualCheckpoint(
        'wf-test-123',
        'Before major change',
        'user@example.com',
        'Important save point'
      );

      const createCall = mockPrisma.checkpoint.create.mock.calls[0][0];
      expect(createCall.data.metadata.notes).toBe('Important save point');
    });
  });

  describe('restore', () => {
    beforeEach(() => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue({
        id: 'cp-1',
        workflowId: 'wf-test-123',
        state: 'INGESTED',
        stageIndex: 0,
        snapshot: {
          workflowState: 'INGESTED',
          baseSha: 'abc123',
          artifacts: [],
          patchSets: [],
          approvals: [],
          recentEventIds: [],
          hasViolations: false,
          violationCount: 0,
        },
        createdAt: new Date('2026-01-01'),
      });
      mockPrisma.workflow.update.mockResolvedValue({});
      mockPrisma.workflowEvent.create.mockResolvedValue({ id: 'event-1' });
      mockPrisma.workflowEvent.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.artifact.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.patchSet.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.workflowRun.deleteMany.mockResolvedValue({ count: 3 });
    });

    it('should restore workflow to checkpoint state', async () => {
      const result = await service.restore('cp-1');

      expect(result.success).toBe(true);
      expect(result.restoredToState).toBe('INGESTED');
      expect(result.restoredToStage).toBe(0);
      expect(mockPrisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            state: 'INGESTED',
          }),
        })
      );
    });

    it('should clean up data after checkpoint', async () => {
      const result = await service.restore('cp-1');

      expect(result.cleanedUp.events).toBe(5);
      expect(result.cleanedUp.artifacts).toBe(2);
      expect(result.cleanedUp.patchSets).toBe(1);
      expect(result.cleanedUp.runs).toBe(3);
    });

    it('should record CHECKPOINT_RESTORED event', async () => {
      await service.restore('cp-1', { reason: 'Rollback after failure' });

      expect(mockPrisma.workflowEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'CHECKPOINT_RESTORED',
          }),
        })
      );
    });

    it('should preserve data when options specify', async () => {
      await service.restore('cp-1', {
        preserveEvents: true,
        preserveArtifacts: true,
      });

      expect(mockPrisma.workflowEvent.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.artifact.deleteMany).not.toHaveBeenCalled();
      // Runs are always cleaned up
      expect(mockPrisma.workflowRun.deleteMany).toHaveBeenCalled();
    });

    it('should return error for non-existent checkpoint', async () => {
      mockPrisma.checkpoint.findUnique.mockResolvedValue(null);

      const result = await service.restore('cp-nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getCheckpoints', () => {
    it('should return all checkpoints for a workflow', async () => {
      mockPrisma.checkpoint.findMany.mockResolvedValue([
        { id: 'cp-1', stageIndex: 0, state: 'INGESTED', createdAt: new Date() },
        { id: 'cp-2', stageIndex: 1, state: 'PATCHES_PROPOSED', createdAt: new Date() },
      ]);

      const checkpoints = await service.getCheckpoints('wf-test-123');

      expect(checkpoints.length).toBe(2);
      expect(mockPrisma.checkpoint.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId: 'wf-test-123' },
        })
      );
    });
  });

  describe('getLatestCheckpoint', () => {
    it('should return the most recent checkpoint', async () => {
      mockPrisma.checkpoint.findFirst.mockResolvedValue({
        id: 'cp-latest',
        stageIndex: 3,
        state: 'APPLYING_PATCHES',
        createdAt: new Date(),
      });

      const checkpoint = await service.getLatestCheckpoint('wf-test-123');

      expect(checkpoint).toBeDefined();
      expect(checkpoint!.id).toBe('cp-latest');
    });

    it('should return null if no checkpoints exist', async () => {
      mockPrisma.checkpoint.findFirst.mockResolvedValue(null);

      const checkpoint = await service.getLatestCheckpoint('wf-test-123');

      expect(checkpoint).toBeNull();
    });
  });

  describe('getCheckpointAtStage', () => {
    it('should return checkpoint at specific stage', async () => {
      mockPrisma.checkpoint.findFirst.mockResolvedValue({
        id: 'cp-stage-2',
        stageIndex: 2,
        stageName: 'awaiting_approval',
        state: 'WAITING_USER_APPROVAL',
        createdAt: new Date(),
      });

      const checkpoint = await service.getCheckpointAtStage('wf-test-123', 2);

      expect(checkpoint).toBeDefined();
      expect(checkpoint!.stageIndex).toBe(2);
    });
  });

  describe('pruneCheckpoints', () => {
    it('should prune checkpoints over max count', async () => {
      // Create 15 checkpoints - with default config (max 10, keepFirstCheckpoint: true)
      // The oldest (last in array) is preserved, so we expect 4 to be pruned
      const checkpoints = Array.from({ length: 15 }, (_, i) => ({
        id: `cp-${i}`,
        isAutomatic: true,
        createdAt: new Date(Date.now() - i * 1000), // newest first
      }));
      mockPrisma.checkpoint.findMany.mockResolvedValue(checkpoints);
      mockPrisma.checkpoint.deleteMany.mockResolvedValue({ count: 4 });

      const result = await service.pruneCheckpoints('wf-test-123');

      // 15 checkpoints, max 10, but oldest is preserved = 4 pruned, 11 remaining
      expect(result.prunedCount).toBe(4);
      expect(result.remainingCount).toBe(11);
    });

    it('should preserve manual checkpoints', async () => {
      const checkpoints = [
        { id: 'cp-0', isAutomatic: true, createdAt: new Date() },
        { id: 'cp-1', isAutomatic: false, createdAt: new Date() }, // manual
        ...Array.from({ length: 13 }, (_, i) => ({
          id: `cp-${i + 2}`,
          isAutomatic: true,
          createdAt: new Date(Date.now() - (i + 2) * 1000),
        })),
      ];
      mockPrisma.checkpoint.findMany.mockResolvedValue(checkpoints);
      mockPrisma.checkpoint.deleteMany.mockResolvedValue({ count: 4 });

      const result = await service.pruneCheckpoints('wf-test-123');

      // Should not include cp-1 (manual) in pruned list
      expect(result.prunedCheckpointIds).not.toContain('cp-1');
    });

    it('should preserve first checkpoint', async () => {
      const checkpoints = Array.from({ length: 12 }, (_, i) => ({
        id: `cp-${i}`,
        isAutomatic: true,
        createdAt: new Date(Date.now() - i * 1000),
      }));
      mockPrisma.checkpoint.findMany.mockResolvedValue(checkpoints);
      mockPrisma.checkpoint.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.pruneCheckpoints('wf-test-123');

      // cp-11 is the first (oldest) checkpoint, should not be pruned
      expect(result.prunedCheckpointIds).not.toContain('cp-11');
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete a specific checkpoint', async () => {
      mockPrisma.checkpoint.delete.mockResolvedValue({});

      const result = await service.deleteCheckpoint('cp-1');

      expect(result).toBe(true);
      expect(mockPrisma.checkpoint.delete).toHaveBeenCalledWith({
        where: { id: 'cp-1' },
      });
    });

    it('should return false if checkpoint not found', async () => {
      mockPrisma.checkpoint.delete.mockRejectedValue(new Error('Not found'));

      const result = await service.deleteCheckpoint('cp-nonexistent');

      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Checkpoint Integration', () => {
  it('should create and restore checkpoint flow', async () => {
    const mockPrisma = createMockPrisma();

    // Setup for creation
    mockPrisma.workflow.findUnique.mockResolvedValue(createMockWorkflow('INGESTED'));
    mockPrisma.artifact.findMany.mockResolvedValue([
      { id: 'art-1', kind: 'SCOPE', contentSha: 'sha1', createdAt: new Date() },
    ]);
    mockPrisma.patchSet.findMany.mockResolvedValue([]);
    mockPrisma.approval.findMany.mockResolvedValue([]);
    mockPrisma.workflowEvent.findMany.mockResolvedValue([{ id: 'event-1' }]);
    mockPrisma.workflowRun.findFirst.mockResolvedValue(null);
    mockPrisma.policyViolation.count.mockResolvedValue(0);

    const checkpointId = 'cp-test-1';
    const createdAt = new Date();

    mockPrisma.checkpoint.create.mockResolvedValue({
      id: checkpointId,
      workflowId: 'wf-test-123',
      name: 'Auto: ingestion complete',
      state: 'INGESTED',
      stageIndex: 0,
      stageName: 'ingested',
      snapshot: {
        workflowState: 'INGESTED',
        artifacts: [{ id: 'art-1', kind: 'SCOPE', contentSha: 'sha1' }],
        patchSets: [],
        approvals: [],
        recentEventIds: ['event-1'],
        hasViolations: false,
        violationCount: 0,
      },
      isAutomatic: true,
      createdAt,
    });
    mockPrisma.workflowEvent.create.mockResolvedValue({ id: 'event-2' });
    mockPrisma.checkpoint.findMany.mockResolvedValue([]);

    const service = createCheckpointService(mockPrisma as any);

    // Create checkpoint
    const checkpoint = await service.createAutoCheckpoint('wf-test-123', 'ingestion');
    expect(checkpoint.id).toBe(checkpointId);
    expect(checkpoint.snapshot.artifacts.length).toBe(1);

    // Setup for restore
    mockPrisma.checkpoint.findUnique.mockResolvedValue({
      id: checkpointId,
      workflowId: 'wf-test-123',
      state: 'INGESTED',
      stageIndex: 0,
      snapshot: checkpoint.snapshot,
      createdAt,
    });
    mockPrisma.workflow.update.mockResolvedValue({});
    mockPrisma.workflowEvent.deleteMany.mockResolvedValue({ count: 10 });
    mockPrisma.artifact.deleteMany.mockResolvedValue({ count: 3 });
    mockPrisma.patchSet.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.workflowRun.deleteMany.mockResolvedValue({ count: 5 });

    // Restore from checkpoint
    const result = await service.restore(checkpointId);
    expect(result.success).toBe(true);
    expect(result.restoredToState).toBe('INGESTED');
    expect(result.cleanedUp.events).toBe(10);
  });
});
