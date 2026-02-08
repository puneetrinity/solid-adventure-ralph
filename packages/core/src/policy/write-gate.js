"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WriteGate = void 0;
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
class WriteGate {
    prisma;
    github;
    constructor(prisma, github) {
        this.prisma = prisma;
        this.github = github;
    }
    /**
     * Assert that an approval exists for the given workflow and kind.
     * Throws WRITE_BLOCKED_NO_APPROVAL if no approval exists.
     */
    async assertApproved(workflowId, kind = 'apply_patches') {
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
    async getRepository(owner, repo) {
        return this.github.getRepository({ owner, repo });
    }
    /**
     * Get file contents (read-only, no approval needed).
     */
    async getFileContents(owner, repo, path, ref) {
        return this.github.getFileContents({ owner, repo, path, ref });
    }
    /**
     * Get branch info (read-only, no approval needed).
     */
    async getBranch(owner, repo, branch) {
        return this.github.getBranch({ owner, repo, branch });
    }
    // ============================================================================
    // Write Operations (require approval)
    // ============================================================================
    /**
     * Create a branch (requires approval).
     */
    async createBranch(workflowId, params) {
        await this.assertApproved(workflowId, 'apply_patches');
        return this.github.createBranch(params);
    }
    /**
     * Update a file (requires approval).
     */
    async updateFile(workflowId, params) {
        await this.assertApproved(workflowId, 'apply_patches');
        return this.github.updateFile(params);
    }
    /**
     * Open a pull request (requires approval).
     */
    async openPullRequest(workflowId, params) {
        await this.assertApproved(workflowId, 'apply_patches');
        return this.github.openPullRequest(params);
    }
}
exports.WriteGate = WriteGate;
//# sourceMappingURL=write-gate.js.map