/**
 * Patch Applicator
 *
 * Applies patches from a PatchSet to a GitHub repository.
 * This service is responsible for:
 * 1. Creating a branch from base SHA
 * 2. Applying diffs by updating files via GitHub API
 * 3. Committing changes per patch
 * 4. Opening a PR
 * 5. Recording the PR in the database
 *
 * All write operations go through WriteGate to enforce approval requirements.
 */
import type { PrismaClient } from '@prisma/client';
import { WriteGate } from '../policy/write-gate';
export interface PatchData {
    id: string;
    title: string;
    summary: string;
    diff: string;
    files: Array<{
        path: string;
        additions: number;
        deletions: number;
    }>;
}
export interface PatchSetData {
    id: string;
    title: string;
    baseSha: string;
    patches: PatchData[];
}
export interface ApplyPatchesInput {
    workflowId: string;
    patchSetId: string;
    owner: string;
    repo: string;
    baseBranch: string;
}
export interface ApplyPatchesResult {
    success: boolean;
    branchName: string;
    prNumber?: number;
    prUrl?: string;
    commitShas: string[];
    error?: string;
}
export interface FileChange {
    path: string;
    content: string;
    isNew: boolean;
    isDeleted: boolean;
    originalSha?: string;
}
/**
 * Apply a unified diff to existing content.
 * Processes hunks sequentially, tracking line position in original file.
 */
export declare function applyDiffToContent(originalContent: string, diff: string): string;
/**
 * Extract file changes from a diff.
 * Returns the list of files and whether they are new, modified, or deleted.
 */
export declare function extractFileChangesFromDiff(diff: string): Array<{
    path: string;
    isNew: boolean;
    isDeleted: boolean;
    diffContent: string;
}>;
export declare class PatchApplicator {
    private readonly prisma;
    private readonly writeGate;
    constructor(prisma: PrismaClient, writeGate: WriteGate);
    /**
     * Apply a PatchSet to a repository, creating a branch and PR.
     */
    applyPatches(input: ApplyPatchesInput): Promise<ApplyPatchesResult>;
    /**
     * Generate a branch name for a workflow/patchset.
     */
    private generateBranchName;
    /**
     * Generate PR body with context about the workflow.
     */
    private generatePRBody;
    /**
     * Extract the content of a new file from its diff.
     */
    private extractNewFileContent;
}
