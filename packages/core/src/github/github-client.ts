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

export interface GitHubClient {
  openPullRequest(params: OpenPullRequestParams): Promise<OpenPullRequestResult>;
}
