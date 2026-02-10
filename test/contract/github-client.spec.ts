import http from 'http';
import { OctokitGitHubClient } from '@core/github/octokit-client';

const requests: Array<{ method: string; url: string; body: any }> = [];

function startServer() {
  return new Promise<{ server: http.Server; baseUrl: string }>((resolve) => {
    const server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
        requests.push({ method: req.method || '', url: req.url || '', body });

        const url = req.url || '';

        if (req.method === 'GET' && url.startsWith('/repos/acme/app/git/trees/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            sha: 'sha123',
            truncated: false,
            tree: [
              { path: 'README.md', mode: '100644', type: 'blob', sha: 'blob1', size: 10 }
            ]
          }));
          return;
        }

        if (req.method === 'POST' && url === '/repos/acme/app/actions/workflows/ci.yml/dispatches') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method === 'GET' && url === '/repos/acme/app/actions/workflows/ci.yml/runs') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
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
          }));
          return;
        }

        if (req.method === 'GET' && url === '/repos/acme/app/actions/runs/7/jobs') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
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
          }));
          return;
        }

        if (req.method === 'POST' && url === '/repos/acme/app/pulls') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ html_url: 'https://example.com/pull/1', number: 1 }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found', url }));
      });
    });

    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const started = await startServer();
  server = started.server;
  baseUrl = started.baseUrl;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  requests.length = 0;
});

test('OctokitGitHubClient.getTree hits git trees endpoint', async () => {
  const client = OctokitGitHubClient.fromToken('test-token', baseUrl);
  const result = await client.getTree({ owner: 'acme', repo: 'app', sha: 'sha123', recursive: true });

  expect(result.sha).toBe('sha123');
  expect(result.tree[0]?.path).toBe('README.md');

  const last = requests[requests.length - 1];
  expect(last.method).toBe('GET');
  expect(last.url).toContain('/repos/acme/app/git/trees/sha123');
});

test('OctokitGitHubClient.dispatchWorkflow hits workflow dispatch endpoint', async () => {
  const client = OctokitGitHubClient.fromToken('test-token', baseUrl);
  await client.dispatchWorkflow({ owner: 'acme', repo: 'app', workflowId: 'ci.yml', ref: 'main' });

  const last = requests[requests.length - 1];
  expect(last.method).toBe('POST');
  expect(last.url).toBe('/repos/acme/app/actions/workflows/ci.yml/dispatches');
});

test('OctokitGitHubClient.listWorkflowRuns hits workflow runs endpoint', async () => {
  const client = OctokitGitHubClient.fromToken('test-token', baseUrl);
  const result = await client.listWorkflowRuns({ owner: 'acme', repo: 'app', workflowId: 'ci.yml' });

  expect(result.totalCount).toBe(1);
  expect(result.runs[0]?.id).toBe(7);

  const last = requests[requests.length - 1];
  expect(last.method).toBe('GET');
  expect(last.url).toBe('/repos/acme/app/actions/workflows/ci.yml/runs');
});

test('OctokitGitHubClient.getWorkflowRunJobs hits jobs endpoint', async () => {
  const client = OctokitGitHubClient.fromToken('test-token', baseUrl);
  const result = await client.getWorkflowRunJobs({ owner: 'acme', repo: 'app', runId: 7 });

  expect(result.totalCount).toBe(1);
  expect(result.jobs[0]?.name).toBe('build');

  const last = requests[requests.length - 1];
  expect(last.method).toBe('GET');
  expect(last.url).toBe('/repos/acme/app/actions/runs/7/jobs');
});

test('OctokitGitHubClient.openPullRequest hits PR endpoint', async () => {
  const client = OctokitGitHubClient.fromToken('test-token', baseUrl);
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

  const last = requests[requests.length - 1];
  expect(last.method).toBe('POST');
  expect(last.url).toBe('/repos/acme/app/pulls');
});
