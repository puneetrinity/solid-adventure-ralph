import {
  evaluateGate2,
  isGate2Blocking,
  createPolicyEvaluatedEvent,
  type Gate2Result,
} from '@core/policy/gate2';
import { createPolicyConfig } from '@core/policy/policy-engine';
import { transition, type TransitionContext } from '@core/workflow/transition';

// Sample diffs for testing
const SAFE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index abc123..def456 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,5 +1,6 @@
 import { foo } from './foo';

+const newLine = 'added';
 export function main() {
   console.log('hello');
 }
`;

const FROZEN_FILE_DIFF = `diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index abc123..def456 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -1,5 +1,6 @@
 name: CI
+# Added a comment
 on: [push]
`;

const SECRET_DIFF = `diff --git a/src/config.ts b/src/config.ts
index abc123..def456 100644
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,3 +1,5 @@
 export const config = {
+  apiKey: 'sk-1234567890abcdefghijklmnop',
   port: 3000,
 };
`;

const DEPENDENCY_DIFF = `diff --git a/package.json b/package.json
index abc123..def456 100644
--- a/package.json
+++ b/package.json
@@ -10,6 +10,7 @@
   },
   "dependencies": {
     "express": "^4.18.0",
+    "lodash": "^4.17.21",
     "typescript": "^5.0.0"
   }
 }
