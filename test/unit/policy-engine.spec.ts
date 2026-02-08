import {
  parseDiff,
  extractTouchedFiles,
  evaluatePolicy,
  createPolicyConfig,
  DEFAULT_POLICY_CONFIG,
  type PolicyConfig,
} from '@core/policy';

// Sample diffs for testing
const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
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

const NEW_FILE_DIFF = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+export function newFunc() {
+  return 'new';
+}
`;

const DELETED_FILE_DIFF = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc123..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFunc() {
-  return 'old';
-}
`;

const RENAME_DIFF = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 100%
rename from src/old-name.ts
rename to src/new-name.ts
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

const ENV_FILE_DIFF = `diff --git a/.env.local b/.env.local
index abc123..def456 100644
--- a/.env.local
+++ b/.env.local
@@ -1,2 +1,3 @@
 NODE_ENV=development
+API_KEY=secret123
`;

const SECRET_DIFF = `diff --git a/src/config.ts b/src/config.ts
index abc123..def456 100644
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,3 +1,5 @@
 export const config = {
+  apiKey: 'sk-1234567890abcdefghijklmnop',
+  awsKey: 'AKIAIOSFODNN7EXAMPLE',
   port: 3000,
 };
`;

const AWS_SECRET_DIFF = `diff --git a/src/aws.ts b/src/aws.ts
index abc123..def456 100644
--- a/src/aws.ts
+++ b/src/aws.ts
@@ -1,3 +1,4 @@
+const AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
 export const s3Client = new S3();
`;

const PRIVATE_KEY_DIFF = `diff --git a/src/keys.ts b/src/keys.ts
index abc123..def456 100644
--- a/src/keys.ts
+++ b/src/keys.ts
@@ -1,2 +1,4 @@
+const privateKey = \`-----BEGIN RSA PRIVATE KEY-----
+MIIEpAIBAAKCAQEA...
+-----END RSA PRIVATE KEY-----\`;
`;

const GITHUB_TOKEN_DIFF = `diff --git a/src/github.ts b/src/github.ts
index abc123..def456 100644
--- a/src/github.ts
+++ b/src/github.ts
@@ -1,2 +1,3 @@
+const token = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
 export const octokit = new Octokit();
`;

const PACKAGE_JSON_DIFF = `diff --git a/package.json b/package.json
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

const MULTIPLE_FILES_DIFF = `diff --git a/src/a.ts b/src/a.ts
index abc123..def456 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1,2 @@
 export const a = 1;
+export const a2 = 2;
diff --git a/src/b.ts b/src/b.ts
index abc123..def456 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1,2 @@
 export const b = 1;
