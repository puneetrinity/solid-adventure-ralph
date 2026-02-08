/**
 * Computes a stable SHA256 hash of the input data.
 *
 * Stability guarantees:
 * - Object keys are sorted alphabetically (deep)
 * - Arrays maintain order
 * - undefined values are omitted
 * - Same input always produces same hash
 */
export declare function computeContextHash(data: unknown): string;
/**
 * Canonicalizes data for hashing:
 * - Sorts object keys alphabetically (recursive)
 * - Removes undefined values
 * - Preserves array order
 */
export declare function canonicalizeForHash(data: unknown): unknown;
