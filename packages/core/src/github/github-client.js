"use strict";
/**
 * GitHub Client Interface and Types
 *
 * This module defines the interface for GitHub operations.
 * The interface is implemented by:
 * - StubGitHubClient: For testing (no real API calls)
 * - OctokitGitHubClient: For production (real GitHub API via Octokit)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubGitHubClient = void 0;
// ============================================================================
// Stub Implementation (for testing)
// ============================================================================
/**
 * Stub implementation of GitHubClient for testing.
 * Returns mock data without making real API calls.
 */
class StubGitHubClient {
    nextPrNumber = 1;
    createdBranches = new Map();
    createdFiles = new Map();
    async getRepository(params) {
        return {
            id: 12345,
            name: params.repo,
            fullName: `${params.owner}/${params.repo}`,
            defaultBranch: 'main',
            private: false,
            htmlUrl: `https://github.com/${params.owner}/${params.repo}`
        };
    }
    async getFileContents(params) {
        return {
            path: params.path,
            content: '// stub file content',
            sha: 'stub-file-sha-abc123',
            size: 21
        };
    }
    async getBranch(params) {
        return {
            name: params.branch,
            sha: 'stub-branch-sha-abc123',
            protected: params.branch === 'main'
        };
    }
    async createBranch(params) {
        const result = {
            ref: `refs/heads/${params.branch}`,
            sha: params.sha
        };
        this.createdBranches.set(params.branch, result);
        return result;
    }
    async updateFile(params) {
        const result = {
            path: params.path,
            sha: `stub-blob-sha-${Date.now()}`,
            commitSha: `stub-commit-sha-${Date.now()}`
        };
        this.createdFiles.set(params.path, result);
        return result;
    }
    async openPullRequest(params) {
        const number = this.nextPrNumber++;
        return {
            url: `https://github.com/${params.owner}/${params.repo}/pull/${number}`,
            number
        };
    }
    // Test helpers
    getCreatedBranches() {
        return new Map(this.createdBranches);
    }
    getCreatedFiles() {
        return new Map(this.createdFiles);
    }
    reset() {
        this.nextPrNumber = 1;
        this.createdBranches.clear();
        this.createdFiles.clear();
    }
}
exports.StubGitHubClient = StubGitHubClient;
//# sourceMappingURL=github-client.js.map