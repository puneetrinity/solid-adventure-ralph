"use strict";
/**
 * Base Agent
 *
 * Abstract base class for specialist agents.
 * Provides common functionality and enforces the Agent interface.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubAgent = exports.BaseAgent = void 0;
/**
 * Abstract base class for all specialist agents.
 */
class BaseAgent {
    id;
    name;
    type;
    capabilities;
    runner;
    constructor(config) {
        this.id = config.id;
        this.name = config.name;
        this.type = config.type;
        this.capabilities = config.capabilities;
        this.runner = config.runner;
    }
    // ============================================================================
    // Helper Methods
    // ============================================================================
    /**
     * Create a successful proposal result.
     */
    createSuccess(patchSet, startTime, tokensUsed) {
        return {
            success: true,
            patchSet,
            metadata: this.createMetadata(startTime, tokensUsed),
        };
    }
    /**
     * Create a failed proposal result.
     */
    createFailure(error, startTime) {
        return {
            success: false,
            error,
            metadata: this.createMetadata(startTime),
        };
    }
    /**
     * Create proposal metadata.
     */
    createMetadata(startTime, tokensUsed) {
        return {
            agentId: this.id,
            agentType: this.type,
            generatedAt: new Date(),
            durationMs: Date.now() - startTime.getTime(),
            tokensUsed,
        };
    }
    /**
     * Create a patch from a file change.
     */
    createPatch(taskId, title, summary, diff, files, options = {}) {
        return {
            taskId,
            title,
            summary,
            diff,
            files,
            addsTests: options.addsTests ?? false,
            riskLevel: options.riskLevel ?? 'low',
            commands: options.commands,
        };
    }
    /**
     * Generate a unified diff for a file change.
     */
    generateDiff(path, oldContent, newContent) {
        // Simple diff generation (line-by-line)
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const diff = [
            `--- a/${path}`,
            `+++ b/${path}`,
        ];
        // Simple line diff (for production, use a proper diff library)
        let oldIdx = 0;
        let newIdx = 0;
        let hunkStart = 0;
        let hunk = [];
        const flushHunk = () => {
            if (hunk.length > 0) {
                diff.push(`@@ -${hunkStart + 1},${oldLines.length} +${hunkStart + 1},${newLines.length} @@`);
                diff.push(...hunk);
                hunk = [];
            }
        };
        while (oldIdx < oldLines.length || newIdx < newLines.length) {
            const oldLine = oldLines[oldIdx];
            const newLine = newLines[newIdx];
            if (oldLine === newLine) {
                if (hunk.length > 0) {
                    hunk.push(` ${oldLine ?? ''}`);
                }
                oldIdx++;
                newIdx++;
            }
            else if (oldLine !== undefined && (newLine === undefined || oldLine !== newLine)) {
                if (hunk.length === 0) {
                    hunkStart = oldIdx;
                }
                hunk.push(`-${oldLine}`);
                oldIdx++;
            }
            else {
                if (hunk.length === 0) {
                    hunkStart = newIdx;
                }
                hunk.push(`+${newLine}`);
                newIdx++;
            }
        }
        flushHunk();
        return diff.join('\n');
    }
    /**
     * Calculate file stats from content diff.
     */
    calculateFileStats(oldContent, newContent) {
        const oldLines = oldContent.split('\n').length;
        const newLines = newContent.split('\n').length;
        return {
            additions: Math.max(0, newLines - oldLines),
            deletions: Math.max(0, oldLines - newLines),
        };
    }
    /**
     * Check if agent can handle file based on patterns.
     */
    canHandleFile(path) {
        return this.capabilities.filePatterns.some(pattern => {
            const regex = pattern
                .replace(/\*\*/g, '{{GLOBSTAR}}')
                .replace(/\*/g, '[^/]*')
                .replace(/{{GLOBSTAR}}/g, '.*')
                .replace(/\./g, '\\.');
            return new RegExp(`^${regex}$`).test(path);
        });
    }
    /**
     * Check if agent supports the language.
     */
    supportsLanguage(language) {
        return this.capabilities.languages.includes(language.toLowerCase());
    }
}
exports.BaseAgent = BaseAgent;
// ============================================================================
// Stub Agent for Testing
// ============================================================================
/**
 * A stub agent that generates mock proposals for testing.
 */
class StubAgent extends BaseAgent {
    constructor(type = 'backend') {
        super({
            id: `stub-${type}`,
            name: `Stub ${type} Agent`,
            type,
            capabilities: {
                canGenerateCode: true,
                canGenerateTests: type === 'test',
                canReviewCode: type === 'review',
                canGenerateDocs: type === 'docs',
                canRefactor: type === 'refactor',
                filePatterns: ['**/*'],
                languages: ['typescript', 'javascript', 'python'],
            },
        });
    }
    describe() {
        return {
            summary: `Stub agent for testing (${this.type})`,
            specialties: [`${this.type} development`],
            limitations: ['This is a stub agent for testing purposes'],
            examples: ['Any task - returns mock proposal'],
        };
    }
    async validate(context) {
        return {
            canHandle: true,
            confidence: 0.5,
            reason: 'Stub agent can handle any task',
        };
    }
    async propose(context) {
        const startTime = new Date();
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 10));
        const patchSet = {
            title: `Stub proposal for: ${context.task.title}`,
            description: `Mock proposal generated by stub ${this.type} agent`,
            baseSha: context.repo.baseSha,
            patches: [
                this.createPatch(context.task.id, `Mock change for ${context.task.title}`, 'This is a stub proposal for testing', `--- a/mock-file.ts\n+++ b/mock-file.ts\n@@ -1,1 +1,2 @@\n // Mock file\n+// Added by stub agent`, [{
                        path: 'mock-file.ts',
                        action: 'modify',
                        additions: 1,
                        deletions: 0,
                    }], { riskLevel: 'low' }),
            ],
        };
        return this.createSuccess(patchSet, startTime);
    }
}
exports.StubAgent = StubAgent;
//# sourceMappingURL=base-agent.js.map