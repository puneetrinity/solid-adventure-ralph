/**
 * Checkpoint Service
 *
 * Manages workflow checkpoints for recovery and rollback.
 */

import { v4 as uuid } from 'uuid';
import { PrismaClient } from '@prisma/client';
import {
  Checkpoint,
  CheckpointSnapshot,
  CheckpointMetadata,
  RestoreOptions,
  RestoreResult,
  PruningConfig,
  PruneResult,
  DEFAULT_PRUNING_CONFIG,
  WORKFLOW_STAGES,
  getStageByState,
  ArtifactSummary,
  PatchSetSummary,
  ApprovalSummary,
} from './checkpoint-types';

// ============================================================================
// Checkpoint Service
// ============================================================================

export class CheckpointService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pruningConfig: Partial<PruningConfig> = {}
  ) {}

  private get config(): PruningConfig {
    return { ...DEFAULT_PRUNING_CONFIG, ...this.pruningConfig };
  }

  // --------------------------------------------------------------------------
  // Checkpoint Creation
  // --------------------------------------------------------------------------

  /**
   * Create an automatic checkpoint after a stage completes.
   */
  async createAutoCheckpoint(
    workflowId: string,
    stageName: string,
    metadata?: Partial<CheckpointMetadata>
  ): Promise<Checkpoint> {
    const workflow = await this.getWorkflowWithRelations(workflowId);

    const stage = getStageByState(workflow.state);
    const stageIndex = stage?.index ?? 0;

    return this.createCheckpoint(workflowId, {
      name: `Auto: ${stageName} complete`,
      stageIndex,
      stageName,
      isAutomatic: true,
      metadata: {
        trigger: 'stage_complete',
        ...metadata,
      },
    });
  }

  /**
   * Create a manual checkpoint.
   */
  async createManualCheckpoint(
    workflowId: string,
    name: string,
    createdBy: string,
    notes?: string
  ): Promise<Checkpoint> {
    const workflow = await this.getWorkflowWithRelations(workflowId);

    const stage = getStageByState(workflow.state);
    const stageIndex = stage?.index ?? 0;
    const stageName = stage?.name ?? workflow.state.toLowerCase();

    return this.createCheckpoint(workflowId, {
      name,
      stageIndex,
      stageName,
      isAutomatic: false,
      createdBy,
      metadata: {
        trigger: 'manual',
        notes,
      },
    });
  }

  /**
   * Create a checkpoint before a risky operation.
   */
  async createPreOpCheckpoint(
    workflowId: string,
    operationName: string
  ): Promise<Checkpoint> {
    const workflow = await this.getWorkflowWithRelations(workflowId);

    const stage = getStageByState(workflow.state);
    const stageIndex = stage?.index ?? 0;

    return this.createCheckpoint(workflowId, {
      name: `Before: ${operationName}`,
      stageIndex,
      stageName: stage?.name ?? workflow.state.toLowerCase(),
      isAutomatic: true,
      metadata: {
        trigger: 'before_risky_op',
        reason: `Checkpoint before ${operationName}`,
      },
    });
  }

  /**
   * Create a checkpoint with full options.
   */
  private async createCheckpoint(
    workflowId: string,
    options: {
      name: string;
      stageIndex: number;
      stageName: string;
      isAutomatic: boolean;
      createdBy?: string;
      metadata?: CheckpointMetadata;
    }
  ): Promise<Checkpoint> {
    const workflow = await this.getWorkflowWithRelations(workflowId);
    const snapshot = await this.captureSnapshot(workflowId);

    const checkpoint = await this.prisma.checkpoint.create({
      data: {
        workflowId,
        name: options.name,
        state: workflow.state,
        stageIndex: options.stageIndex,
        stageName: options.stageName,
        snapshot: snapshot as any,
        metadata: options.metadata as any,
        isAutomatic: options.isAutomatic,
        createdBy: options.createdBy,
      },
    });

    // Record event
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'CHECKPOINT_CREATED',
        payload: {
          checkpointId: checkpoint.id,
          name: options.name,
          stageIndex: options.stageIndex,
          isAutomatic: options.isAutomatic,
        } as any,
      },
    });

    // Prune old checkpoints if needed
    await this.pruneCheckpoints(workflowId);

    return this.toCheckpoint(checkpoint);
  }

  // --------------------------------------------------------------------------
  // Snapshot Capture
  // --------------------------------------------------------------------------

  /**
   * Capture a full snapshot of workflow state.
   */
  private async captureSnapshot(workflowId: string): Promise<CheckpointSnapshot> {
    const workflow = await this.getWorkflowWithRelations(workflowId);

    // Get artifacts
    const artifacts = await this.prisma.artifact.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, contentSha: true, createdAt: true },
    });

    // Get patch sets with patch counts
    const patchSets = await this.prisma.patchSet.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { patches: true } } },
    });

    // Get approvals
    const approvals = await this.prisma.approval.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, createdAt: true },
    });

    // Get recent events (last 20)
    const recentEvents = await this.prisma.workflowEvent.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true },
    });

    // Get last run
    const lastRun = await this.prisma.workflowRun.findFirst({
      where: { workflowId },
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true },
    });

    // Get violation count
    const violationCount = await this.prisma.policyViolation.count({
      where: { workflowId },
    });

    return {
      workflowState: workflow.state,
      baseSha: workflow.baseSha ?? undefined,
      artifacts: artifacts.map(a => ({
        id: a.id,
        kind: a.kind,
        contentSha: a.contentSha,
        createdAt: a.createdAt,
      })),
      patchSets: patchSets.map(ps => ({
        id: ps.id,
        title: ps.title,
        status: ps.status,
        patchCount: ps._count.patches,
        createdAt: ps.createdAt,
      })),
      approvals: approvals.map(a => ({
        id: a.id,
        kind: a.kind,
        createdAt: a.createdAt,
      })),
      recentEventIds: recentEvents.map(e => e.id),
      lastRunId: lastRun?.id,
      lastRunStatus: lastRun?.status,
      hasViolations: violationCount > 0,
      violationCount,
    };
  }

  // --------------------------------------------------------------------------
  // Restore Operations
  // --------------------------------------------------------------------------

  /**
   * Restore a workflow to a checkpoint.
   */
  async restore(
    checkpointId: string,
    options: RestoreOptions = {}
  ): Promise<RestoreResult> {
    const checkpoint = await this.prisma.checkpoint.findUnique({
      where: { id: checkpointId },
    });

    if (!checkpoint) {
      return {
        success: false,
        checkpointId,
        workflowId: '',
        restoredToState: '',
        restoredToStage: 0,
        error: 'Checkpoint not found',
        restoredAt: new Date(),
        cleanedUp: { events: 0, artifacts: 0, patchSets: 0, runs: 0 },
      };
    }

    const workflowId = checkpoint.workflowId;
    const snapshot = checkpoint.snapshot as unknown as CheckpointSnapshot;

    try {
      // Clean up data created after the checkpoint
      const cleanedUp = await this.cleanupAfterCheckpoint(
        workflowId,
        checkpoint.createdAt,
        options
      );

      // Restore workflow state
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: {
          state: checkpoint.state,
          baseSha: snapshot.baseSha ?? null,
        },
      });

      // Record restore event
      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'CHECKPOINT_RESTORED',
          payload: {
            checkpointId,
            restoredToState: checkpoint.state,
            restoredToStage: checkpoint.stageIndex,
            reason: options.reason,
            restoredBy: options.restoredBy,
            cleanedUp,
          } as any,
        },
      });

      return {
        success: true,
        checkpointId,
        workflowId,
        restoredToState: checkpoint.state,
        restoredToStage: checkpoint.stageIndex,
        restoredAt: new Date(),
        cleanedUp,
      };
    } catch (error) {
      return {
        success: false,
        checkpointId,
        workflowId,
        restoredToState: checkpoint.state,
        restoredToStage: checkpoint.stageIndex,
        error: (error as Error).message,
        restoredAt: new Date(),
        cleanedUp: { events: 0, artifacts: 0, patchSets: 0, runs: 0 },
      };
    }
  }

  /**
   * Clean up data created after a checkpoint.
   */
  private async cleanupAfterCheckpoint(
    workflowId: string,
    checkpointTime: Date,
    options: RestoreOptions
  ): Promise<{ events: number; artifacts: number; patchSets: number; runs: number }> {
    let eventsDeleted = 0;
    let artifactsDeleted = 0;
    let patchSetsDeleted = 0;
    let runsDeleted = 0;

    // Delete events after checkpoint (unless preserving)
    if (!options.preserveEvents) {
      const eventResult = await this.prisma.workflowEvent.deleteMany({
        where: {
          workflowId,
          createdAt: { gt: checkpointTime },
        },
      });
      eventsDeleted = eventResult.count;
    }

    // Delete artifacts after checkpoint (unless preserving)
    if (!options.preserveArtifacts) {
      const artifactResult = await this.prisma.artifact.deleteMany({
        where: {
          workflowId,
          createdAt: { gt: checkpointTime },
        },
      });
      artifactsDeleted = artifactResult.count;
    }

    // Delete patch sets after checkpoint (unless preserving)
    if (!options.preservePatchSets) {
      const patchSetResult = await this.prisma.patchSet.deleteMany({
        where: {
          workflowId,
          createdAt: { gt: checkpointTime },
        },
      });
      patchSetsDeleted = patchSetResult.count;
    }

    // Always delete runs after checkpoint (they're tied to specific point in time)
    const runResult = await this.prisma.workflowRun.deleteMany({
      where: {
        workflowId,
        startedAt: { gt: checkpointTime },
      },
    });
    runsDeleted = runResult.count;

    return {
      events: eventsDeleted,
      artifacts: artifactsDeleted,
      patchSets: patchSetsDeleted,
      runs: runsDeleted,
    };
  }

  // --------------------------------------------------------------------------
  // Checkpoint Retrieval
  // --------------------------------------------------------------------------

  /**
   * Get all checkpoints for a workflow.
   */
  async getCheckpoints(workflowId: string): Promise<Checkpoint[]> {
    const checkpoints = await this.prisma.checkpoint.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
    });

    return checkpoints.map(c => this.toCheckpoint(c));
  }

  /**
   * Get a specific checkpoint.
   */
  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    const checkpoint = await this.prisma.checkpoint.findUnique({
      where: { id: checkpointId },
    });

    return checkpoint ? this.toCheckpoint(checkpoint) : null;
  }

  /**
   * Get the latest checkpoint for a workflow.
   */
  async getLatestCheckpoint(workflowId: string): Promise<Checkpoint | null> {
    const checkpoint = await this.prisma.checkpoint.findFirst({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
    });

    return checkpoint ? this.toCheckpoint(checkpoint) : null;
  }

  /**
   * Get checkpoint at a specific stage.
   */
  async getCheckpointAtStage(
    workflowId: string,
    stageIndex: number
  ): Promise<Checkpoint | null> {
    const checkpoint = await this.prisma.checkpoint.findFirst({
      where: {
        workflowId,
        stageIndex,
      },
      orderBy: { createdAt: 'desc' },
    });

    return checkpoint ? this.toCheckpoint(checkpoint) : null;
  }

  // --------------------------------------------------------------------------
  // Pruning
  // --------------------------------------------------------------------------

  /**
   * Prune old checkpoints for a workflow.
   */
  async pruneCheckpoints(workflowId: string): Promise<PruneResult> {
    const checkpoints = await this.prisma.checkpoint.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
    });

    const prunedIds: string[] = [];
    const now = new Date();
    const maxAgeMs = this.config.maxCheckpointAgeDays * 24 * 60 * 60 * 1000;

    for (let i = 0; i < checkpoints.length; i++) {
      const checkpoint = checkpoints[i];

      // Keep first checkpoint if configured
      if (this.config.keepFirstCheckpoint && i === checkpoints.length - 1) {
        continue;
      }

      // Keep manual checkpoints if configured
      if (this.config.preserveManualCheckpoints && !checkpoint.isAutomatic) {
        continue;
      }

      // Check if over max count
      const overMaxCount = i >= this.config.maxCheckpointsPerWorkflow;

      // Check if too old
      const age = now.getTime() - checkpoint.createdAt.getTime();
      const tooOld = age > maxAgeMs;

      if (overMaxCount || tooOld) {
        prunedIds.push(checkpoint.id);
      }
    }

    // Delete pruned checkpoints
    if (prunedIds.length > 0) {
      await this.prisma.checkpoint.deleteMany({
        where: { id: { in: prunedIds } },
      });
    }

    return {
      workflowId,
      prunedCount: prunedIds.length,
      remainingCount: checkpoints.length - prunedIds.length,
      prunedCheckpointIds: prunedIds,
    };
  }

  /**
   * Delete a specific checkpoint.
   */
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    try {
      await this.prisma.checkpoint.delete({
        where: { id: checkpointId },
      });
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Get workflow with all relations for snapshot.
   */
  private async getWorkflowWithRelations(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    return workflow;
  }

  /**
   * Convert Prisma model to Checkpoint type.
   */
  private toCheckpoint(model: any): Checkpoint {
    return {
      id: model.id,
      workflowId: model.workflowId,
      name: model.name,
      state: model.state,
      stageIndex: model.stageIndex,
      stageName: model.stageName,
      snapshot: model.snapshot as CheckpointSnapshot,
      metadata: model.metadata as CheckpointMetadata | undefined,
      isAutomatic: model.isAutomatic,
      createdAt: model.createdAt,
      createdBy: model.createdBy ?? undefined,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a checkpoint service instance.
 */
export function createCheckpointService(
  prisma: PrismaClient,
  pruningConfig?: Partial<PruningConfig>
): CheckpointService {
  return new CheckpointService(prisma, pruningConfig);
}
