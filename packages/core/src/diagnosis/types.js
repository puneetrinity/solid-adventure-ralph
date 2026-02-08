"use strict";
/**
 * Diagnosis Types
 *
 * Types for the self-diagnosis and failure analysis system.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DIAGNOSIS_CONFIG = void 0;
/**
 * Default diagnosis configuration.
 */
exports.DEFAULT_DIAGNOSIS_CONFIG = {
    maxEvents: 50,
    maxFiles: 20,
    diagnosisTimeoutMs: 30000,
    autoGenerateFixes: true,
    minFixConfidence: 0.7,
    persistDiagnosis: true,
};
//# sourceMappingURL=types.js.map