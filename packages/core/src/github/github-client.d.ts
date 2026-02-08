/**
 * GitHub Client Interface and Types
 *
 * This module defines the interface for GitHub operations.
 * The interface is implemented by:
 * - StubGitHubClient: For testing (no real API calls)
 * - OctokitGitHubClient: For production (real GitHub API via Octokit)
 */
export type OpenPullRequestParams = {
    owner: string;
    repo: string;
    head: string;
    base: string;
    title: string;
    body?: string;
};
export type OpenPullRequestResult = {
    url: string;
    number: number;
};
export type GetRepositoryParams = {
    owner: string;
    repo: string;
};
export type RepositoryInfo = {
    id: number;
    name: string;
    fullName: string;
    defaultBranch: string;
    private: boolean;
    htmlUrl: string;
};
export type GetFileContentsParams = {
    owner: string;
    repo: string;
    path: string;
    ref?: string;
};
export type FileContents = {
    path: string;
    content: string;
    sha: string;
    size: number;
};
export type GetBranchParams = {
    owner: string;
    repo: string;
    branch: string;
};
export type BranchInfo = {
    name: string;
    sha: string;
    protected: boolean;
};
export type CreateBranchParams = {
    owner: string;
    repo: string;
    branch: string;
    sha: string;
};
export type CreateBranchResult = {
    ref: string;
    sha: string;
};
export type CreateCommitParams = {
    owner: string;
    repo: string;
    message: string;
    tree: string;
    parents: string[];
};
export type CreateCommitResult = {
    sha: string;
    message: string;
    url: string;
};
export type UpdateFileParams = {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
    branch: string;
};
export type UpdateFileResult = {
    path: string;
    sha: string;
    commitSha: string;
};
/**
 * GitHubClient interface defines all operations supported by the client.
 * Implementations must be behind WriteGate for write operations.
 */
export interface GitHubClient {
    getRepository(params: GetRepositoryParams): Promise<RepositoryInfo>;
    getFileContents(params: GetFileContentsParams): Promise<FileContents>;
    getBranch(params: GetBranchParams): Promise<BranchInfo>;
    createBranch(params: CreateBranchParams): Promise<CreateBranchResult>;
    updateFile(params: UpdateFileParams): Promise<UpdateFileResult>;
    openPullRequest(params: OpenPullRequestParams): Promise<OpenPullRequestResult>;
}
export interface GitHubAppConfig {
    appId: string;
    privateKey: string;
    installationId: string;
    baseUrl?: string;
}
/**
 * Stub implementation of GitHubClient for testing.
 * Returns mock data without making real API calls.
 */
export declare class StubGitHubClient implements GitHubClient {
    private nextPrNumber;
    private readonly createdBranches;
    private readonly createdFiles;
    getRepository(params: GetRepositoryParams): Promise<RepositoryInfo>;
    getFileContents(params: GetFileContentsParams): Promise<FileContents>;
    getBranch(params: GetBranchParams): Promise<BranchInfo>;
    createBranch(params: CreateBranchParams): Promise<CreateBranchResult>;
    updateFile(params: UpdateFileParams): Promise<UpdateFileResult>;
    openPullRequest(params: OpenPullRequestParams): Promise<OpenPullRequestResult>;
    getCreatedBranches(): Map<string, CreateBranchResult>;
    getCreatedFiles(): Map<string, UpdateFileResult>;
    reset(): void;
}
