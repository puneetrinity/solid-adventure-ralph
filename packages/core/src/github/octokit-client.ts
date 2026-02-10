/**
 * Octokit GitHub Client Implementation
 *
 * This module implements the GitHubClient interface using Octokit.
 * It supports GitHub App authentication with installation tokens.
 */

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import type {
  GitHubClient,
  GitHubAppConfig,
  GetRepositoryParams,
  RepositoryInfo,
  GetFileContentsParams,
  FileContents,
  GetBranchParams,
  BranchInfo,
  GetTreeParams,
  TreeInfo,
  DispatchWorkflowParams,
  ListWorkflowRunsParams,
  WorkflowRunList,
  GetWorkflowRunParams,
  WorkflowRunInfo,
  CreateBranchParams,
  CreateBranchResult,
  UpdateFileParams,
  UpdateFileResult,
  DeleteFileParams,
  DeleteFileResult,
  OpenPullRequestParams,
  OpenPullRequestResult
} from './github-client';

/**
 * Create an authenticated Octokit instance using GitHub App credentials.
 */
export function createOctokitWithAppAuth(config: GitHubAppConfig): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.appId,
      privateKey: config.privateKey,
      installationId: parseInt(config.installationId, 10)
    },
    baseUrl: config.baseUrl
  });
}

/**
 * OctokitGitHubClient implements GitHubClient using the Octokit library.
 * This is the production implementation that makes real GitHub API calls.
 */
export class OctokitGitHubClient implements GitHubClient {
  private readonly octokit: Octokit;

  constructor(octokit: Octokit) {
    this.octokit = octokit;
  }

  /**
   * Create an OctokitGitHubClient from GitHub App configuration.
   */
  static fromAppConfig(config: GitHubAppConfig): OctokitGitHubClient {
    const octokit = createOctokitWithAppAuth(config);
    return new OctokitGitHubClient(octokit);
  }

  /**
   * Create an OctokitGitHubClient from a personal access token.
   * Useful for testing and development.
   */
  static fromToken(token: string, baseUrl?: string): OctokitGitHubClient {
    const octokit = new Octokit({
      auth: token,
      baseUrl
    });
    return new OctokitGitHubClient(octokit);
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  async getRepository(params: GetRepositoryParams): Promise<RepositoryInfo> {
    const { data } = await this.octokit.repos.get({
      owner: params.owner,
      repo: params.repo
    });

    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      private: data.private,
      htmlUrl: data.html_url,
      description: data.description,
      language: data.language,
      topics: data.topics
    };
  }

  async getFileContents(params: GetFileContentsParams): Promise<FileContents> {
    const { data } = await this.octokit.repos.getContent({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      ref: params.ref
    });

    // getContent can return an array for directories, we only handle files
    if (Array.isArray(data)) {
      throw new Error(`Path "${params.path}" is a directory, not a file`);
    }

    if (data.type !== 'file') {
      throw new Error(`Path "${params.path}" is not a file (type: ${data.type})`);
    }

    // Decode base64 content
    const content = data.content
      ? Buffer.from(data.content, 'base64').toString('utf-8')
      : '';

    return {
      path: data.path,
      content,
      sha: data.sha,
      size: data.size
    };
  }

  async getBranch(params: GetBranchParams): Promise<BranchInfo> {
    const { data } = await this.octokit.repos.getBranch({
      owner: params.owner,
      repo: params.repo,
      branch: params.branch
    });

    return {
      name: data.name,
      sha: data.commit.sha,
      protected: data.protected
    };
  }

  async getTree(params: GetTreeParams): Promise<TreeInfo> {
    const { data } = await this.octokit.git.getTree({
      owner: params.owner,
      repo: params.repo,
      tree_sha: params.sha,
      recursive: params.recursive ? 'true' : undefined
    });

    return {
      sha: data.sha,
      tree: data.tree.map(item => ({
        path: item.path || '',
        mode: item.mode || '',
        type: item.type as 'blob' | 'tree',
        sha: item.sha || '',
        size: item.size
      })),
      truncated: data.truncated
    };
  }

