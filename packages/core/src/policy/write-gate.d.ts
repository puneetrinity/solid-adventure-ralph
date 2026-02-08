import type { PrismaClient } from '@prisma/client';
import type { GitHubClient, OpenPullRequestParams, OpenPullRequestResult, CreateBranchParams, CreateBranchResult, UpdateFileParams, UpdateFileResult } from '../github/github-client';
/**
 * WriteGate ensures all GitHub write operations are gated by approval.
 *
 * The WriteGate is the central enforcement point for the safety invariant:
 * "No GitHub writes without approval"
 *
 * All write operations must go through WriteGate methods, which:
 * 1. Check for valid approval in the database
 * 2. Only proceed if approval exists
 * 3. Throw a deterministic error if approval is missing
 */
export declare class WriteGate {
    private readonly prisma;
    private readonly github;
    constructor(prisma: PrismaClient, github: GitHubClient);
    /**
     * Assert that an approval exists for the given workflow and kind.
     * Throws WRITE_BLOCKED_NO_APPROVAL if no approval exists.
     */
    assertApproved(workflowId: string, kind?: string): Promise<void>;
    /**
     * Get repository info (read-only, no approval needed).
     */
    getRepository(owner: string, repo: string): Promise<import("../github/github-client").RepositoryInfo>;
    /**
     * Get file contents (read-only, no approval needed).
     */
    getFileContents(owner: string, repo: string, path: string, ref?: string): Promise<import("../github/github-client").FileContents>;
    /**
     * Get branch info (read-only, no approval needed).
     */
    getBranch(owner: string, repo: string, branch: string): Promise<import("../github/github-client").BranchInfo>;
    /**
     * Create a branch (requires approval).
     */
    createBranch(workflowId: string, params: CreateBranchParams): Promise<CreateBranchResult>;
    /**
     * Update a file (requires approval).
     */
    updateFile(workflowId: string, params: UpdateFileParams): Promise<UpdateFileResult>;
    /**
     * Open a pull request (requires approval).
     */
    openPullRequest(workflowId: string, params: OpenPullRequestParams): Promise<OpenPullRequestResult>;
}
