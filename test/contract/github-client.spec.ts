jest.setTimeout(20000);

const describeIfCi = process.env.CI === 'true' ? describe : describe.skip;

const requestMock = jest.fn();
const gitGetTreeMock = jest.fn();
const pullsCreateMock = jest.fn();

jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn()
}));

jest.mock('@octokit/rest', () => {
  class Octokit {
    request = requestMock;
    git = {
      getTree: gitGetTreeMock,
      createRef: jest.fn()
    };
    repos = {
      get: jest.fn(),
      getContent: jest.fn(),
      getBranch: jest.fn(),
      createOrUpdateFileContents: jest.fn(),
      deleteFile: jest.fn()
    };
    pulls = {
      create: pullsCreateMock
    };
    constructor() {}
  }
  return { Octokit };
});

// Import after mocks so Octokit is fully mocked before module evaluation
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OctokitGitHubClient } = require('@core/github/octokit-client');

describeIfCi('OctokitGitHubClient contract', () => {
  beforeEach(() => {
    requestMock.mockReset();
    gitGetTreeMock.mockReset();
    pullsCreateMock.mockReset();
  });

  test('OctokitGitHubClient.getTree hits git trees endpoint', async () => {
    gitGetTreeMock.mockResolvedValue({
      data: {
        sha: 'sha123',
        truncated: false,
        tree: [
          { path: 'README.md', mode: '100644', type: 'blob', sha: 'blob1', size: 10 }
        ]
      }
    });
    const client = OctokitGitHubClient.fromToken('test-token', 'http://example.com');
    const result = await client.getTree({ owner: 'acme', repo: 'app', sha: 'sha123', recursive: true });

    expect(result.sha).toBe('sha123');
    expect(result.tree[0]?.path).toBe('README.md');

    expect(gitGetTreeMock).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'app',
      tree_sha: 'sha123',
      recursive: 'true'
    });
  });

  test('OctokitGitHubClient.dispatchWorkflow hits workflow dispatch endpoint', async () => {
    requestMock.mockResolvedValue({});
    const client = OctokitGitHubClient.fromToken('test-token', 'http://example.com');
    await client.dispatchWorkflow({ owner: 'acme', repo: 'app', workflowId: 'ci.yml', ref: 'main' });

    expect(requestMock).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
      {
        owner: 'acme',
        repo: 'app',
        workflow_id: 'ci.yml',
        ref: 'main',
        inputs: {}
      }
    );
  });

  test('OctokitGitHubClient.listWorkflowRuns hits workflow runs endpoint', async () => {
    requestMock.mockResolvedValue({
      data: {
        total_count: 1,
        workflow_runs: [
          {
            id: 7,
            status: 'completed',
            conclusion: 'success',
            html_url: 'https://example.com/runs/7',
            logs_url: 'https://example.com/runs/7/logs',
            head_sha: 'stub-sha',
            head_branch: 'main',
            event: 'workflow_dispatch',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      }
    });
    const client = OctokitGitHubClient.fromToken('test-token', 'http://example.com');
    const result = await client.listWorkflowRuns({ owner: 'acme', repo: 'app', workflowId: 'ci.yml' });

    expect(result.totalCount).toBe(1);
    expect(result.runs[0]?.id).toBe(7);

    expect(requestMock).toHaveBeenCalledWith({
      url: 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
      owner: 'acme',
      repo: 'app',
      workflow_id: 'ci.yml',
      branch: undefined,
      event: undefined,
      per_page: 20
    });
  });

  test('OctokitGitHubClient.getWorkflowRunJobs hits jobs endpoint', async () => {
    requestMock.mockResolvedValue({
      data: {
        total_count: 1,
        jobs: [
          {
            id: 101,
            name: 'build',
            status: 'completed',
            conclusion: 'success',
            html_url: 'https://example.com/jobs/101',
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            steps: [
              { name: 'checkout', status: 'completed', conclusion: 'success' }
            ]
          }
        ]
      }
    });
    const client = OctokitGitHubClient.fromToken('test-token', 'http://example.com');
    const result = await client.getWorkflowRunJobs({ owner: 'acme', repo: 'app', runId: 7 });

    expect(result.totalCount).toBe(1);
    expect(result.jobs[0]?.name).toBe('build');

    expect(requestMock).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs',
      {
        owner: 'acme',
        repo: 'app',
        run_id: 7,
        per_page: 50,
        page: 1
      }
    );
  });

  test('OctokitGitHubClient.openPullRequest hits PR endpoint', async () => {
    pullsCreateMock.mockResolvedValue({
      data: { html_url: 'https://example.com/pull/1', number: 1 }
    });
    const client = OctokitGitHubClient.fromToken('test-token', 'http://example.com');
    const result = await client.openPullRequest({
      owner: 'acme',
      repo: 'app',
      title: 'Test PR',
      body: 'Body',
      head: 'branch',
      base: 'main'
    });

    expect(result.number).toBe(1);
    expect(result.url).toContain('/pull/1');

    expect(pullsCreateMock).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'app',
      head: 'branch',
      base: 'main',
      title: 'Test PR',
      body: 'Body'
    });
  });
});
