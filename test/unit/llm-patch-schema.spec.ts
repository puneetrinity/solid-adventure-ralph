import { PatchGenerationSchema } from '@core/llm/zod-schemas';

describe('PatchGenerationSchema', () => {
  test('rejects replace action without find/replace', () => {
    const result = PatchGenerationSchema.safeParse({
      title: 'Replace without find',
      summary: 'invalid',
      files: [
        { path: 'src/app.ts', action: 'replace' }
      ]
    });
    expect(result.success).toBe(false);
  });

  test('rejects modify action without rationale', () => {
    const result = PatchGenerationSchema.safeParse({
      title: 'Modify without rationale',
      summary: 'invalid',
      files: [
        { path: 'src/app.ts', action: 'modify', content: 'line1\nline2' }
      ]
    });
    expect(result.success).toBe(false);
  });

  test('rejects modify action over 200 lines', () => {
    const largeContent = new Array(205).fill('line').join('\n');
    const result = PatchGenerationSchema.safeParse({
      title: 'Large modify',
      summary: 'invalid',
      files: [
        {
          path: 'src/app.ts',
          action: 'modify',
          content: largeContent,
          rationale: 'Needs full rewrite'
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  test('rejects more than 5 files', () => {
    const files = new Array(6).fill(null).map((_, idx) => ({
      path: `src/file${idx}.ts`,
      action: 'create',
      content: 'export const x = 1;'
    }));
    const result = PatchGenerationSchema.safeParse({
      title: 'Too many files',
      summary: 'invalid',
      files
    });
    expect(result.success).toBe(false);
  });

  test('accepts valid replace action', () => {
    const result = PatchGenerationSchema.safeParse({
      title: 'Replace valid',
      summary: 'ok',
      files: [
        {
          path: 'src/app.ts',
          action: 'replace',
          find: 'const timeout = 5000;',
          replace: 'const timeout = 10000;'
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  test('accepts valid modify action with rationale', () => {
    const result = PatchGenerationSchema.safeParse({
      title: 'Modify valid',
      summary: 'ok',
      files: [
        {
          path: 'src/app.ts',
          action: 'modify',
          content: 'line1\nline2',
          rationale: 'Replace not possible due to multiple changes'
        }
      ]
    });
    expect(result.success).toBe(true);
  });
});
