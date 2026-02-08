"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gate2Service = void 0;
exports.evaluateGate2 = evaluateGate2;
exports.isGate2Blocking = isGate2Blocking;
exports.createPolicyEvaluatedEvent = createPolicyEvaluatedEvent;
const policy_engine_1 = require("./policy-engine");
/**
 * Evaluate Gate2 for a given diff.
 * This is a pure function that produces a Gate2Result.
 */
function evaluateGate2(diff, config) {
    const policyResult = (0, policy_engine_1.evaluatePolicy)(diff, config);
    const blockingCount = policyResult.violations.filter(v => v.severity === 'BLOCK').length;
    const warningCount = policyResult.violations.filter(v => v.severity === 'WARN').length;
    let verdict;
    if (blockingCount > 0) {
        verdict = 'FAIL';
    }
    else if (warningCount > 0) {
        verdict = 'WARN';
    }
    else {
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
class Gate2Service {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * Evaluate Gate2 and persist violations to the database.
     * Returns the gate result and persisted violation IDs.
     */
    async evaluateAndPersist(input) {
        const result = evaluateGate2(input.diff, input.config);
        // Persist violations to database
        const violationIds = [];
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
    async getViolations(workflowId) {
        const violations = await this.prisma.policyViolation.findMany({
            where: { workflowId },
            orderBy: { createdAt: 'desc' }
        });
        return violations.map(v => ({
            rule: v.rule,
            severity: v.severity,
            file: v.file,
            message: v.message,
            line: v.line ?? undefined,
            evidence: v.evidence ?? undefined
        }));
    }
    /**
     * Check if a workflow has blocking violations.
     */
    async hasBlockingViolations(workflowId) {
        const count = await this.prisma.policyViolation.count({
            where: { workflowId, severity: 'BLOCK' }
        });
        return count > 0;
    }
    /**
     * Get violation counts for a workflow.
     */
    async getViolationCounts(workflowId) {
        const [blocking, warning] = await Promise.all([
            this.prisma.policyViolation.count({ where: { workflowId, severity: 'BLOCK' } }),
            this.prisma.policyViolation.count({ where: { workflowId, severity: 'WARN' } })
        ]);
        return { blocking, warning };
    }
}
exports.Gate2Service = Gate2Service;
/**
 * Check if Gate2 result indicates the workflow should be blocked.
 * This is used by the transition logic.
 */
function isGate2Blocking(result) {
    return result.verdict === 'FAIL';
}
/**
 * Create a transition event from a Gate2 result.
 * This allows Gate2 to integrate with the transition logic.
 */
function createPolicyEvaluatedEvent(result) {
    return {
        type: 'E_POLICY_EVALUATED',
        result: { hasBlockingViolations: isGate2Blocking(result) }
    };
}
//# sourceMappingURL=gate2.js.map