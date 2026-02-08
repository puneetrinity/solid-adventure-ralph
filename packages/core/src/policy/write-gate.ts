import type { PrismaClient } from '@prisma/client';
import type {
  GitHubClient,
  OpenPullRequestParams,
  OpenPullRequestResult,
  CreateBranchParams,
  CreateBranchResult,
  UpdateFileParams,
  UpdateFileResult,
  DeleteFileParams,
  DeleteFileResult
} from '../github/github-client';

/**
 * WriteGate ensures all GitHub write operations are gated by approval.
 *
 * The WriteGate is the central enforcement point for the safety invariant:
 * "No GitHub writes without approval"
 *
 * All write operations must go through WriteGate methods, which:
 * 1. Check for valid approval in the database
 * 2. Only proceed if approval exists
 * 3. Throw a deterministic error if approval is missing
 */
export class WriteGate {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly github: GitHubClient
  ) {}

  /**
   * Assert that an approval exists for the given workflow and kind.
   * Throws WRITE_BLOCKED_NO_APPROVAL if no approval exists.
   */
  async assertApproved(workflowId: string, kind: string = 'apply_patches'): Promise<void> {
    const count = await this.prisma.approval.count({
      where: { workflowId, kind }
    });
    if (count <= 0) {
      throw new Error('WRITE_BLOCKED_NO_APPROVAL');
    }
  }

  // ============================================================================
  // Read Operations (no approval needed, passthrough to client)
  // ============================================================================

  /**
   * Get repository info (read-only, no approval needed).
   */
  async getRepository(owner: string, repo: string) {
    return this.github.getRepository({ owner, repo });
  }

  /**
   * Get file contents (read-only, no approval needed).
   */
  async getFileContents(owner: string, repo: string, path: string, ref?: string) {
    return this.github.getFileContents({ owner, repo, path, ref });
  }

  /**
   * Get branch info (read-only, no approval needed).
   */
  async getBranch(owner: string, repo: string, branch: string) {
    return this.github.getBranch({ owner, repo, branch });
  }

  // ============================================================================
  // Write Operations (require approval)
  // ============================================================================

  /**
   * Create a branch (requires approval).
   */
  async createBranch(workflowId: string, params: CreateBranchParams): Promise<CreateBranchResult> {
    await this.assertApproved(workflowId, 'apply_patches');
    return this.github.createBranch(params);
  }

  /**
   * Update a file (requires approval).
   */
  async updateFile(workflowId: string, params: UpdateFileParams): Promise<UpdateFileResult> {
    await this.assertApproved(workflowId, 'apply_patches');
    return this.github.updateFile(params);
  }

  /**
   * Delete a file (requires approval).
   */
  async deleteFile(workflowId: string, params: DeleteFileParams): Promise<DeleteFileResult> {
    await this.assertApproved(workflowId, 'apply_patches');
    return this.github.deleteFile(params);
  }

  /**
   * Open a pull request (requires approval).
   */
  async openPullRequest(workflowId: string, params: OpenPullRequestParams): Promise<OpenPullRequestResult> {
    await this.assertApproved(workflowId, 'apply_patches');
    return this.github.openPullRequest(params);
  }
}
