/**
 * Artifact Generator
 *
 * Uses LLM to generate workflow artifacts (decisions, plans, etc.)
 * Replaces stub artifacts with real LLM-generated content.
 */
import type { LLMRunner, OutputSchema } from './index';
export interface ArtifactInput {
    workflowId: string;
    issueContent: string;
    repoContext?: RepoContext;
    previousArtifacts?: PreviousArtifact[];
}
export interface RepoContext {
    owner: string;
    repo: string;
    baseSha: string;
    relevantFiles?: FileSnapshot[];
}
export interface FileSnapshot {
    path: string;
    content: string;
    language?: string;
}
export interface PreviousArtifact {
    kind: string;
    content: string;
}
export interface Decision {
    recommendation: 'PROCEED' | 'DEFER' | 'REJECT' | 'CLARIFY';
    summary: string;
    rationale: string;
    concerns: string[];
    prerequisites?: string[];
    estimatedComplexity: 'trivial' | 'low' | 'medium' | 'high' | 'very_high';
}
export declare const decisionOutputSchema: OutputSchema<Decision>;
export interface Plan {
    title: string;
    overview: string;
    tasks: PlanTask[];
    dependencies: TaskDependency[];
    risks: PlanRisk[];
}
export interface PlanTask {
    id: string;
    title: string;
    description: string;
    type: 'feature' | 'bugfix' | 'refactor' | 'test' | 'docs';
    files: string[];
    acceptanceCriteria: string[];
}
export interface TaskDependency {
    taskId: string;
    dependsOn: string[];
}
export interface PlanRisk {
    description: string;
    severity: 'low' | 'medium' | 'high';
    mitigation: string;
}
export declare const planOutputSchema: OutputSchema<Plan>;
export interface GeneratorConfig {
    runner: LLMRunner;
    useFallback?: boolean;
}
export interface GenerateResult<T> {
    success: boolean;
    artifact?: T;
    markdown?: string;
    error?: string;
    metadata?: {
        promptVersion: string;
        model: string;
        latencyMs: number;
        usedFallback: boolean;
    };
}
export declare class ArtifactGenerator {
    private readonly runner;
    private readonly useFallback;
    constructor(config: GeneratorConfig);
    /**
     * Generate a Decision artifact.
     */
    generateDecision(input: ArtifactInput): Promise<GenerateResult<Decision>>;
    /**
     * Generate a Plan artifact.
     */
    generatePlan(input: ArtifactInput, decision: Decision): Promise<GenerateResult<Plan>>;
    private buildDecisionPrompt;
    private buildPlanPrompt;
    private formatDecisionMarkdown;
    private formatPlanMarkdown;
    private createFallbackDecision;
    private createFallbackPlan;
}
