/**
 * Gate3 - CI & Quality Gates Evaluation
 *
 * This module handles:
 * 1. Mapping CI events to workflow state changes
 * 2. Evaluating quality gates (CI, coverage, etc.)
 * 3. Recording CI evidence (logs, artifacts)
 * 4. Triggering transitions to terminal states (DONE / NEEDS_HUMAN)
 */
import type { PrismaClient } from '@prisma/client';
import type { TransitionEvent } from '../workflow/states';
export type CIConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral' | 'timed_out' | 'action_required';
export type CIEventSource = 'check_suite' | 'workflow_run' | 'check_run' | 'status';
export interface CIEventInput {
    source: CIEventSource;
    conclusion: CIConclusion;
    headSha: string;
    owner: string;
    repo: string;
    webhookId?: string;
    checkSuiteId?: number;
    workflowRunId?: number;
    checkRunId?: number;
    name?: string;
    url?: string;
    startedAt?: Date;
    completedAt?: Date;
}
export interface QualityGate {
    name: string;
    required: boolean;
    evaluator: (evidence: CIEvidence) => QualityGateResult;
}
export interface QualityGateResult {
    name: string;
    passed: boolean;
    reason: string;
    evidence?: any;
}
export interface CIEvidence {
    workflowId: string;
    prNumber?: number;
    headSha: string;
    ciConclusion: CIConclusion;
    ciSource: CIEventSource;
    ciCompletedAt: Date;
    checkSuiteUrl?: string;
    workflowRunUrl?: string;
    commitUrl?: string;
    gateResults: QualityGateResult[];
}
export interface Gate3Result {
    workflowId: string;
    passed: boolean;
    ciConclusion: CIConclusion;
    gateResults: QualityGateResult[];
    evidence: CIEvidence;
    transitionEvent: TransitionEvent;
}
export declare const defaultQualityGates: QualityGate[];
export declare class Gate3Service {
    private readonly prisma;
    private readonly qualityGates;
    constructor(prisma: PrismaClient, qualityGates?: QualityGate[]);
    /**
     * Find the workflow associated with a CI event.
     */
    findWorkflowForCIEvent(input: CIEventInput): Promise<string | null>;
    /**
     * Process a CI event and evaluate quality gates.
     */
    processCIEvent(input: CIEventInput): Promise<Gate3Result | null>;
    /**
     * Build CI evidence from input.
     */
    private buildEvidence;
    /**
     * Evaluate all quality gates.
     */
    private evaluateGates;
    /**
     * Record CI evidence in the database.
     */
    private recordEvidence;
    /**
     * Create a transition event for CI completion.
     */
    private createTransitionEvent;
    /**
     * Simple content hash for artifacts.
     */
    private hashContent;
    /**
     * Get CI evidence for a workflow.
     */
    getCIEvidence(workflowId: string): Promise<CIEvidence | null>;
}
/**
 * Map a webhook CI event to the CIEventInput format.
 */
export declare function mapWebhookToCIEvent(webhookId: string, eventType: string, payload: any): CIEventInput | null;
/**
 * Check if a CI conclusion is terminal (workflow should complete).
 */
export declare function isCIConclusionTerminal(conclusion: CIConclusion): boolean;
/**
 * Check if a CI conclusion indicates success.
 */
export declare function isCISuccess(conclusion: CIConclusion): boolean;
