/**
 * Checkpoint Types
 *
 * Types for the checkpoint and recovery system.
 */
/**
 * A workflow checkpoint - a snapshot of workflow state at a point in time.
 */
export interface Checkpoint {
    /** Unique checkpoint ID */
    id: string;
    /** The workflow this checkpoint belongs to */
    workflowId: string;
    /** Descriptive name */
    name: string;
    /** Workflow state at checkpoint time */
    state: string;
    /** Stage index (0-based) */
    stageIndex: number;
    /** Human-readable stage name */
    stageName: string;
    /** Full state snapshot */
    snapshot: CheckpointSnapshot;
    /** Optional metadata */
    metadata?: CheckpointMetadata;
    /** Whether this was created automatically */
    isAutomatic: boolean;
    /** When the checkpoint was created */
    createdAt: Date;
    /** Who created the checkpoint (for manual checkpoints) */
    createdBy?: string;
}
/**
 * Full state snapshot stored in a checkpoint.
 */
export interface CheckpointSnapshot {
    /** Current workflow state */
    workflowState: string;
    /** Base SHA at checkpoint time */
    baseSha?: string;
    /** Artifact summaries (not full content) */
    artifacts: ArtifactSummary[];
    /** PatchSet summaries */
    patchSets: PatchSetSummary[];
    /** Approval records */
    approvals: ApprovalSummary[];
    /** Recent event IDs */
    recentEventIds: string[];
    /** Current run status */
    lastRunId?: string;
    lastRunStatus?: string;
    /** Policy violations if any */
    hasViolations: boolean;
    violationCount: number;
}
/**
 * Artifact summary for checkpoint.
 */
export interface ArtifactSummary {
    id: string;
    kind: string;
    contentSha: string;
    createdAt: Date;
}
/**
 * PatchSet summary for checkpoint.
 */
export interface PatchSetSummary {
    id: string;
    title: string;
    status: string;
    patchCount: number;
    createdAt: Date;
}
/**
 * Approval summary for checkpoint.
 */
export interface ApprovalSummary {
    id: string;
    kind: string;
    createdAt: Date;
}
/**
 * Checkpoint metadata.
 */
export interface CheckpointMetadata {
    /** Why this checkpoint was created */
    reason?: string;
    /** What triggered the checkpoint */
    trigger?: 'stage_complete' | 'manual' | 'before_risky_op' | 'scheduled';
    /** Duration of the stage that just completed */
    stageDurationMs?: number;
    /** Any notes from the user */
    notes?: string;
}
/**
 * Workflow stages for checkpoint tracking.
 */
export interface WorkflowStage {
    index: number;
    name: string;
    state: string;
    description: string;
}
/**
 * Standard workflow stages.
 */
export declare const WORKFLOW_STAGES: WorkflowStage[];
/**
 * Get stage info by state.
 */
export declare function getStageByState(state: string): WorkflowStage | undefined;
/**
 * Get stage info by index.
 */
export declare function getStageByIndex(index: number): WorkflowStage | undefined;
/**
 * Options for restoring from a checkpoint.
 */
export interface RestoreOptions {
    /** Whether to keep events after the checkpoint */
    preserveEvents?: boolean;
    /** Whether to preserve newer artifacts */
    preserveArtifacts?: boolean;
    /** Whether to preserve newer PatchSets */
    preservePatchSets?: boolean;
    /** Reason for the restore */
    reason?: string;
    /** Who is initiating the restore */
    restoredBy?: string;
}
/**
 * Result of a restore operation.
 */
export interface RestoreResult {
    success: boolean;
    checkpointId: string;
    workflowId: string;
    restoredToState: string;
    restoredToStage: number;
    error?: string;
    restoredAt: Date;
    cleanedUp: {
        events: number;
        artifacts: number;
        patchSets: number;
        runs: number;
    };
}
/**
 * Configuration for checkpoint pruning.
 */
export interface PruningConfig {
    /** Maximum checkpoints to keep per workflow */
    maxCheckpointsPerWorkflow: number;
    /** Maximum age of checkpoints (in days) */
    maxCheckpointAgeDays: number;
    /** Whether to keep the first checkpoint always */
    keepFirstCheckpoint: boolean;
    /** Whether to keep manual checkpoints */
    preserveManualCheckpoints: boolean;
}
/**
 * Default pruning configuration.
 */
export declare const DEFAULT_PRUNING_CONFIG: PruningConfig;
/**
 * Result of a pruning operation.
 */
export interface PruneResult {
    workflowId: string;
    prunedCount: number;
    remainingCount: number;
    prunedCheckpointIds: string[];
}
