import { PatchApplicator, validateAndApplyDiff, extractFileChangesFromDiff } from '@core/github/patch-applicator';

describe('validateAndApplyDiff', () => {
  test('returns success for matching diff', () => {
    const original = ['line1', 'line2', 'line3'].join('\n');
    const diff = [
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2b',
      ' line3'
    ].join('\n');

    const result = validateAndApplyDiff(original, diff);
    expect(result.success).toBe(true);
    expect(result.content).toContain('line2b');
  });

  test('returns error for mismatched context', () => {
    const original = ['line1', 'line2', 'line3'].join('\n');
    const diff = [
      '@@ -1,3 +1,3 @@',
      ' lineX', // Wrong context
      '-line2',
      '+line2b',
      ' line3'
    ].join('\n');

    const result = validateAndApplyDiff(original, diff);
    expect(result.success).toBe(false);
    expect(result.error).toContain('context lines do not match');
    expect(result.validationErrors).toBeDefined();
    expect(result.validationErrors!.length).toBeGreaterThan(0);
  });

  test('skips validation when option is set', () => {
    const original = ['line1', 'line2', 'line3'].join('\n');
    const diff = [
      '@@ -1,3 +1,3 @@',
      ' lineX', // Wrong context, but we skip validation
      '-line2',
      '+line2b',
      ' line3'
    ].join('\n');

    const result = validateAndApplyDiff(original, diff, { skipValidation: true });
    expect(result.success).toBe(true);
  });

  test('handles empty diff', () => {
    const original = 'unchanged content';
    const result = validateAndApplyDiff(original, '');
    expect(result.success).toBe(true);
    expect(result.content).toBe(original);
  });
});

describe('extractFileChangesFromDiff', () => {
  test('extracts new file', () => {
    const diff = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      'index 0000000..abcdef1',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1,2 @@',
      '+export const ok = true;',
      '+'
    ].join('\n');

    const files = extractFileChangesFromDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/new.ts');
    expect(files[0].isNew).toBe(true);
    expect(files[0].isDeleted).toBe(false);
  });

  test('extracts modified file', () => {
    const diff = [
      'diff --git a/src/app.ts b/src/app.ts',
      'index abcdef1..1234567',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2b',
      ' line3'
    ].join('\n');

    const files = extractFileChangesFromDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/app.ts');
    expect(files[0].isNew).toBe(false);
    expect(files[0].isDeleted).toBe(false);
  });

  test('extracts deleted file', () => {
    const diff = [
      'diff --git a/src/old.ts b/src/old.ts',
      'deleted file mode 100644',
      'index abcdef1..0000000',
      '--- a/src/old.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-line1',
      '-line2'
    ].join('\n');

    const files = extractFileChangesFromDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/old.ts');
    expect(files[0].isNew).toBe(false);
    expect(files[0].isDeleted).toBe(true);
  });

  test('extracts multiple files', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index abc..def',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/src/b.ts b/src/b.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/src/b.ts',
      '@@ -0,0 +1 @@',
      '+content'
    ].join('\n');

    const files = extractFileChangesFromDiff(diff);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/a.ts');
    expect(files[0].isNew).toBe(false);
    expect(files[1].path).toBe('src/b.ts');
    expect(files[1].isNew).toBe(true);
  });
});

describe('PatchApplicator.validatePatches', () => {
  const mockPrisma = {
    patchSet: {
      findUnique: jest.fn()
    }
  };

  const mockWriteGate = {
    getFileContents: jest.fn()
  };

  let applicator: PatchApplicator;

  beforeEach(() => {
    jest.clearAllMocks();
    applicator = new PatchApplicator(mockPrisma as any, mockWriteGate as any);
  });

  test('returns valid=false when patchSet not found', async () => {
    mockPrisma.patchSet.findUnique.mockResolvedValue(null);

    const result = await applicator.validatePatches({
      patchSetId: 'ps-123',
      owner: 'test',
      repo: 'repo',
      ref: 'abc123'
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('not found');
  });

  test('returns valid=true for new file patches', async () => {
    const newFileDiff = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1 @@',
      '+export const x = 1;'
    ].join('\n');

    mockPrisma.patchSet.findUnique.mockResolvedValue({
      id: 'ps-123',
      baseSha: 'abc123',
      patches: [{
        id: 'p-1',
        title: 'Add new file',
        summary: 'test',
        diff: newFileDiff
      }]
    });

    const result = await applicator.validatePatches({
      patchSetId: 'ps-123',
      owner: 'test',
      repo: 'repo',
      ref: 'abc123'
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns valid=false when modified file has context mismatch', async () => {
    const modifyDiff = [
      'diff --git a/src/app.ts b/src/app.ts',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2b',
      ' line3'
    ].join('\n');

    mockPrisma.patchSet.findUnique.mockResolvedValue({
      id: 'ps-123',
      baseSha: 'abc123',
      patches: [{
        id: 'p-1',
        title: 'Modify file',
        summary: 'test',
        diff: modifyDiff
      }]
    });

    // File content doesn't match the diff context
    mockWriteGate.getFileContents.mockResolvedValue({
      content: ['lineX', 'line2', 'lineY'].join('\n'),
      sha: 'filesha'
    });

    const result = await applicator.validatePatches({
      patchSetId: 'ps-123',
      owner: 'test',
      repo: 'repo',
      ref: 'abc123'
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].file).toBe('src/app.ts');
    expect(result.errors[0].error).toContain('context lines do not match');
  });

  test('returns valid=true when context matches', async () => {
    const modifyDiff = [
      'diff --git a/src/app.ts b/src/app.ts',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2b',
      ' line3'
    ].join('\n');

    mockPrisma.patchSet.findUnique.mockResolvedValue({
      id: 'ps-123',
      baseSha: 'abc123',
      patches: [{
        id: 'p-1',
        title: 'Modify file',
        summary: 'test',
        diff: modifyDiff
      }]
    });

    // File content matches the diff context
    mockWriteGate.getFileContents.mockResolvedValue({
      content: ['line1', 'line2', 'line3'].join('\n'),
      sha: 'filesha'
    });

    const result = await applicator.validatePatches({
      patchSetId: 'ps-123',
      owner: 'test',
      repo: 'repo',
      ref: 'abc123'
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns error when file to delete is not found', async () => {
    const deleteDiff = [
      'diff --git a/src/old.ts b/src/old.ts',
      'deleted file mode 100644',
      '--- a/src/old.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-content'
    ].join('\n');

    mockPrisma.patchSet.findUnique.mockResolvedValue({
      id: 'ps-123',
      baseSha: 'abc123',
      patches: [{
        id: 'p-1',
        title: 'Delete file',
        summary: 'test',
        diff: deleteDiff
      }]
    });

    mockWriteGate.getFileContents.mockRejectedValue(new Error('Not found'));

    const result = await applicator.validatePatches({
      patchSetId: 'ps-123',
      owner: 'test',
      repo: 'repo',
      ref: 'abc123'
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].error).toContain('File to be deleted not found');
  });
});
