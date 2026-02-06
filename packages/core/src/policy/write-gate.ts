import type { PrismaClient } from '@prisma/client';
import type { GitHubClient, OpenPullRequestParams, OpenPullRequestResult } from '../github/github-client';

export class WriteGate {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly github: GitHubClient
  ) {}

  async assertApproved(workflowId: string, kind: string = 'apply_patches'): Promise<void> {
    const count = await this.prisma.approval.count({
      where: { workflowId, kind }
    });
    if (count <= 0) {
      throw new Error('WRITE_BLOCKED_NO_APPROVAL');
    }
  }

  async openPullRequest(workflowId: string, params: OpenPullRequestParams): Promise<OpenPullRequestResult> {
    await this.assertApproved(workflowId, 'apply_patches');
    return this.github.openPullRequest(params);
  }
}
