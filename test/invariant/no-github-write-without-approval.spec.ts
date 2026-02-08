import { getPrisma } from '@db';
import { WriteGate, type GitHubClient, StubGitHubClient } from '@core';

/**
 * Create a mock GitHubClient that extends StubGitHubClient with jest spies.
 */
function createMockGitHubClient() {
  const stub = new StubGitHubClient();
  return {
    getRepository: jest.fn(stub.getRepository.bind(stub)),
    getFileContents: jest.fn(stub.getFileContents.bind(stub)),
    getBranch: jest.fn(stub.getBranch.bind(stub)),
    createBranch: jest.fn(stub.createBranch.bind(stub)),
    updateFile: jest.fn(stub.updateFile.bind(stub)),
    openPullRequest: jest.fn(stub.openPullRequest.bind(stub))
  } as GitHubClient & { openPullRequest: jest.Mock };
}

describe('Invariant: no GitHub contents writes without approval', () => {
  const prisma = getPrisma();

  beforeAll(async () => {
    // Ensure DB reachable for tests. In local dev, set DATABASE_URL.
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('blocks openPullRequest before approval exists', async () => {
    const workflow = await prisma.workflow.create({ data: { state: 'WAITING_USER_APPROVAL' } });

    const githubMock = createMockGitHubClient();
    const gate = new WriteGate(prisma, githubMock);

    await expect(
      gate.openPullRequest(workflow.id, {
        owner: 'o',
        repo: 'r',
        head: 'bot/branch',
        base: 'main',
        title: 'Test PR'
      })
    ).rejects.toThrow('WRITE_BLOCKED_NO_APPROVAL');

    expect(githubMock.openPullRequest).not.toHaveBeenCalled();
  });

  it('allows openPullRequest after approval exists', async () => {
    const workflow = await prisma.workflow.create({ data: { state: 'WAITING_USER_APPROVAL' } });

    await prisma.approval.create({
      data: { workflowId: workflow.id, kind: 'apply_patches' }
    });

    const githubMock = createMockGitHubClient();
    const gate = new WriteGate(prisma, githubMock);

    const res = await gate.openPullRequest(workflow.id, {
      owner: 'o',
      repo: 'r',
      head: 'bot/branch',
      base: 'main',
      title: 'Approved PR'
    });

    expect(res.number).toBe(1);
    expect(githubMock.openPullRequest).toHaveBeenCalledTimes(1);
  });
});
