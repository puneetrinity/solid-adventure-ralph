/**
 * Diagnoser
 *
 * LLM-based failure diagnosis service.
 */
import { FailureContext, DiagnosisResult, DiagnosisConfig } from './types';
import type { LLMRunner } from '../llm';
export declare class Diagnoser {
    private readonly runner?;
    private readonly config;
    constructor(runner?: LLMRunner | undefined, config?: Partial<DiagnosisConfig>);
    private get diagnosisTimeoutMs();
    /**
     * Diagnose a failure and identify root cause.
     */
    diagnose(context: FailureContext): Promise<DiagnosisResult>;
    /**
     * Diagnose using LLM for deep analysis.
     */
    private diagnoseWithLLM;
    /**
     * Build diagnosis prompt for LLM.
     */
    private buildDiagnosisPrompt;
    /**
     * Diagnose using pattern-matching heuristics.
     */
    private diagnoseWithHeuristics;
    /**
     * Identify root cause from failure context.
     */
    private identifyRootCause;
    /**
     * Identify potential fixes for the failure.
     */
    private identifyPotentialFixes;
    /**
     * Generate detailed analysis text.
     */
    private generateAnalysis;
    /**
     * Generate a one-line summary.
     */
    private generateSummary;
    /**
     * Find related patterns from event history.
     */
    private findRelatedPatterns;
    /**
     * Generate prevention recommendations.
     */
    private generatePreventionRecommendations;
}
/**
 * Create a diagnoser instance.
 */
export declare function createDiagnoser(runner?: LLMRunner, config?: Partial<DiagnosisConfig>): Diagnoser;
