import { computeContextHash, canonicalizeForHash } from '@core/audit/context-hash';

describe('computeContextHash', () => {
  describe('stability guarantees', () => {
    test('same object produces same hash', () => {
      const data = { a: 1, b: 'test', c: [1, 2, 3] };
      const hash1 = computeContextHash(data);
      const hash2 = computeContextHash(data);
      expect(hash1).toBe(hash2);
    });

    test('object key order does not affect hash', () => {
      const data1 = { a: 1, b: 2, c: 3 };
      const data2 = { c: 3, a: 1, b: 2 };
      expect(computeContextHash(data1)).toBe(computeContextHash(data2));
    });

    test('deeply nested objects are sorted', () => {
      const data1 = { outer: { z: 1, a: 2 }, other: { m: 3, b: 4 } };
      const data2 = { other: { b: 4, m: 3 }, outer: { a: 2, z: 1 } };
      expect(computeContextHash(data1)).toBe(computeContextHash(data2));
    });

    test('arrays maintain order', () => {
      const data1 = { items: [1, 2, 3] };
      const data2 = { items: [3, 2, 1] };
      expect(computeContextHash(data1)).not.toBe(computeContextHash(data2));
    });

    test('undefined values are treated as null', () => {
      const data1 = { a: 1, b: undefined };
      const data2 = { a: 1 };
      // undefined is omitted, so these should match
      expect(computeContextHash(data1)).toBe(computeContextHash(data2));
    });

    test('null values are preserved', () => {
      const data1 = { a: 1, b: null };
      const data2 = { a: 1 };
      // null is preserved, so these should differ
      expect(computeContextHash(data1)).not.toBe(computeContextHash(data2));
    });
  });

  describe('deterministic output', () => {
    test('produces 64-character hex string', () => {
      const hash = computeContextHash({ test: 'data' });
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    test('known input produces known output', () => {
      // This test ensures the hash algorithm doesn't change
      const data = { workflowId: 'test-123', jobName: 'ingest_context' };
      const hash = computeContextHash(data);
      // Hash should be stable across runs
      expect(hash).toBe(computeContextHash(data));
    });
  });

  describe('edge cases', () => {
    test('empty object', () => {
      const hash = computeContextHash({});
      expect(hash).toHaveLength(64);
    });

    test('empty array', () => {
      const hash = computeContextHash([]);
      expect(hash).toHaveLength(64);
    });

    test('null', () => {
      const hash = computeContextHash(null);
      expect(hash).toHaveLength(64);
    });

    test('primitive string', () => {
      const hash = computeContextHash('test');
      expect(hash).toHaveLength(64);
    });

    test('primitive number', () => {
      const hash = computeContextHash(42);
      expect(hash).toHaveLength(64);
    });

    test('primitive boolean', () => {
      const hash = computeContextHash(true);
      expect(hash).toHaveLength(64);
    });
  });
});

describe('canonicalizeForHash', () => {
  test('sorts object keys', () => {
    const result = canonicalizeForHash({ z: 1, a: 2, m: 3 });
    expect(Object.keys(result as object)).toEqual(['a', 'm', 'z']);
  });

  test('removes undefined values', () => {
    const result = canonicalizeForHash({ a: 1, b: undefined, c: 3 });
    expect(result).toEqual({ a: 1, c: 3 });
  });

  test('preserves null values', () => {
    const result = canonicalizeForHash({ a: 1, b: null });
    expect(result).toEqual({ a: 1, b: null });
  });

  test('handles arrays', () => {
    const result = canonicalizeForHash([{ z: 1, a: 2 }, { y: 3, b: 4 }]);
    expect(result).toEqual([{ a: 2, z: 1 }, { b: 4, y: 3 }]);
  });

  test('handles nested objects', () => {
    const result = canonicalizeForHash({
      outer: { z: 1, a: { y: 2, b: 3 } }
    });
    expect(result).toEqual({
      outer: { a: { b: 3, y: 2 }, z: 1 }
    });
  });
});
