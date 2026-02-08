import type {
  GitHubClient,
  OpenPullRequestParams,
  OpenPullRequestResult,
  GetRepositoryParams,
  RepositoryInfo,
  GetFileContentsParams,
  FileContents,
  GetBranchParams,
  BranchInfo,
  CreateBranchParams,
  CreateBranchResult,
  UpdateFileParams,
  UpdateFileResult
} from '@core';

export class StubGitHubClient implements GitHubClient {
  async getRepository(_params: GetRepositoryParams): Promise<RepositoryInfo> {
    return {
      owner: 'stub-owner',
      repo: 'stub-repo',
      defaultBranch: 'main',
      private: false
    };
  }

  async getFileContents(_params: GetFileContentsParams): Promise<FileContents> {
    return {
      content: '',
      sha: 'stub-sha',
      encoding: 'utf-8'
    };
  }

  async getBranch(_params: GetBranchParams): Promise<BranchInfo> {
    return {
      name: 'main',
      sha: 'stub-sha'
    };
  }

  async createBranch(_params: CreateBranchParams): Promise<CreateBranchResult> {
    return {
      name: 'stub-branch',
      sha: 'stub-sha'
    };
  }

  async updateFile(_params: UpdateFileParams): Promise<UpdateFileResult> {
    return {
      sha: 'stub-sha',
      commitSha: 'stub-commit-sha'
    };
  }

  async openPullRequest(_params: OpenPullRequestParams): Promise<OpenPullRequestResult> {
    return {
      url: `https://example.local/pr/${Math.floor(Math.random() * 10000)}`,
      number: Math.floor(Math.random() * 10000)
    };
  }
}
