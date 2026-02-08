"use strict";
/**
 * Patch Generator
 *
 * Uses LLM to generate code patches based on tasks.
 * Replaces stub patches with real LLM-generated diffs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatchGenerator = exports.patchProposalSchema_ = void 0;
exports.toPrismaPatchData = toPrismaPatchData;
exports.patchAddsTests = patchAddsTests;
const schemas_1 = require("./schemas");
const patchProposalSchema = {
    type: 'object',
    required: ['taskId', 'title', 'summary', 'files', 'riskLevel'],
    properties: {
        taskId: { type: 'string' },
        title: { type: 'string', minLength: 5 },
        summary: { type: 'string', minLength: 10 },
        files: {
            type: 'array',
            items: {
                type: 'object',
                required: ['path', 'action'],
                properties: {
                    path: { type: 'string' },
                    action: { type: 'string', enum: ['create', 'modify', 'delete'] },
                    content: { type: 'string' },
                    diff: { type: 'string' },
                    additions: { type: 'number', minimum: 0 },
                    deletions: { type: 'number', minimum: 0 }
                }
            }
        },
        testSuggestions: { type: 'array', items: { type: 'string' } },
        riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
        proposedCommands: { type: 'array', items: { type: 'string' } }
    }
};
exports.patchProposalSchema_ = {
    name: 'patch_proposal',
    version: 'v1',
    description: 'Code patch proposal',
    schema: patchProposalSchema,
    validate: (data) => (0, schemas_1.validateSchema)(data, patchProposalSchema),
    parse: (rawContent) => (0, schemas_1.parseJSON)(rawContent)
};
class PatchGenerator {
    runner;
    useFallback;
    constructor(config) {
        this.runner = config.runner;
        this.useFallback = config.useFallback ?? true;
    }
    /**
     * Generate a patch for a single task.
     */
    async generatePatch(input) {
        const prompt = this.buildPatchPrompt(input);
        const response = await this.runner.run('coder', prompt, {
            schema: exports.patchProposalSchema_,
            context: { workflowId: input.workflowId, taskId: input.task.id }
        });
        if (response.success && response.data) {
            const proposal = response.data;
            // Generate unified diff for each file
            for (const file of proposal.files) {
                if (file.action === 'modify' && file.content) {
                    const existing = input.repoContext.existingFiles.find(f => f.path === file.path);
                    if (existing) {
                        file.originalContent = existing.content;
                        file.diff = this.generateUnifiedDiff(file.path, existing.content, file.content);
                    }
                }
                else if (file.action === 'create' && file.content) {
                    file.diff = this.generateUnifiedDiff(file.path, '', file.content);
                }
                else if (file.action === 'delete') {
                    const existing = input.repoContext.existingFiles.find(f => f.path === file.path);
                    if (existing) {
                        file.diff = this.generateUnifiedDiff(file.path, existing.content, '');
                    }
                }
                // Count additions/deletions
                if (file.diff) {
                    const lines = file.diff.split('\n');
                    file.additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
                    file.deletions = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
                }
            }
            // Combine all diffs
            const combinedDiff = proposal.files
                .filter(f => f.diff)
                .map(f => f.diff)
                .join('\n');
            return {
                success: true,
                proposal,
                diff: combinedDiff,
                metadata: {
                    promptVersion: response.metadata.promptVersion,
                    model: response.metadata.model,
                    latencyMs: response.metadata.latencyMs,
                    usedFallback: false
                }
            };
        }
        // Fallback to stub if enabled
        if (this.useFallback) {
            const fallback = this.createFallbackPatch(input);
            return {
                success: true,
                proposal: fallback.proposal,
                diff: fallback.diff,
                metadata: {
                    promptVersion: 'fallback',
                    model: 'stub',
                    latencyMs: 0,
                    usedFallback: true
                }
            };
        }
        return {
            success: false,
            error: response.error
        };
    }
    /**
     * Generate patches for all tasks in a plan.
     */
    async generatePatchesForPlan(workflowId, plan, repoContext) {
        const results = [];
        for (const task of plan.tasks) {
            const result = await this.generatePatch({
                workflowId,
                task,
                plan,
                repoContext
            });
            results.push(result);
        }
        return results;
    }
    // ============================================================================
    // Prompt Builder
    // ============================================================================
    buildPatchPrompt(input) {
        let prompt = `Generate code changes for the following task.

## Task
- ID: ${input.task.id}
- Title: ${input.task.title}
- Type: ${input.task.type}
- Description: ${input.task.description}
`;
        if (input.task.files?.length) {
            prompt += `\n- Target files: ${input.task.files.join(', ')}\n`;
        }
        if (input.task.acceptanceCriteria?.length) {
            prompt += '\n## Acceptance Criteria\n';
            for (const ac of input.task.acceptanceCriteria) {
                prompt += `- ${ac}\n`;
            }
        }
        prompt += `
## Plan Context
- Title: ${input.plan.title}
- Overview: ${input.plan.overview}
`;
        if (input.repoContext.existingFiles.length) {
            prompt += '\n## Existing Files\n';
            for (const file of input.repoContext.existingFiles.slice(0, 10)) {
                const ext = file.path.split('.').pop() ?? '';
                prompt += `\n### ${file.path}\n\`\`\`${ext}\n${file.content.slice(0, 3000)}\n\`\`\`\n`;
            }
        }
        prompt += `
## Output Format
Respond with a JSON object containing:
- taskId: The task ID
- title: Short title for the patch
- summary: Description of changes
- files: Array of files to change, each with:
  - path: File path
  - action: create | modify | delete
  - content: New file content (for create/modify)
- testSuggestions: Suggested tests to add
- riskLevel: low | medium | high
- proposedCommands: Commands to run after applying (e.g., npm test)
`;
        return prompt;
    }
    // ============================================================================
    // Diff Generator
    // ============================================================================
    generateUnifiedDiff(path, oldContent, newContent) {
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const lines = [
            `diff --git a/${path} b/${path}`,
            'index 0000000..1111111 100644',
            `--- a/${path}`,
            `+++ b/${path}`
        ];
        // Simple diff - show all changes in one hunk
        // For production, use a proper diff algorithm
        const maxLines = Math.max(oldLines.length, newLines.length);
        if (maxLines === 0) {
            return lines.join('\n');
        }
        lines.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
        for (const line of oldLines) {
            if (line || oldLines.length > 0) {
                lines.push(`-${line}`);
            }
        }
        for (const line of newLines) {
            if (line || newLines.length > 0) {
                lines.push(`+${line}`);
            }
        }
        return lines.join('\n');
    }
    // ============================================================================
    // Fallback
    // ============================================================================
    createFallbackPatch(input) {
        const diff = [
            `diff --git a/TODO.md b/TODO.md`,
            'index 0000000..1111111 100644',
            '--- a/TODO.md',
            '+++ b/TODO.md',
            '@@ -1 +1,3 @@',
            '+# TODO',
            '+',
            `+- [ ] ${input.task.title}: ${input.task.description}`,
            ''
        ].join('\n');
        return {
            proposal: {
                taskId: input.task.id,
                title: `Fallback: ${input.task.title}`,
                summary: 'LLM unavailable - created TODO entry instead of actual implementation',
                files: [
                    {
                        path: 'TODO.md',
                        action: 'modify',
                        content: `# TODO\n\n- [ ] ${input.task.title}: ${input.task.description}\n`,
                        diff,
                        additions: 3,
                        deletions: 0
                    }
                ],
                testSuggestions: [],
                riskLevel: 'low',
                proposedCommands: []
            },
            diff
        };
    }
}
exports.PatchGenerator = PatchGenerator;
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Convert patch proposal to Prisma Patch data format.
 */
function toPrismaPatchData(proposal) {
    return {
        taskId: proposal.taskId,
        title: proposal.title,
        summary: proposal.summary,
        diff: proposal.files.map(f => f.diff).filter(Boolean).join('\n'),
        files: proposal.files.map(f => ({
            path: f.path,
            additions: f.additions || 0,
            deletions: f.deletions || 0
        })),
        addsTests: proposal.testSuggestions.length > 0,
        riskLevel: proposal.riskLevel,
        proposedCommands: proposal.proposedCommands
    };
}
/**
 * Assess if a patch adds tests.
 */
function patchAddsTests(proposal) {
    return proposal.files.some(f => f.path.includes('.test.') ||
        f.path.includes('.spec.') ||
        f.path.includes('__tests__') ||
        f.path.startsWith('test/'));
}
//# sourceMappingURL=patch-generator.js.map