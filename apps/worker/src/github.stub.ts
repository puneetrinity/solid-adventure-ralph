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
  UpdateFileResult,
  DeleteFileParams,
  DeleteFileResult
} from '@arch-orchestrator/core';

export class StubGitHubClient implements GitHubClient {
  async getRepository(_params: GetRepositoryParams): Promise<RepositoryInfo> {
    return {
      id: 1,
      name: 'stub-repo',
      fullName: 'stub-owner/stub-repo',
      defaultBranch: 'main',
      private: false,
      htmlUrl: 'https://github.com/stub-owner/stub-repo'
    };
  }

  async getFileContents(_params: GetFileContentsParams): Promise<FileContents> {
    return {
      path: 'README.md',
      content: '',
      sha: 'stub-sha',
      size: 0
    };
  }

  async getBranch(_params: GetBranchParams): Promise<BranchInfo> {
    return {
      name: 'main',
      sha: 'stub-sha',
      protected: false
    };
  }

  async createBranch(_params: CreateBranchParams): Promise<CreateBranchResult> {
    return {
      ref: 'refs/heads/stub-branch',
      sha: 'stub-sha'
    };
  }

  async updateFile(_params: UpdateFileParams): Promise<UpdateFileResult> {
    return {
      path: 'README.md',
      sha: 'stub-sha',
      commitSha: 'stub-commit-sha'
    };
  }

  async deleteFile(_params: DeleteFileParams): Promise<DeleteFileResult> {
    return {
      commitSha: 'stub-delete-commit-sha'
    };
  }

  async openPullRequest(_params: OpenPullRequestParams): Promise<OpenPullRequestResult> {
    return {
      url: `https://example.local/pr/${Math.floor(Math.random() * 10000)}`,
      number: Math.floor(Math.random() * 10000)
    };
  }
}