`;

function baseCtx(): TransitionContext {
  return {
    workflowId: 'w1',
    hasPatchSets: true,
    latestPatchSetId: 'ps1',
    hasApprovalToApply: false,
    hasBlockingPolicyViolations: false,
    hasPolicyBeenEvaluated: false
  };
}

describe('evaluateGate2', () => {
  describe('verdict determination', () => {
    test('returns PASS for safe diff', () => {
      const config = createPolicyConfig({
        frozenFiles: [],
        denyGlobs: [],
        secretPatterns: [],
        dependencyFiles: [],
      });
      const result = evaluateGate2(SAFE_DIFF, config);
      expect(result.verdict).toBe('PASS');
      expect(result.blockingCount).toBe(0);
      expect(result.warningCount).toBe(0);
    });

    test('returns FAIL for frozen file modification', () => {
      const result = evaluateGate2(FROZEN_FILE_DIFF);
      expect(result.verdict).toBe('FAIL');
      expect(result.blockingCount).toBeGreaterThan(0);
    });

    test('returns FAIL for secret detection', () => {
      const result = evaluateGate2(SECRET_DIFF);
      expect(result.verdict).toBe('FAIL');
      expect(result.blockingCount).toBeGreaterThan(0);
    });

    test('returns FAIL for dependency changes (default config)', () => {
      const result = evaluateGate2(DEPENDENCY_DIFF);
      expect(result.verdict).toBe('FAIL');
      expect(result.blockingCount).toBeGreaterThan(0);
    });

    test('returns WARN for dependency changes when allowed', () => {
      const config = createPolicyConfig({
        allowDependencyChanges: true,
        frozenFiles: [],
        denyGlobs: [],
        secretPatterns: [],
      });
      const result = evaluateGate2(DEPENDENCY_DIFF, config);
      expect(result.verdict).toBe('WARN');
      expect(result.warningCount).toBeGreaterThan(0);
      expect(result.blockingCount).toBe(0);
    });
  });

  describe('evidence attachment', () => {
    test('includes policy result in evidence', () => {
      const result = evaluateGate2(SAFE_DIFF);
      expect(result.evidence.policyResult).toBeDefined();
      expect(result.evidence.policyResult.violations).toBeInstanceOf(Array);
    });

    test('includes evaluation timestamp', () => {
      const result = evaluateGate2(SAFE_DIFF);
      expect(result.evidence.evaluatedAt).toBeDefined();
      expect(() => new Date(result.evidence.evaluatedAt)).not.toThrow();
    });

    test('includes config snapshot when provided', () => {
      const config = createPolicyConfig({
        frozenFiles: ['test.txt'],
        allowDependencyChanges: true,
      });
      const result = evaluateGate2(SAFE_DIFF, config);
      expect(result.evidence.configSnapshot.frozenFiles).toContain('test.txt');
      expect(result.evidence.configSnapshot.allowDependencyChanges).toBe(true);
    });
  });

  describe('summary generation', () => {
    test('generates FAILED summary for blocking violations', () => {
      const result = evaluateGate2(FROZEN_FILE_DIFF);
      expect(result.summary).toContain('FAILED');
      expect(result.summary).toContain('blocking');
    });

    test('generates PASSED with warnings summary', () => {
      const config = createPolicyConfig({
        allowDependencyChanges: true,
        frozenFiles: [],
        denyGlobs: [],
        secretPatterns: [],
      });
      const result = evaluateGate2(DEPENDENCY_DIFF, config);
      expect(result.summary).toContain('PASSED');
      expect(result.summary).toContain('warning');
    });

    test('generates clean PASSED summary', () => {
      const config = createPolicyConfig({
        frozenFiles: [],
        denyGlobs: [],
        secretPatterns: [],
        dependencyFiles: [],
      });
      const result = evaluateGate2(SAFE_DIFF, config);
      expect(result.summary).toContain('PASSED');
      expect(result.summary).toContain('no violations');
    });
  });
});

describe('isGate2Blocking', () => {
  test('returns true for FAIL verdict', () => {
    const result: Gate2Result = {
      verdict: 'FAIL',
      violations: [],
      blockingCount: 1,
      warningCount: 0,
      summary: 'Failed',
      evidence: { policyResult: { violations: [], hasBlockingViolations: true, summary: '' }, evaluatedAt: '', configSnapshot: {} }
    };
    expect(isGate2Blocking(result)).toBe(true);
  });

  test('returns false for WARN verdict', () => {
    const result: Gate2Result = {
      verdict: 'WARN',
      violations: [],
      blockingCount: 0,
      warningCount: 1,
      summary: 'Warning',
      evidence: { policyResult: { violations: [], hasBlockingViolations: false, summary: '' }, evaluatedAt: '', configSnapshot: {} }
    };
    expect(isGate2Blocking(result)).toBe(false);
  });

  test('returns false for PASS verdict', () => {
    const result: Gate2Result = {
      verdict: 'PASS',
      violations: [],
      blockingCount: 0,
      warningCount: 0,
      summary: 'Passed',
      evidence: { policyResult: { violations: [], hasBlockingViolations: false, summary: '' }, evaluatedAt: '', configSnapshot: {} }
    };
    expect(isGate2Blocking(result)).toBe(false);
  });
});

describe('createPolicyEvaluatedEvent', () => {
  test('creates event with hasBlockingViolations true for FAIL', () => {
    const result: Gate2Result = {
      verdict: 'FAIL',
      violations: [],
      blockingCount: 1,
      warningCount: 0,
      summary: 'Failed',
      evidence: { policyResult: { violations: [], hasBlockingViolations: true, summary: '' }, evaluatedAt: '', configSnapshot: {} }
    };
    const event = createPolicyEvaluatedEvent(result);
    expect(event.type).toBe('E_POLICY_EVALUATED');
    expect(event.result.hasBlockingViolations).toBe(true);
  });

  test('creates event with hasBlockingViolations false for PASS', () => {
    const result: Gate2Result = {
      verdict: 'PASS',
      violations: [],
      blockingCount: 0,
      warningCount: 0,
      summary: 'Passed',
      evidence: { policyResult: { violations: [], hasBlockingViolations: false, summary: '' }, evaluatedAt: '', configSnapshot: {} }
    };
    const event = createPolicyEvaluatedEvent(result);
    expect(event.type).toBe('E_POLICY_EVALUATED');
    expect(event.result.hasBlockingViolations).toBe(false);
  });
});

describe('Gate2 transition integration', () => {
  describe('PATCHES_PROPOSED state', () => {
    test('enqueues policy evaluation when patchsets exist', () => {
      const ctx = baseCtx();
      // Trigger with any event to normalize state
      const res = transition('PATCHES_PROPOSED', { type: 'E_WORKFLOW_CREATED' }, ctx);
      expect(res.nextState).toBe('PATCHES_PROPOSED');
      expect(res.enqueue).toEqual([
        { queue: 'workflow', name: 'evaluate_policy', payload: { workflowId: 'w1', patchSetId: 'ps1' } }
      ]);
    });

    test('blocks on policy violations', () => {
      const ctx = baseCtx();
      const res = transition('PATCHES_PROPOSED', { type: 'E_POLICY_EVALUATED', result: { hasBlockingViolations: true } }, ctx);
      expect(res.nextState).toBe('BLOCKED_POLICY');
    });

    test('moves to WAITING_USER_APPROVAL on policy pass', () => {
      const ctx = baseCtx();
      const res = transition('PATCHES_PROPOSED', { type: 'E_POLICY_EVALUATED', result: { hasBlockingViolations: false } }, ctx);
      expect(res.nextState).toBe('WAITING_USER_APPROVAL');
    });
  });

  describe('WAITING_USER_APPROVAL state', () => {
    test('blocks approval if policy violations exist', () => {
      const ctx = { ...baseCtx(), hasApprovalToApply: true, hasBlockingPolicyViolations: true };
      const res = transition('WAITING_USER_APPROVAL', { type: 'E_APPROVAL_RECORDED' }, ctx);
      expect(res.nextState).toBe('BLOCKED_POLICY');
    });

    test('allows approval when no policy violations', () => {
      const ctx = { ...baseCtx(), hasApprovalToApply: true, hasBlockingPolicyViolations: false };
      const res = transition('WAITING_USER_APPROVAL', { type: 'E_APPROVAL_RECORDED' }, ctx);
      expect(res.nextState).toBe('APPLYING_PATCHES');
    });

    test('handles late policy evaluation with violations', () => {
      const ctx = baseCtx();
      const res = transition('WAITING_USER_APPROVAL', { type: 'E_POLICY_EVALUATED', result: { hasBlockingViolations: true } }, ctx);
      expect(res.nextState).toBe('BLOCKED_POLICY');
    });

    test('handles late policy evaluation without violations', () => {
      const ctx = baseCtx();
      const res = transition('WAITING_USER_APPROVAL', { type: 'E_POLICY_EVALUATED', result: { hasBlockingViolations: false } }, ctx);
      expect(res.nextState).toBe('WAITING_USER_APPROVAL');
      expect(res.reason).toContain('warnings only');
    });
  });
});
