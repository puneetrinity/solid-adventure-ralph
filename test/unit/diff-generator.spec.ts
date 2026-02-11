import {
  generateUnifiedDiff,
  generateReplaceActionDiff,
  validateDiffContext
} from '@core/github/diff-generator';

describe('generateUnifiedDiff', () => {
  test('modify produces minimal hunks with context', () => {
    const oldContent = ['line1', 'line2', 'line3'].join('\n');
    const newContent = ['line1', 'line2b', 'line3'].join('\n');

    const result = generateUnifiedDiff('src/app.ts', oldContent, newContent, 'modify', { contextLines: 1 });

    expect(result.patch).toContain('diff --git a/src/app.ts b/src/app.ts');
    expect(result.patch).toContain('@@');
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.hunks).toBe(1);
  });

  test('create generates new file diff', () => {
    const newContent = ['export const ok = true;', ''].join('\n');
    const result = generateUnifiedDiff('src/new.ts', '', newContent, 'create', { contextLines: 3 });

    expect(result.patch).toContain('new file mode 100644');
    expect(result.patch).toContain('--- /dev/null');
    expect(result.patch).toContain('+++ b/src/new.ts');
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(0);
  });

  test('delete generates deleted file diff', () => {
    const oldContent = ['line1', 'line2'].join('\n');
    const result = generateUnifiedDiff('src/old.ts', oldContent, '', 'delete', { contextLines: 3 });

    expect(result.patch).toContain('deleted file mode 100644');
    expect(result.patch).toContain('+++ /dev/null');
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(2);
  });
});

describe('generateReplaceActionDiff', () => {
  test('returns error when find string is not found (0 matches)', () => {
    const result = generateReplaceActionDiff(
      'src/config.ts',
      'const timeout = 5000;',
      'timeout = 3000', // doesn't exist
      'timeout = 10000'
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('not found');
      expect(result.error).toContain('src/config.ts');
    }
  });

  test('returns error when find string matches multiple times (>1 matches)', () => {
    const original = ['foo', 'foo', 'bar'].join('\n');
    const result = generateReplaceActionDiff(
      'src/config.ts',
      original,
      'foo',
      'baz'
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('matches 2 times');
      expect(result.error).toContain('exactly once');
    }
  });

  test('generates diff when find string matches exactly once', () => {
    const original = 'const timeout = 5000;';
    const result = generateReplaceActionDiff(
      'src/config.ts',
      original,
      'timeout = 5000',
      'timeout = 10000'
    );

    expect('error' in result).toBe(false);
    if ('diff' in result) {
      expect(result.diff.additions).toBe(1);
      expect(result.diff.deletions).toBe(1);
      expect(result.diff.patch).toContain('diff --git a/src/config.ts b/src/config.ts');
      expect(result.newContent).toBe('const timeout = 10000;');
    }
  });

  test('handles multi-line find/replace', () => {
    const original = [
      'function hello() {',
      '  return "world";',
      '}'
    ].join('\n');

    const find = 'return "world";';
    const replace = 'return "universe";';

    const result = generateReplaceActionDiff('src/hello.ts', original, find, replace);

    expect('error' in result).toBe(false);
    if ('diff' in result) {
      expect(result.newContent).toContain('return "universe";');
      expect(result.diff.additions).toBeGreaterThan(0);
    }
  });
});

describe('validateDiffContext', () => {
  test('returns valid for matching context lines', () => {
    const original = ['line1', 'line2', 'line3'].join('\n');
    const diff = [
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2b',
      ' line3'
    ].join('\n');

    const result = validateDiffContext(original, diff);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns errors for mismatched context lines', () => {
    const original = ['line1', 'line2', 'line3'].join('\n');
    const diff = [
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-line2',
      '+line2b',
      ' lineX'
    ].join('\n');

    const result = validateDiffContext(original, diff);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
