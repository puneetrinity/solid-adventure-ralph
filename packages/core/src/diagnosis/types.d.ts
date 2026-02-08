/**
 * Diagnosis Types
 *
 * Types for the self-diagnosis and failure analysis system.
 */
/**
 * Captured context about a failure for diagnosis.
 */
export interface FailureContext {
    /** The workflow that failed */
    workflowId: string;
    /** The failed run */
    runId: string;
    /** Job that failed */
    jobName: string;
    /** Error message */
    errorMessage: string;
    /** Error stack trace if available */
    stackTrace?: string;
    /** Current workflow state */
    workflowState: string;
    /** Inputs that caused the failure */
    inputs: Record<string, unknown>;
    /** Outputs produced before failure */
    partialOutputs?: Record<string, unknown>;
    /** Recent events leading to failure */
    recentEvents: FailureEvent[];
    /** Policy violations if any */
    policyViolations?: PolicyViolationInfo[];
    /** Files involved in the failure */
    involvedFiles?: string[];
    /** Timestamp of failure */
    failedAt: Date;
    /** Duration until failure */
    durationMs?: number;
}
/**
 * Event in the failure timeline.
 */
export interface FailureEvent {
    type: string;
    timestamp: Date;
    payload: Record<string, unknown>;
}
/**
 * Policy violation info for diagnosis.
 */
export interface PolicyViolationInfo {
    rule: string;
    severity: string;
    file: string;
    message: string;
    line?: number;
}
/**
 * Root cause analysis result.
 */
export interface DiagnosisResult {
    /** Unique diagnosis ID */
    id: string;
    /** The failure context that was analyzed */
    context: FailureContext;
    /** Identified root cause category */
    rootCause: RootCauseCategory;
    /** Confidence in the diagnosis (0-1) */
    confidence: number;
    /** Human-readable summary */
    summary: string;
    /** Detailed analysis */
    analysis: string;
    /** Potential fixes identified */
    potentialFixes: PotentialFix[];
    /** Related issues or patterns */
    relatedPatterns?: string[];
    /** Recommendations for prevention */
    preventionRecommendations?: string[];
    /** When the diagnosis was made */
    diagnosedAt: Date;
    /** Duration of diagnosis */
    diagnosisDurationMs: number;
}
/**
 * Categories of root causes.
 */
export type RootCauseCategory = 'code_error' | 'test_failure' | 'build_error' | 'dependency_issue' | 'configuration_error' | 'policy_violation' | 'resource_limit' | 'external_service' | 'data_issue' | 'permission_denied' | 'network_error' | 'unknown';
/**
 * A potential fix for the failure.
 */
export interface PotentialFix {
    /** Description of the fix */
    description: string;
    /** Confidence that this fix will work (0-1) */
    confidence: number;
    /** Effort level to implement */
    effort: 'trivial' | 'small' | 'medium' | 'large';
    /** Risk level of applying this fix */
    risk: 'low' | 'medium' | 'high';
    /** Whether we can auto-generate a patch for this */
    canAutoPatch: boolean;
    /** Suggested file changes */
    suggestedChanges?: SuggestedChange[];
    /** Commands to run after fix */
    verificationCommands?: string[];
}
/**
 * Suggested code change for a fix.
 */
export interface SuggestedChange {
    file: string;
    description: string;
    before?: string;
    after?: string;
    lineStart?: number;
    lineEnd?: number;
}
/**
 * A proposed fix that requires approval.
 */
export interface FixProposal {
    /** Unique proposal ID */
    id: string;
    /** The diagnosis this fix is for */
    diagnosisId: string;
    /** The workflow to fix */
    workflowId: string;
    /** Which potential fix this implements */
    fixIndex: number;
    /** PatchSet ID if patches were generated */
    patchSetId?: string;
    /** Current status */
    status: FixProposalStatus;
    /** Who needs to approve */
    requiresApprovalFrom?: string;
    /** When proposed */
    proposedAt: Date;
    /** When approved/rejected */
    resolvedAt?: Date;
    /** Who resolved it */
    resolvedBy?: string;
    /** Notes from approver */
    resolutionNotes?: string;
}
/**
 * Fix proposal status.
 */
export type FixProposalStatus = 'pending_approval' | 'approved' | 'rejected' | 'applied' | 'failed';
/**
 * Configuration for the diagnosis service.
 */
export interface DiagnosisConfig {
    /** Maximum events to include in context */
    maxEvents: number;
    /** Maximum files to analyze */
    maxFiles: number;
    /** Timeout for LLM diagnosis */
    diagnosisTimeoutMs: number;
    /** Whether to auto-generate fix proposals */
    autoGenerateFixes: boolean;
    /** Minimum confidence to propose a fix */
    minFixConfidence: number;
    /** Whether to store diagnosis artifacts */
    persistDiagnosis: boolean;
}
/**
 * Default diagnosis configuration.
 */
export declare const DEFAULT_DIAGNOSIS_CONFIG: DiagnosisConfig;
