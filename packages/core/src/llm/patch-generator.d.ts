/**
 * Patch Generator
 *
 * Uses LLM to generate code patches based on tasks.
 * Replaces stub patches with real LLM-generated diffs.
 */
import type { LLMRunner, OutputSchema } from './index';
import type { Plan, PlanTask } from './artifact-generator';
export interface PatchInput {
    workflowId: string;
    task: PlanTask;
    plan: Plan;
    repoContext: PatchRepoContext;
}
export interface PatchRepoContext {
    owner: string;
    repo: string;
    baseSha: string;
    existingFiles: FileContent[];
}
export interface FileContent {
    path: string;
    content: string;
    sha?: string;
}
export interface PatchProposal {
    taskId: string;
    title: string;
    summary: string;
    files: PatchFile[];
    testSuggestions: string[];
    riskLevel: 'low' | 'medium' | 'high';
    proposedCommands: string[];
}
export interface PatchFile {
    path: string;
    action: 'create' | 'modify' | 'delete';
    content?: string;
    originalContent?: string;
    diff?: string;
    additions: number;
    deletions: number;
}
export declare const patchProposalSchema_: OutputSchema<PatchProposal>;
export interface PatchGeneratorConfig {
    runner: LLMRunner;
    useFallback?: boolean;
}
export interface GeneratePatchResult {
    success: boolean;
    proposal?: PatchProposal;
    diff?: string;
    error?: string;
    metadata?: {
        promptVersion: string;
        model: string;
        latencyMs: number;
        usedFallback: boolean;
    };
}
export declare class PatchGenerator {
    private readonly runner;
    private readonly useFallback;
    constructor(config: PatchGeneratorConfig);
    /**
     * Generate a patch for a single task.
     */
    generatePatch(input: PatchInput): Promise<GeneratePatchResult>;
    /**
     * Generate patches for all tasks in a plan.
     */
    generatePatchesForPlan(workflowId: string, plan: Plan, repoContext: PatchRepoContext): Promise<GeneratePatchResult[]>;
    private buildPatchPrompt;
    private generateUnifiedDiff;
    private createFallbackPatch;
}
/**
 * Convert patch proposal to Prisma Patch data format.
 */
export declare function toPrismaPatchData(proposal: PatchProposal): {
    taskId: string;
    title: string;
    summary: string;
    diff: string;
    files: {
        path: string;
        additions: number;
        deletions: number;
    }[];
    addsTests: boolean;
    riskLevel: "low" | "medium" | "high";
    proposedCommands: string[];
};
/**
 * Assess if a patch adds tests.
 */
export declare function patchAddsTests(proposal: PatchProposal): boolean;
