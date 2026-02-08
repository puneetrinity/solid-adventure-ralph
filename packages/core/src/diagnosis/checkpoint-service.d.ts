/**
 * Checkpoint Service
 *
 * Manages workflow checkpoints for recovery and rollback.
 */
import { PrismaClient } from '@prisma/client';
import { Checkpoint, CheckpointMetadata, RestoreOptions, RestoreResult, PruningConfig, PruneResult } from './checkpoint-types';
export declare class CheckpointService {
    private readonly prisma;
    private readonly pruningConfig;
    constructor(prisma: PrismaClient, pruningConfig?: Partial<PruningConfig>);
    private get config();
    /**
     * Create an automatic checkpoint after a stage completes.
     */
    createAutoCheckpoint(workflowId: string, stageName: string, metadata?: Partial<CheckpointMetadata>): Promise<Checkpoint>;
    /**
     * Create a manual checkpoint.
     */
    createManualCheckpoint(workflowId: string, name: string, createdBy: string, notes?: string): Promise<Checkpoint>;
    /**
     * Create a checkpoint before a risky operation.
     */
    createPreOpCheckpoint(workflowId: string, operationName: string): Promise<Checkpoint>;
    /**
     * Create a checkpoint with full options.
     */
    private createCheckpoint;
    /**
     * Capture a full snapshot of workflow state.
     */
    private captureSnapshot;
    /**
     * Restore a workflow to a checkpoint.
     */
    restore(checkpointId: string, options?: RestoreOptions): Promise<RestoreResult>;
    /**
     * Clean up data created after a checkpoint.
     */
    private cleanupAfterCheckpoint;
    /**
     * Get all checkpoints for a workflow.
     */
    getCheckpoints(workflowId: string): Promise<Checkpoint[]>;
    /**
     * Get a specific checkpoint.
     */
    getCheckpoint(checkpointId: string): Promise<Checkpoint | null>;
    /**
     * Get the latest checkpoint for a workflow.
     */
    getLatestCheckpoint(workflowId: string): Promise<Checkpoint | null>;
    /**
     * Get checkpoint at a specific stage.
     */
    getCheckpointAtStage(workflowId: string, stageIndex: number): Promise<Checkpoint | null>;
    /**
     * Prune old checkpoints for a workflow.
     */
    pruneCheckpoints(workflowId: string): Promise<PruneResult>;
    /**
     * Delete a specific checkpoint.
     */
    deleteCheckpoint(checkpointId: string): Promise<boolean>;
    /**
     * Get workflow with all relations for snapshot.
     */
    private getWorkflowWithRelations;
    /**
     * Convert Prisma model to Checkpoint type.
     */
    private toCheckpoint;
}
/**
 * Create a checkpoint service instance.
 */
export declare function createCheckpointService(prisma: PrismaClient, pruningConfig?: Partial<PruningConfig>): CheckpointService;