  async dispatchWorkflow(params: DispatchWorkflowParams): Promise<void> {
    await this.octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
      owner: params.owner,
      repo: params.repo,
      workflow_id: params.workflowId,
      ref: params.ref,
      inputs: params.inputs ?? {}
    });
  }

  async listWorkflowRuns(params: ListWorkflowRunsParams): Promise<WorkflowRunList> {
    const request = params.workflowId
      ? {
          url: 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
          owner: params.owner,
          repo: params.repo,
          workflow_id: params.workflowId,
          branch: params.branch,
          event: params.event,
          per_page: params.perPage ?? 20
        }
      : {
          url: 'GET /repos/{owner}/{repo}/actions/runs',
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
          event: params.event,
          per_page: params.perPage ?? 20
        };

    const { data } = await this.octokit.request(request as any);

    return {
      totalCount: (data as any).total_count ?? (data as any).workflow_runs.length,
      runs: (data as any).workflow_runs.map((run: any) => ({
        id: run.id,
        status: run.status as WorkflowRunInfo['status'],
        conclusion: run.conclusion as WorkflowRunInfo['conclusion'],
        htmlUrl: run.html_url,
        logsUrl: run.logs_url,
        headSha: run.head_sha,
        headBranch: run.head_branch,
        event: run.event,
        createdAt: run.created_at,
        updatedAt: run.updated_at
      }))
    };
  }

  async getWorkflowRun(params: GetWorkflowRunParams): Promise<WorkflowRunInfo> {
    const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}', {
      owner: params.owner,
      repo: params.repo,
      run_id: params.runId
    });

    return {
      id: data.id,
      status: data.status as WorkflowRunInfo['status'],
      conclusion: data.conclusion as WorkflowRunInfo['conclusion'],
      htmlUrl: data.html_url,
      logsUrl: data.logs_url,
      headSha: data.head_sha,
      headBranch: data.head_branch ?? undefined,
      event: data.event,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  // ============================================================================
  // Write Operations (should be gated via WriteGate)
  // ============================================================================

  async createBranch(params: CreateBranchParams): Promise<CreateBranchResult> {
    const { data } = await this.octokit.git.createRef({
      owner: params.owner,
      repo: params.repo,
      ref: `refs/heads/${params.branch}`,
      sha: params.sha
    });

    return {
      ref: data.ref,
      sha: data.object.sha
    };
  }

  async updateFile(params: UpdateFileParams): Promise<UpdateFileResult> {
    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      message: params.message,
      content: params.content, // Must be base64 encoded
      sha: params.sha,
      branch: params.branch
    });

    return {
      path: data.content?.path ?? params.path,
      sha: data.content?.sha ?? '',
      commitSha: data.commit.sha ?? ''
    };
  }

  async deleteFile(params: DeleteFileParams): Promise<DeleteFileResult> {
    const { data } = await this.octokit.repos.deleteFile({
      owner: params.owner,
      repo: params.repo,
      path: params.path,
      message: params.message,
      sha: params.sha,
      branch: params.branch
    });

    return {
      commitSha: data.commit.sha ?? ''
    };
  }

  async openPullRequest(params: OpenPullRequestParams): Promise<OpenPullRequestResult> {
    const { data } = await this.octokit.pulls.create({
      owner: params.owner,
      repo: params.repo,
      head: params.head,
      base: params.base,
      title: params.title,
      body: params.body
    });

    return {
      url: data.html_url,
      number: data.number
    };
  }
}

/**
 * GitHub App Token Manager
 *
 * Manages installation tokens with automatic refresh.
 * Tokens are cached and refreshed before expiry.
 */
export class GitHubAppTokenManager {
  private readonly config: GitHubAppConfig;
  private cachedToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: GitHubAppConfig) {
    this.config = config;
  }

  /**
   * Get a valid installation token, refreshing if needed.
   */
  async getInstallationToken(): Promise<string> {
    // Check if we have a valid cached token (with 5 min buffer)
    if (this.cachedToken && this.tokenExpiresAt) {
      const bufferMs = 5 * 60 * 1000; // 5 minutes
      if (this.tokenExpiresAt.getTime() - bufferMs > Date.now()) {
        return this.cachedToken;
      }
    }

    // Refresh the token
    const octokit = createOctokitWithAppAuth(this.config);

    // The auth strategy automatically handles token generation
    const auth = await octokit.auth({
      type: 'installation'
    }) as { token: string; expiresAt: string };

    this.cachedToken = auth.token;
    this.tokenExpiresAt = new Date(auth.expiresAt);

    return this.cachedToken;
  }

  /**
   * Invalidate the cached token.
   */
  invalidate(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = null;
  }
}

/**
 * Factory function to create the appropriate GitHubClient based on environment.
 */
export function createGitHubClient(config?: GitHubAppConfig): GitHubClient {
  if (!config) {
    // No config provided, use stub for testing
    const { StubGitHubClient } = require('./github-client');
    return new StubGitHubClient();
  }

  return OctokitGitHubClient.fromAppConfig(config);
}

/**
 * Load GitHub App configuration from environment variables.
 */
export function loadGitHubAppConfigFromEnv(): GitHubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  const baseUrl = process.env.GITHUB_API_BASE_URL;

  if (!appId || !privateKey || !installationId) {
    return null;
  }

  return {
    appId,
    privateKey: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
    installationId,
    baseUrl
  };
}
