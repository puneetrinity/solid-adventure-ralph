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
import { evaluatePolicy, type PolicyConfig, type PolicyResult, type PolicyViolation } from './policy-engine';

export type GateVerdict = 'PASS' | 'FAIL' | 'WARN';

export interface GateEvidence {
  policyResult: PolicyResult;
  evaluatedAt: string; // ISO timestamp
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
export function evaluateGate2(
  diff: string,
  config?: PolicyConfig
): Gate2Result {
  const policyResult = evaluatePolicy(diff, config);

  const blockingCount = policyResult.violations.filter(v => v.severity === 'BLOCK').length;
  const warningCount = policyResult.violations.filter(v => v.severity === 'WARN').length;

  let verdict: GateVerdict;
  if (blockingCount > 0) {
    verdict = 'FAIL';
  } else if (warningCount > 0) {
    verdict = 'WARN';
  } else {
    verdict = 'PASS';
  }

  const summary = verdict === 'FAIL'
    ? `Gate2 FAILED: ${blockingCount} blocking violation(s)`
    : verdict === 'WARN'
    ? `Gate2 PASSED with ${warningCount} warning(s)`
    : 'Gate2 PASSED: no violations';

  return {
    verdict,
    violations: policyResult.violations,
    blockingCount,
    warningCount,
    summary,
    evidence: {
      policyResult,
      evaluatedAt: new Date().toISOString(),
      configSnapshot: config ? {
        frozenFiles: config.frozenFiles,
        denyGlobs: config.denyGlobs,
        dependencyFiles: config.dependencyFiles,
        allowDependencyChanges: config.allowDependencyChanges,
        // Note: secretPatterns excluded from snapshot (RegExp not serializable)
      } : {}
    }
  };
}

/**
 * Gate2 service for persisting violations and gate results.
 */
export class Gate2Service {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Evaluate Gate2 and persist violations to the database.
   * Returns the gate result and persisted violation IDs.
   */
  async evaluateAndPersist(input: Gate2Input): Promise<{
    result: Gate2Result;
    violationIds: string[];
  }> {
    const result = evaluateGate2(input.diff, input.config as PolicyConfig | undefined);

    // Persist violations to database
    const violationIds: string[] = [];

    if (result.violations.length > 0) {
      const createMany = result.violations.map(v => ({
        workflowId: input.workflowId,
        patchSetId: input.patchSetId,
        rule: v.rule,
        severity: v.severity,
        file: v.file,
        message: v.message,
        line: v.line,
        evidence: v.evidence,
      }));

      // Create violations one by one to get IDs
      for (const data of createMany) {
        const created = await this.prisma.policyViolation.create({ data });
        violationIds.push(created.id);
      }
    }

    return { result, violationIds };
  }

  /**
   * Get violations for a workflow.
   */
  async getViolations(workflowId: string): Promise<PolicyViolation[]> {
    const violations = await this.prisma.policyViolation.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' }
    });

    return violations.map(v => ({
      rule: v.rule,
      severity: v.severity as 'WARN' | 'BLOCK',
      file: v.file,
      message: v.message,
      line: v.line ?? undefined,
      evidence: v.evidence ?? undefined
    }));
  }

  /**
   * Check if a workflow has blocking violations.
   */
  async hasBlockingViolations(workflowId: string): Promise<boolean> {
    const count = await this.prisma.policyViolation.count({
      where: { workflowId, severity: 'BLOCK' }
    });
    return count > 0;
  }

  /**
   * Get violation counts for a workflow.
   */
  async getViolationCounts(workflowId: string): Promise<{ blocking: number; warning: number }> {
    const [blocking, warning] = await Promise.all([
      this.prisma.policyViolation.count({ where: { workflowId, severity: 'BLOCK' } }),
      this.prisma.policyViolation.count({ where: { workflowId, severity: 'WARN' } })
    ]);
    return { blocking, warning };
  }
}

/**
 * Check if Gate2 result indicates the workflow should be blocked.
 * This is used by the transition logic.
 */
export function isGate2Blocking(result: Gate2Result): boolean {
  return result.verdict === 'FAIL';
}

/**
 * Create a transition event from a Gate2 result.
 * This allows Gate2 to integrate with the transition logic.
 */
export function createPolicyEvaluatedEvent(result: Gate2Result): {
  type: 'E_POLICY_EVALUATED';
  result: { hasBlockingViolations: boolean };
} {
  return {
    type: 'E_POLICY_EVALUATED',
    result: { hasBlockingViolations: isGate2Blocking(result) }
  };
}
