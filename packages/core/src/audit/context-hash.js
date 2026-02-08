"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeContextHash = computeContextHash;
exports.canonicalizeForHash = canonicalizeForHash;
const crypto_1 = require("crypto");
/**
 * Computes a stable SHA256 hash of the input data.
 *
 * Stability guarantees:
 * - Object keys are sorted alphabetically (deep)
 * - Arrays maintain order
 * - undefined values are omitted
 * - Same input always produces same hash
 */
function computeContextHash(data) {
    const canonical = canonicalizeForHash(data);
    const json = JSON.stringify(canonical);
    return (0, crypto_1.createHash)('sha256').update(json, 'utf8').digest('hex');
}
/**
 * Canonicalizes data for hashing:
 * - Sorts object keys alphabetically (recursive)
 * - Removes undefined values
 * - Preserves array order
 */
function canonicalizeForHash(data) {
    if (data === null || data === undefined) {
        return null;
    }
    if (Array.isArray(data)) {
        return data.map(canonicalizeForHash);
    }
    if (typeof data === 'object' && data !== null) {
        const sorted = {};
        const keys = Object.keys(data).sort();
        for (const key of keys) {
            const value = data[key];
            if (value !== undefined) {
                sorted[key] = canonicalizeForHash(value);
            }
        }
        return sorted;
    }
    // Primitive values (string, number, boolean)
    return data;
}
//# sourceMappingURL=context-hash.js.map