+export const b2 = 2;
`;

describe('parseDiff', () => {
  describe('simple modifications', () => {
    test('parses single file modification', () => {
      const result = parseDiff(SIMPLE_DIFF);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/app.ts');
      expect(result.files[0].additions).toBe(1);
      expect(result.files[0].deletions).toBe(0);
      expect(result.files[0].isNew).toBe(false);
      expect(result.files[0].isDeleted).toBe(false);
    });

    test('parses multiple file modifications', () => {
      const result = parseDiff(MULTIPLE_FILES_DIFF);
      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe('src/a.ts');
      expect(result.files[1].path).toBe('src/b.ts');
    });
  });

  describe('new files', () => {
    test('detects new file', () => {
      const result = parseDiff(NEW_FILE_DIFF);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/new-file.ts');
      expect(result.files[0].isNew).toBe(true);
      expect(result.files[0].additions).toBe(3);
    });
  });

  describe('deleted files', () => {
    test('detects deleted file', () => {
      const result = parseDiff(DELETED_FILE_DIFF);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/old-file.ts');
      expect(result.files[0].isDeleted).toBe(true);
      expect(result.files[0].deletions).toBe(3);
    });
  });

  describe('renames', () => {
    test('detects renamed file', () => {
      const result = parseDiff(RENAME_DIFF);
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/new-name.ts');
      expect(result.files[0].oldPath).toBe('src/old-name.ts');
      expect(result.files[0].isRename).toBe(true);
    });
  });
});

describe('extractTouchedFiles', () => {
  test('extracts file paths from simple diff', () => {
    const files = extractTouchedFiles(SIMPLE_DIFF);
    expect(files).toEqual(['src/app.ts']);
  });

  test('extracts multiple file paths', () => {
    const files = extractTouchedFiles(MULTIPLE_FILES_DIFF);
    expect(files).toContain('src/a.ts');
    expect(files).toContain('src/b.ts');
    expect(files).toHaveLength(2);
  });

  test('includes both old and new paths for renames', () => {
    const files = extractTouchedFiles(RENAME_DIFF);
    expect(files).toContain('src/old-name.ts');
    expect(files).toContain('src/new-name.ts');
  });
});

describe('evaluatePolicy', () => {
  describe('frozen files', () => {
    test('blocks modification of frozen CI file', () => {
      const result = evaluatePolicy(FROZEN_FILE_DIFF);
      expect(result.hasBlockingViolations).toBe(true);
      // At least one frozen file violation
      const frozenViolations = result.violations.filter(v => v.rule === 'frozen_file');
      expect(frozenViolations.length).toBeGreaterThanOrEqual(1);
      expect(frozenViolations[0].severity).toBe('BLOCK');
      expect(frozenViolations[0].file).toBe('.github/workflows/ci.yml');
    });

    test('allows non-frozen files', () => {
      const result = evaluatePolicy(SIMPLE_DIFF);
      expect(result.violations.filter(v => v.rule === 'frozen_file')).toHaveLength(0);
    });

    test('uses custom frozen files list', () => {
      const config = createPolicyConfig({
        frozenFiles: ['src/app.ts'],
        denyGlobs: [],
        secretPatterns: [],
        dependencyFiles: [],
      });
      const result = evaluatePolicy(SIMPLE_DIFF, config);
      expect(result.hasBlockingViolations).toBe(true);
      expect(result.violations[0].rule).toBe('frozen_file');
    });
  });

  describe('deny globs', () => {
    test('blocks .env files', () => {
      const result = evaluatePolicy(ENV_FILE_DIFF);
      expect(result.hasBlockingViolations).toBe(true);
      const violation = result.violations.find(v => v.rule === 'deny_glob');
      expect(violation).toBeDefined();
      expect(violation!.file).toBe('.env.local');
    });

    test('allows normal files', () => {
      const result = evaluatePolicy(SIMPLE_DIFF);
      expect(result.violations.filter(v => v.rule === 'deny_glob')).toHaveLength(0);
    });
  });

  describe('secret detection', () => {
    test('detects API keys', () => {
      const result = evaluatePolicy(SECRET_DIFF);
      expect(result.hasBlockingViolations).toBe(true);
      const secrets = result.violations.filter(v => v.rule === 'secret_detected');
      expect(secrets.length).toBeGreaterThan(0);
    });

    test('detects AWS credentials', () => {
      const result = evaluatePolicy(AWS_SECRET_DIFF);
      expect(result.hasBlockingViolations).toBe(true);
      const secrets = result.violations.filter(v => v.rule === 'secret_detected');
      expect(secrets.length).toBeGreaterThan(0);
    });

    test('detects private keys', () => {
      const result = evaluatePolicy(PRIVATE_KEY_DIFF);
      expect(result.hasBlockingViolations).toBe(true);
      const secrets = result.violations.filter(v => v.rule === 'secret_detected');
      expect(secrets.length).toBeGreaterThan(0);
    });

    test('detects GitHub tokens', () => {
      const result = evaluatePolicy(GITHUB_TOKEN_DIFF);
      expect(result.hasBlockingViolations).toBe(true);
      const secrets = result.violations.filter(v => v.rule === 'secret_detected');
      expect(secrets.length).toBeGreaterThan(0);
    });

    test('no false positives on normal code', () => {
      const result = evaluatePolicy(SIMPLE_DIFF);
      expect(result.violations.filter(v => v.rule === 'secret_detected')).toHaveLength(0);
    });
  });

  describe('dependency changes', () => {
    test('blocks dependency file changes by default', () => {
      const result = evaluatePolicy(PACKAGE_JSON_DIFF);
      expect(result.hasBlockingViolations).toBe(true);
      const depViolation = result.violations.find(v => v.rule === 'dependency_change');
      expect(depViolation).toBeDefined();
      expect(depViolation!.file).toBe('package.json');
    });

    test('warns on dependency changes when allowed', () => {
      const config = createPolicyConfig({
        allowDependencyChanges: true,
      });
      const result = evaluatePolicy(PACKAGE_JSON_DIFF, config);
      expect(result.hasBlockingViolations).toBe(false);
      const depViolation = result.violations.find(v => v.rule === 'dependency_change');
      expect(depViolation).toBeDefined();
      expect(depViolation!.severity).toBe('WARN');
    });
  });

  describe('summary', () => {
    test('reports FAILED for blocking violations', () => {
      const result = evaluatePolicy(FROZEN_FILE_DIFF);
      expect(result.summary).toContain('FAILED');
    });

    test('reports PASSED with warnings for non-blocking violations', () => {
      const config = createPolicyConfig({
        frozenFiles: [],
        denyGlobs: [],
        secretPatterns: [],
        allowDependencyChanges: true,
      });
      const result = evaluatePolicy(PACKAGE_JSON_DIFF, config);
      expect(result.summary).toContain('PASSED');
      expect(result.summary).toContain('warning');
    });

    test('reports PASSED with no violations for clean diff', () => {
      const config = createPolicyConfig({
        frozenFiles: [],
        denyGlobs: [],
        secretPatterns: [],
        dependencyFiles: [],
      });
      const result = evaluatePolicy(SIMPLE_DIFF, config);
      expect(result.summary).toContain('PASSED');
      expect(result.summary).toContain('no violations');
    });
  });
});

describe('createPolicyConfig', () => {
  test('returns default config when no overrides', () => {
    const config = createPolicyConfig();
    expect(config.frozenFiles).toEqual(DEFAULT_POLICY_CONFIG.frozenFiles);
    expect(config.denyGlobs).toEqual(DEFAULT_POLICY_CONFIG.denyGlobs);
    expect(config.allowDependencyChanges).toBe(false);
  });

  test('overrides specific fields', () => {
    const config = createPolicyConfig({
      frozenFiles: ['custom.txt'],
      allowDependencyChanges: true,
    });
    expect(config.frozenFiles).toEqual(['custom.txt']);
    expect(config.allowDependencyChanges).toBe(true);
    expect(config.denyGlobs).toEqual(DEFAULT_POLICY_CONFIG.denyGlobs);
  });
});

describe('DEFAULT_POLICY_CONFIG', () => {
  test('has expected frozen files', () => {
    expect(DEFAULT_POLICY_CONFIG.frozenFiles).toContain('.github/workflows/ci.yml');
    expect(DEFAULT_POLICY_CONFIG.frozenFiles).toContain('LICENSE');
  });

  test('has expected deny globs', () => {
    expect(DEFAULT_POLICY_CONFIG.denyGlobs).toContain('.env*');
    expect(DEFAULT_POLICY_CONFIG.denyGlobs).toContain('*.pem');
  });

  test('has expected dependency files', () => {
    expect(DEFAULT_POLICY_CONFIG.dependencyFiles).toContain('package.json');
    expect(DEFAULT_POLICY_CONFIG.dependencyFiles).toContain('package-lock.json');
  });

  test('blocks dependency changes by default', () => {
    expect(DEFAULT_POLICY_CONFIG.allowDependencyChanges).toBe(false);
  });
});
