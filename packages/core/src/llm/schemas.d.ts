/**
 * Output Schemas
 *
 * Strict JSON schemas for LLM outputs with validation.
 */
import type { OutputSchema, ValidationResult, JSONSchema } from './types';
/**
 * Validate data against a JSON schema.
 */
export declare function validateSchema<T>(data: unknown, schema: JSONSchema, path?: string): ValidationResult<T>;
/**
 * Parse JSON from raw LLM output, handling markdown code blocks.
 */
export declare function parseJSON<T>(rawContent: string): T | null;
/**
 * Task decomposition schema for architect role.
 */
export interface TaskDecomposition {
    summary: string;
    tasks: Array<{
        id: string;
        title: string;
        description: string;
        dependencies: string[];
        estimatedComplexity: 'low' | 'medium' | 'high';
    }>;
    risks: Array<{
        description: string;
        mitigation: string;
        severity: 'low' | 'medium' | 'high';
    }>;
}
export declare const taskDecompositionSchema: OutputSchema<TaskDecomposition>;
/**
 * Code generation schema for coder role.
 */
export interface CodeGeneration {
    files: Array<{
        path: string;
        content: string;
        action: 'create' | 'modify' | 'delete';
        diff?: string;
    }>;
    explanation: string;
    testSuggestions?: string[];
}
export declare const codeGenerationSchema: OutputSchema<CodeGeneration>;
/**
 * Code review schema for reviewer role.
 */
export interface CodeReview {
    summary: string;
    approved: boolean;
    issues: Array<{
        severity: 'critical' | 'major' | 'minor' | 'suggestion';
        file: string;
        line?: number;
        message: string;
        suggestedFix?: string;
    }>;
    strengths?: string[];
}
export declare const codeReviewSchema: OutputSchema<CodeReview>;
/**
 * Diagnosis schema for diagnoser role.
 */
export interface Diagnosis {
    summary: string;
    rootCause: {
        description: string;
        confidence: 'high' | 'medium' | 'low';
        evidence: string[];
    };
    suggestedFixes: Array<{
        description: string;
        priority: number;
        effort: 'trivial' | 'small' | 'medium' | 'large';
    }>;
    relatedIssues?: string[];
}
export declare const diagnosisSchema: OutputSchema<Diagnosis>;
/**
 * Get a schema by name.
 */
export declare function getSchema<T>(name: string): OutputSchema<T> | undefined;
/**
 * Register a custom schema.
 */
export declare function registerSchema<T>(schema: OutputSchema<T>): void;
/**
 * List all registered schemas.
 */
export declare function listSchemas(): string[];
