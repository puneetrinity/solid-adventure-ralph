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

import { parseDiff, type DiffFile, type ParsedDiff } from './diff-parser';

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
export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  frozenFiles: [
    '.github/workflows/ci.yml',
    '.github/workflows/deploy.yml',
    '.github/CODEOWNERS',
    'LICENSE',
  ],
  denyGlobs: [
    '.env*',
    '*.pem',
    '*.key',
    '**/secrets/**',
    '**/credentials/**',
    '.ssh/**',
    '**/.aws/**',
  ],
  secretPatterns: [
    // API keys and tokens
    /(?:api[_-]?key|apikey)[\s]*[:=][\s]*['"]?[a-zA-Z0-9_\-]{20,}['"]?/i,
    /(?:secret[_-]?key|secretkey)[\s]*[:=][\s]*['"]?[a-zA-Z0-9_\-]{20,}['"]?/i,
    /(?:access[_-]?token|accesstoken)[\s]*[:=][\s]*['"]?[a-zA-Z0-9_\-]{20,}['"]?/i,
    /(?:auth[_-]?token|authtoken)[\s]*[:=][\s]*['"]?[a-zA-Z0-9_\-]{20,}['"]?/i,

    // AWS credentials
    /AKIA[0-9A-Z]{16}/,
    /aws[_-]?secret[_-]?access[_-]?key[\s]*[:=][\s]*['"]?[a-zA-Z0-9/+=]{40}['"]?/i,

    // Private keys
    /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/,

    // GitHub tokens
    /gh[pousr]_[A-Za-z0-9_]{36,}/,
    /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/,

    // Generic password patterns (only in added lines)
    /password[\s]*[:=][\s]*['"][^'"]{8,}['"]/i,

    // Database connection strings with credentials
    /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/i,
  ],
  dependencyFiles: [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Gemfile',
    'Gemfile.lock',
    'requirements.txt',
    'Pipfile',
    'Pipfile.lock',
    'go.mod',
    'go.sum',
    'Cargo.toml',
    'Cargo.lock',
  ],
  allowDependencyChanges: false,
};

/**
 * Simple glob matcher supporting * and ** patterns.
 */
function matchGlob(pattern: string, path: string): boolean {
  // Escape regex special chars except * and **
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');

  // Anchor the pattern
  regexStr = `^${regexStr}$`;

  return new RegExp(regexStr).test(path);
}

/**
 * Check if a file matches any of the patterns.
 */
function matchesAnyPattern(file: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (matchGlob(pattern, file)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Extract added lines from a diff for a specific file.
 */
function extractAddedLines(diff: string, filePath: string): { line: number; content: string }[] {
  const lines = diff.split('\n');
  const addedLines: { line: number; content: string }[] = [];

  let inTargetFile = false;
  let currentLineNum = 0;

  for (const line of lines) {
    // Check for diff header
    if (line.startsWith('diff --git')) {
      inTargetFile = line.includes(`b/${filePath}`);
      continue;
    }

    // Check for hunk header
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch) {
      currentLineNum = parseInt(hunkMatch[1], 10);
      continue;
    }

    // Track line numbers in the new file
    if (inTargetFile) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        addedLines.push({
          line: currentLineNum,
          content: line.slice(1)
        });
        currentLineNum++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Deleted lines don't increment new file line number
      } else if (!line.startsWith('\\')) {
        // Context lines increment line number
        currentLineNum++;
      }
    }
  }

  return addedLines;
}

/**
 * Evaluate a diff against the policy configuration.
 */
export function evaluatePolicy(
  diff: string,
  config: PolicyConfig = DEFAULT_POLICY_CONFIG
): PolicyResult {
  const violations: PolicyViolation[] = [];
  const parsed = parseDiff(diff);

  for (const file of parsed.files) {
    // Check frozen files (BLOCK)
    if (config.frozenFiles.includes(file.path)) {
      violations.push({
        rule: 'frozen_file',
        severity: 'BLOCK',
        file: file.path,
        message: `File "${file.path}" is frozen and cannot be modified`,
      });
    }

    // Also check oldPath for renames
    if (file.oldPath && config.frozenFiles.includes(file.oldPath)) {
      violations.push({
        rule: 'frozen_file',
        severity: 'BLOCK',
        file: file.oldPath,
        message: `Frozen file "${file.oldPath}" cannot be renamed or deleted`,
      });
    }

    // Check deny globs (BLOCK)
    const matchedPattern = matchesAnyPattern(file.path, config.denyGlobs);
    if (matchedPattern) {
      violations.push({
        rule: 'deny_glob',
        severity: 'BLOCK',
        file: file.path,
        message: `File "${file.path}" matches forbidden pattern "${matchedPattern}"`,
        evidence: matchedPattern,
      });
    }

    // Check dependency files (WARN unless allowDependencyChanges is false, then BLOCK)
    const isDependencyFile = config.dependencyFiles.some(
      (depFile) => file.path === depFile || file.path.endsWith(`/${depFile}`)
    );
    if (isDependencyFile) {
      violations.push({
        rule: 'dependency_change',
        severity: config.allowDependencyChanges ? 'WARN' : 'BLOCK',
        file: file.path,
        message: `Dependency file "${file.path}" was modified - requires review`,
      });
    }

    // Check for secrets in added lines (BLOCK)
    const addedLines = extractAddedLines(diff, file.path);
    for (const { line, content } of addedLines) {
      for (const pattern of config.secretPatterns) {
        if (pattern.test(content)) {
          violations.push({
            rule: 'secret_detected',
            severity: 'BLOCK',
            file: file.path,
            line,
            message: `Potential secret or credential detected in "${file.path}"`,
            evidence: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
          });
          break; // Only report one secret per line
        }
      }
    }
  }

  const hasBlockingViolations = violations.some((v) => v.severity === 'BLOCK');

  const summary = hasBlockingViolations
    ? `Policy check FAILED: ${violations.filter((v) => v.severity === 'BLOCK').length} blocking violation(s)`
    : violations.length > 0
    ? `Policy check PASSED with ${violations.length} warning(s)`
    : 'Policy check PASSED: no violations';

  return {
    violations,
    hasBlockingViolations,
    summary,
  };
}

/**
 * Create a policy config from partial options, merging with defaults.
 */
export function createPolicyConfig(
  overrides: Partial<PolicyConfig> = {}
): PolicyConfig {
  return {
    frozenFiles: overrides.frozenFiles ?? DEFAULT_POLICY_CONFIG.frozenFiles,
    denyGlobs: overrides.denyGlobs ?? DEFAULT_POLICY_CONFIG.denyGlobs,
    secretPatterns: overrides.secretPatterns ?? DEFAULT_POLICY_CONFIG.secretPatterns,
    dependencyFiles: overrides.dependencyFiles ?? DEFAULT_POLICY_CONFIG.dependencyFiles,
    allowDependencyChanges: overrides.allowDependencyChanges ?? DEFAULT_POLICY_CONFIG.allowDependencyChanges,
  };
}
