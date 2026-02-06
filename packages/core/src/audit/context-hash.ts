import { createHash } from 'crypto';

/**
 * Computes a stable SHA256 hash of the input data.
 *
 * Stability guarantees:
 * - Object keys are sorted alphabetically (deep)
 * - Arrays maintain order
 * - undefined values are omitted
 * - Same input always produces same hash
 */
export function computeContextHash(data: unknown): string {
  const canonical = canonicalizeForHash(data);
  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Canonicalizes data for hashing:
 * - Sorts object keys alphabetically (recursive)
 * - Removes undefined values
 * - Preserves array order
 */
export function canonicalizeForHash(data: unknown): unknown {
  if (data === null || data === undefined) {
    return null;
  }

  if (Array.isArray(data)) {
    return data.map(canonicalizeForHash);
  }

  if (typeof data === 'object' && data !== null) {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(data).sort();
    for (const key of keys) {
      const value = (data as Record<string, unknown>)[key];
      if (value !== undefined) {
        sorted[key] = canonicalizeForHash(value);
      }
    }
    return sorted;
  }

  // Primitive values (string, number, boolean)
  return data;
}
