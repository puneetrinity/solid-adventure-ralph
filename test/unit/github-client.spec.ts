import {
  StubGitHubClient,
  type GitHubClient,
  type OpenPullRequestParams,
  type CreateBranchParams,
  type UpdateFileParams
} from '@core/github/github-client';

describe('StubGitHubClient', () => {
  let client: StubGitHubClient;

  beforeEach(() => {
    client = new StubGitHubClient();
  });

  describe('read operations', () => {
    test('getRepository returns mock repo info', async () => {
      const result = await client.getRepository({
        owner: 'test-owner',
        repo: 'test-repo'
      });

      expect(result.id).toBe(12345);
      expect(result.name).toBe('test-repo');
      expect(result.fullName).toBe('test-owner/test-repo');
      expect(result.defaultBranch).toBe('main');
      expect(result.htmlUrl).toBe('https://github.com/test-owner/test-repo');
    });

    test('getFileContents returns mock file', async () => {
      const result = await client.getFileContents({
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'src/app.ts'
      });

      expect(result.path).toBe('src/app.ts');
      expect(result.content).toBe('// stub file content');
      expect(result.sha).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
    });

    test('getBranch returns mock branch info', async () => {
      const result = await client.getBranch({
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'feature/test'
      });

      expect(result.name).toBe('feature/test');
      expect(result.sha).toBeDefined();
      expect(result.protected).toBe(false);
    });

    test('getBranch marks main as protected', async () => {
      const result = await client.getBranch({
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'main'
      });

      expect(result.protected).toBe(true);
    });
  });

  describe('write operations', () => {
    test('createBranch returns branch ref', async () => {
      const params: CreateBranchParams = {
        owner: 'test-owner',
        repo: 'test-repo',
        branch: 'feature/new-branch',
        sha: 'abc123'
      };

      const result = await client.createBranch(params);

      expect(result.ref).toBe('refs/heads/feature/new-branch');
      expect(result.sha).toBe('abc123');
    });

    test('createBranch tracks created branches', async () => {
      await client.createBranch({
        owner: 'owner',
        repo: 'repo',
        branch: 'branch1',
        sha: 'sha1'
      });

      await client.createBranch({
        owner: 'owner',
        repo: 'repo',
        branch: 'branch2',
        sha: 'sha2'
      });

      const branches = client.getCreatedBranches();
      expect(branches.size).toBe(2);
      expect(branches.has('branch1')).toBe(true);
      expect(branches.has('branch2')).toBe(true);
    });

    test('updateFile returns file result', async () => {
      const params: UpdateFileParams = {
        owner: 'test-owner',
        repo: 'test-repo',
        path: 'src/new-file.ts',
        message: 'Add new file',
        content: Buffer.from('console.log("hello")').toString('base64'),
        branch: 'feature/test'
      };

      const result = await client.updateFile(params);

      expect(result.path).toBe('src/new-file.ts');
      expect(result.sha).toBeDefined();
      expect(result.commitSha).toBeDefined();
    });

    test('updateFile tracks created files', async () => {
      await client.updateFile({
        owner: 'owner',
        repo: 'repo',
        path: 'file1.ts',
        message: 'Add file1',
        content: 'Y29udGVudA==',
        branch: 'main'
      });

      await client.updateFile({
        owner: 'owner',
        repo: 'repo',
        path: 'file2.ts',
        message: 'Add file2',
        content: 'Y29udGVudA==',
        branch: 'main'
      });

      const files = client.getCreatedFiles();
      expect(files.size).toBe(2);
      expect(files.has('file1.ts')).toBe(true);
      expect(files.has('file2.ts')).toBe(true);
    });

    test('openPullRequest returns PR info', async () => {
      const params: OpenPullRequestParams = {
        owner: 'test-owner',
        repo: 'test-repo',
        head: 'feature/test',
        base: 'main',
        title: 'Test PR',
        body: 'This is a test PR'
      };

      const result = await client.openPullRequest(params);

      expect(result.number).toBe(1);
      expect(result.url).toBe('https://github.com/test-owner/test-repo/pull/1');
    });

    test('openPullRequest increments PR number', async () => {
      const params: OpenPullRequestParams = {
        owner: 'owner',
        repo: 'repo',
        head: 'head',
        base: 'base',
        title: 'title'
      };

      const pr1 = await client.openPullRequest(params);
      const pr2 = await client.openPullRequest(params);
      const pr3 = await client.openPullRequest(params);

      expect(pr1.number).toBe(1);
      expect(pr2.number).toBe(2);
      expect(pr3.number).toBe(3);
    });
  });

  describe('reset', () => {
    test('reset clears all tracked data', async () => {
      await client.createBranch({
        owner: 'o',
        repo: 'r',
        branch: 'b',
        sha: 's'
      });

      await client.updateFile({
        owner: 'o',
        repo: 'r',
        path: 'f',
        message: 'm',
        content: 'c',
        branch: 'b'
      });

      await client.openPullRequest({
        owner: 'o',
        repo: 'r',
        head: 'h',
        base: 'b',
        title: 't'
      });

      client.reset();

      expect(client.getCreatedBranches().size).toBe(0);
      expect(client.getCreatedFiles().size).toBe(0);

      // PR number resets too
      const pr = await client.openPullRequest({
        owner: 'o',
        repo: 'r',
        head: 'h',
        base: 'b',
        title: 't'
      });
      expect(pr.number).toBe(1);
    });
  });
});

describe('GitHubClient interface', () => {
  test('StubGitHubClient implements GitHubClient interface', () => {
    const client: GitHubClient = new StubGitHubClient();

    // Verify all methods exist
    expect(typeof client.getRepository).toBe('function');
    expect(typeof client.getFileContents).toBe('function');
    expect(typeof client.getBranch).toBe('function');
    expect(typeof client.createBranch).toBe('function');
    expect(typeof client.updateFile).toBe('function');
    expect(typeof client.openPullRequest).toBe('function');
  });
});
