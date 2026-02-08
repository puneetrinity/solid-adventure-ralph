/**
 * Gate2 - Containment Gate
 *
 * Gate2 evaluates policy results and blocks unsafe execution.
 * It is the enforcement layer that prevents workflows from proceeding
 * when policy violations are detected.
 *
 * Gate2 responsibilities:
 * 1. Evaluate policy results from the policy engine
 * 2. Fail the gate on any BLOCK violations
 * 3. Attach evidence for audit
 * 4. Produce gate result that integrates with transition logic
 */
import type { PrismaClient } from '@prisma/client';
import { type PolicyConfig, type PolicyResult, type PolicyViolation } from './policy-engine';
export type GateVerdict = 'PASS' | 'FAIL' | 'WARN';
export interface GateEvidence {
    policyResult: PolicyResult;
    evaluatedAt: string;
    configSnapshot: Partial<PolicyConfig>;
}
export interface Gate2Result {
    verdict: GateVerdict;
    violations: PolicyViolation[];
    blockingCount: number;
    warningCount: number;
    summary: string;
    evidence: GateEvidence;
}
export interface Gate2Input {
    workflowId: string;
    patchSetId?: string;
    diff: string;
    config?: Partial<PolicyConfig>;
}
/**
 * Evaluate Gate2 for a given diff.
 * This is a pure function that produces a Gate2Result.
 */
export declare function evaluateGate2(diff: string, config?: PolicyConfig): Gate2Result;
/**
 * Gate2 service for persisting violations and gate results.
 */
export declare class Gate2Service {
    private readonly prisma;
    constructor(prisma: PrismaClient);
    /**
     * Evaluate Gate2 and persist violations to the database.
     * Returns the gate result and persisted violation IDs.
     */
    evaluateAndPersist(input: Gate2Input): Promise<{
        result: Gate2Result;
        violationIds: string[];
    }>;
    /**
     * Get violations for a workflow.
     */
    getViolations(workflowId: string): Promise<PolicyViolation[]>;
    /**
     * Check if a workflow has blocking violations.
     */
    hasBlockingViolations(workflowId: string): Promise<boolean>;
    /**
     * Get violation counts for a workflow.
     */
    getViolationCounts(workflowId: string): Promise<{
        blocking: number;
        warning: number;
    }>;
}
/**
 * Check if Gate2 result indicates the workflow should be blocked.
 * This is used by the transition logic.
 */
export declare function isGate2Blocking(result: Gate2Result): boolean;
/**
 * Create a transition event from a Gate2 result.
 * This allows Gate2 to integrate with the transition logic.
 */
export declare function createPolicyEvaluatedEvent(result: Gate2Result): {
    type: 'E_POLICY_EVALUATED';
    result: {
        hasBlockingViolations: boolean;
    };
};
