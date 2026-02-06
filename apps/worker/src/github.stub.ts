import type { GitHubClient, OpenPullRequestParams, OpenPullRequestResult } from '@core';

export class StubGitHubClient implements GitHubClient {
  async openPullRequest(params: OpenPullRequestParams): Promise<OpenPullRequestResult> {
    // This is intentionally a stub: no network calls.
    // Later you replace with Octokit implementation behind the same interface.
    return {
      url: `https://example.local/pr/${Math.floor(Math.random() * 10000)}`,
      number: Math.floor(Math.random() * 10000)
    };
  }
}
