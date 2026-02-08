/**
 * Policy Engine v1
 *
 * Evaluates diffs against security policies to block unsafe changes.
 *
 * Rules:
 * - Frozen files: explicit list of files that cannot be modified
 * - Deny globs: patterns that match forbidden paths
 * - Secrets detection: patterns that match secrets/credentials
 * - Dependency changes: detects package.json/lock file modifications
 */
export type ViolationSeverity = 'WARN' | 'BLOCK';
export interface PolicyViolation {
    rule: string;
    severity: ViolationSeverity;
    file: string;
    message: string;
    line?: number;
    evidence?: string;
}
export interface PolicyConfig {
    frozenFiles: string[];
    denyGlobs: string[];
    secretPatterns: RegExp[];
    dependencyFiles: string[];
    allowDependencyChanges: boolean;
}
export interface PolicyResult {
    violations: PolicyViolation[];
    hasBlockingViolations: boolean;
    summary: string;
}
/**
 * Default policy configuration.
 */
export declare const DEFAULT_POLICY_CONFIG: PolicyConfig;
/**
 * Evaluate a diff against the policy configuration.
 */
export declare function evaluatePolicy(diff: string, config?: PolicyConfig): PolicyResult;
/**
 * Create a policy config from partial options, merging with defaults.
 */
export declare function createPolicyConfig(overrides?: Partial<PolicyConfig>): PolicyConfig;
