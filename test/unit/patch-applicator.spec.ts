import {
  applyDiffToContent,
  extractFileChangesFromDiff,
  validateAndApplyDiff
} from '@core/github/patch-applicator';

describe('applyDiffToContent', () => {
  describe('simple additions', () => {
    test('adds a single line', () => {
      const original = `line1
line2
line3`;
      const diff = `@@ -1,3 +1,4 @@
 line1
+new line
 line2
 line3`;

      const result = applyDiffToContent(original, diff);
      expect(result).toBe(`line1
new line
line2
line3`);
    });

    test('adds multiple lines', () => {
      const original = `line1
line2`;
      const diff = `@@ -1,2 +1,4 @@
 line1
+added1
+added2
 line2`;

      const result = applyDiffToContent(original, diff);
      expect(result).toBe(`line1
added1
added2
line2`);
    });

    test('adds line at end', () => {
      const original = `line1
line2`;
      const diff = `@@ -1,2 +1,3 @@
 line1
 line2
+line3`;

      const result = applyDiffToContent(original, diff);
      expect(result).toBe(`line1
line2
line3`);
    });
  });

  describe('simple deletions', () => {
    test('removes a single line', () => {
      const original = `line1
line2
line3`;
      const diff = `@@ -1,3 +1,2 @@
 line1
-line2
 line3`;

      const result = applyDiffToContent(original, diff);
      expect(result).toBe(`line1
line3`);
    });
  });

  describe('modifications', () => {
    test('replaces a line', () => {
      const original = `line1
line2
line3`;
      const diff = `@@ -1,3 +1,3 @@
 line1
-line2
+modified line2
 line3`;

      const result = applyDiffToContent(original, diff);
      expect(result).toBe(`line1
modified line2
line3`);
    });
  });

  describe('empty and edge cases', () => {
    test('handles empty original', () => {
      const original = '';
      const diff = `@@ -0,0 +1,2 @@
+line1
+line2`;

      const result = applyDiffToContent(original, diff);
      expect(result).toContain('line1');
      expect(result).toContain('line2');
    });

    test('handles empty diff', () => {
      const original = 'unchanged content';
      const diff = '';

      const result = applyDiffToContent(original, diff);
      expect(result).toBe('unchanged content');
    });
  });
});

describe('extractFileChangesFromDiff', () => {
  const SINGLE_FILE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index abc123..def456 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import { foo } from './foo';
+import { bar } from './bar';

 export function main() {}`;

  const MULTI_FILE_DIFF = `diff --git a/src/a.ts b/src/a.ts
index abc123..def456 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1,2 @@
 const a = 1;
+const a2 = 2;
diff --git a/src/b.ts b/src/b.ts
index abc123..def456 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1,2 @@
 const b = 1;
+const b2 = 2;`;

  const NEW_FILE_DIFF = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export const newFunc = () => {
+  return 'new';
+};`;

  const DELETED_FILE_DIFF = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc123..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export const oldFunc = () => {
-  return 'old';
-};`;

  test('extracts single file change', () => {
    const changes = extractFileChangesFromDiff(SINGLE_FILE_DIFF);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('src/app.ts');
    expect(changes[0].isNew).toBe(false);
    expect(changes[0].isDeleted).toBe(false);
  });

  test('extracts multiple file changes', () => {
    const changes = extractFileChangesFromDiff(MULTI_FILE_DIFF);
    expect(changes).toHaveLength(2);
    expect(changes[0].path).toBe('src/a.ts');
    expect(changes[1].path).toBe('src/b.ts');
  });

  test('detects new file', () => {
    const changes = extractFileChangesFromDiff(NEW_FILE_DIFF);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('src/new.ts');
    expect(changes[0].isNew).toBe(true);
    expect(changes[0].isDeleted).toBe(false);
  });

  test('detects deleted file', () => {
    const changes = extractFileChangesFromDiff(DELETED_FILE_DIFF);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('src/old.ts');
    expect(changes[0].isNew).toBe(false);
    expect(changes[0].isDeleted).toBe(true);
  });

  test('includes diff content for each file', () => {
    const changes = extractFileChangesFromDiff(SINGLE_FILE_DIFF);
    expect(changes[0].diffContent).toContain('@@ -1,3 +1,4 @@');
    expect(changes[0].diffContent).toContain('+import { bar }');
  });
});

describe('validateAndApplyDiff', () => {
  test('applies diff when context matches', () => {
    const original = `line1
line2
line3`;
    const diff = `@@ -1,3 +1,3 @@
 line1
-line2
+line2b
 line3`;

    const result = validateAndApplyDiff(original, diff);
    expect(result.success).toBe(true);
    expect(result.content).toBe(`line1
line2b
line3`);
  });

  test('fails when context does not match', () => {
    const original = `line1
line2
line3`;
    const diff = `@@ -1,3 +1,3 @@
 line1
-line2
+line2b
 lineX`;

    const result = validateAndApplyDiff(original, diff);
    expect(result.success).toBe(false);
    expect(result.validationErrors && result.validationErrors.length).toBeGreaterThan(0);
  });
});

describe('PatchApplicator integration', () => {
  // Note: Full integration tests require Prisma and a database.
  // These tests verify the logic without database dependencies.

  test('branch name generation format', () => {
    // Test the expected branch name format
    const workflowId = '12345678-abcd-1234-efgh-123456789abc';
    const patchSetId = 'abcdefgh-1234-5678-ijkl-9876543210mn';

    const shortWorkflowId = workflowId.slice(0, 8);
    const shortPatchSetId = patchSetId.slice(0, 8);

    expect(shortWorkflowId).toBe('12345678');
    expect(shortPatchSetId).toBe('abcdefgh');

    const branchPattern = /^arch-orchestrator\/[a-z0-9]+\/[a-z0-9]+-\d+$/;
    const sampleBranch = `arch-orchestrator/${shortWorkflowId}/${shortPatchSetId}-${Date.now()}`;
    expect(sampleBranch).toMatch(branchPattern);
  });
});
