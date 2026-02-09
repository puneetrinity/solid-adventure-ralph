/**
 * GitHub Client Interface and Types
 *
 * This module defines the interface for GitHub operations.
 * The interface is implemented by:
 * - StubGitHubClient: For testing (no real API calls)
 * - OctokitGitHubClient: For production (real GitHub API via Octokit)
 */

// ============================================================================
// Types for Pull Request Operations
// ============================================================================

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

// ============================================================================
// Types for Repository Operations
// ============================================================================

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
  ref?: string; // branch, tag, or commit SHA
};

export type FileContents = {
  path: string;
  content: string; // base64 decoded
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

export type GetTreeParams = {
  owner: string;
  repo: string;
  sha: string;
  recursive?: boolean;
};

export type TreeItem = {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
};

export type TreeInfo = {
  sha: string;
  tree: TreeItem[];
  truncated: boolean;
};

// ============================================================================
// Types for Branch/Commit Operations
// ============================================================================

export type CreateBranchParams = {
  owner: string;
  repo: string;
  branch: string;
  sha: string; // base commit SHA
};

export type CreateBranchResult = {
  ref: string;
  sha: string;
};

export type CreateCommitParams = {
  owner: string;
  repo: string;
  message: string;
  tree: string; // tree SHA
  parents: string[]; // parent commit SHAs
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
  content: string; // base64 encoded
  sha?: string; // required for updates, not for new files
  branch: string;
};

export type UpdateFileResult = {
  path: string;
  sha: string;
  commitSha: string;
};

export type DeleteFileParams = {
  owner: string;
  repo: string;
  path: string;
  message: string;
  sha: string; // required - must know current file SHA
  branch: string;
};

export type DeleteFileResult = {
  commitSha: string;
};

// ============================================================================
// GitHub Client Interface
// ============================================================================

/**
 * GitHubClient interface defines all operations supported by the client.
 * Implementations must be behind WriteGate for write operations.
 */
export interface GitHubClient {
  // Read operations (no approval needed)
  getRepository(params: GetRepositoryParams): Promise<RepositoryInfo>;
  getFileContents(params: GetFileContentsParams): Promise<FileContents>;
  getBranch(params: GetBranchParams): Promise<BranchInfo>;
  getTree(params: GetTreeParams): Promise<TreeInfo>;

  // Write operations (require approval via WriteGate)
  createBranch(params: CreateBranchParams): Promise<CreateBranchResult>;
  updateFile(params: UpdateFileParams): Promise<UpdateFileResult>;
  deleteFile(params: DeleteFileParams): Promise<DeleteFileResult>;
  openPullRequest(params: OpenPullRequestParams): Promise<OpenPullRequestResult>;
}

// ============================================================================
// GitHub App Configuration
// ============================================================================

export interface GitHubAppConfig {
  appId: string;
  privateKey: string; // PEM format
  installationId: string;
  baseUrl?: string; // Optional for GitHub Enterprise
}

// ============================================================================
// Stub Implementation (for testing)
// ============================================================================

/**
 * Stub implementation of GitHubClient for testing.
 * Returns mock data without making real API calls.
 */
export class StubGitHubClient implements GitHubClient {
  private nextPrNumber = 1;
  private readonly createdBranches: Map<string, CreateBranchResult> = new Map();
  private readonly createdFiles: Map<string, UpdateFileResult> = new Map();

  async getRepository(params: GetRepositoryParams): Promise<RepositoryInfo> {
    return {
      id: 12345,
      name: params.repo,
      fullName: `${params.owner}/${params.repo}`,
      defaultBranch: 'main',
      private: false,
      htmlUrl: `https://github.com/${params.owner}/${params.repo}`
    };
  }

  async getFileContents(params: GetFileContentsParams): Promise<FileContents> {
    return {
      path: params.path,
      content: '// stub file content',
      sha: 'stub-file-sha-abc123',
      size: 21
    };
  }

  async getBranch(params: GetBranchParams): Promise<BranchInfo> {
    return {
      name: params.branch,
      sha: 'stub-branch-sha-abc123',
      protected: params.branch === 'main'
    };
  }

  async getTree(params: GetTreeParams): Promise<TreeInfo> {
    return {
      sha: params.sha,
      tree: [
        { path: 'README.md', mode: '100644', type: 'blob', sha: 'stub-blob-1', size: 100 },
        { path: 'package.json', mode: '100644', type: 'blob', sha: 'stub-blob-2', size: 500 },
        { path: 'src', mode: '040000', type: 'tree', sha: 'stub-tree-1' },
        { path: 'src/index.ts', mode: '100644', type: 'blob', sha: 'stub-blob-3', size: 200 },
      ],
      truncated: false
    };
  }

  async createBranch(params: CreateBranchParams): Promise<CreateBranchResult> {
    const result: CreateBranchResult = {
      ref: `refs/heads/${params.branch}`,
      sha: params.sha
    };
    this.createdBranches.set(params.branch, result);
    return result;
  }

  async updateFile(params: UpdateFileParams): Promise<UpdateFileResult> {
    const result: UpdateFileResult = {
      path: params.path,
      sha: `stub-blob-sha-${Date.now()}`,
      commitSha: `stub-commit-sha-${Date.now()}`
    };
    this.createdFiles.set(params.path, result);
    return result;
  }

  async deleteFile(params: DeleteFileParams): Promise<DeleteFileResult> {
    this.createdFiles.delete(params.path);
    return {
      commitSha: `stub-delete-commit-sha-${Date.now()}`
    };
  }

  async openPullRequest(params: OpenPullRequestParams): Promise<OpenPullRequestResult> {
    const number = this.nextPrNumber++;
    return {
      url: `https://github.com/${params.owner}/${params.repo}/pull/${number}`,
      number
    };
  }

  // Test helpers
  getCreatedBranches(): Map<string, CreateBranchResult> {
    return new Map(this.createdBranches);
  }

  getCreatedFiles(): Map<string, UpdateFileResult> {
    return new Map(this.createdFiles);
  }

  reset(): void {
    this.nextPrNumber = 1;
    this.createdBranches.clear();
    this.createdFiles.clear();
  }
}
