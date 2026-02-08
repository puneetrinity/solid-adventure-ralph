"use strict";
/**
 * Memory Types
 *
 * Core types for tiered memory management.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_CONFIGS = exports.DEFAULT_LOAD_OPTIONS = void 0;
/**
 * Default loading options.
 */
exports.DEFAULT_LOAD_OPTIONS = {
    maxTokens: 50000,
    includeTiers: ['HOT', 'WARM'],
    includeRelatedWorkflows: false,
    maxRelatedWorkflows: 3
};
/**
 * Default tier configurations.
 */
exports.TIER_CONFIGS = {
    HOT: {
        tier: 'HOT',
        maxTokens: 30000,
        priority: 1,
        ttlHours: 24,
        autoLoad: true
    },
    WARM: {
        tier: 'WARM',
        maxTokens: 15000,
        priority: 2,
        ttlHours: 168, // 1 week
        autoLoad: false
    },
    COLD: {
        tier: 'COLD',
        maxTokens: 5000,
        priority: 3,
        ttlHours: 8760, // 1 year
        autoLoad: false
    }
};
//# sourceMappingURL=types.js.map