"use strict";
/**
 * Artifact Generator
 *
 * Uses LLM to generate workflow artifacts (decisions, plans, etc.)
 * Replaces stub artifacts with real LLM-generated content.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtifactGenerator = exports.planOutputSchema = exports.decisionOutputSchema = void 0;
const schemas_1 = require("./schemas");
const decisionSchema = {
    type: 'object',
    required: ['recommendation', 'summary', 'rationale', 'concerns', 'estimatedComplexity'],
    properties: {
        recommendation: { type: 'string', enum: ['PROCEED', 'DEFER', 'REJECT', 'CLARIFY'] },
        summary: { type: 'string', minLength: 20 },
        rationale: { type: 'string', minLength: 20 },
        concerns: { type: 'array', items: { type: 'string' } },
        prerequisites: { type: 'array', items: { type: 'string' } },
        estimatedComplexity: { type: 'string', enum: ['trivial', 'low', 'medium', 'high', 'very_high'] }
    }
};
exports.decisionOutputSchema = {
    name: 'decision',
    version: 'v1',
    description: 'Workflow decision artifact',
    schema: decisionSchema,
    validate: (data) => (0, schemas_1.validateSchema)(data, decisionSchema),
    parse: (rawContent) => (0, schemas_1.parseJSON)(rawContent)
};
const planSchema = {
    type: 'object',
    required: ['title', 'overview', 'tasks'],
    properties: {
        title: { type: 'string', minLength: 5 },
        overview: { type: 'string', minLength: 20 },
        tasks: {
            type: 'array',
            items: {
                type: 'object',
                required: ['id', 'title', 'description', 'type'],
                properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    type: { type: 'string', enum: ['feature', 'bugfix', 'refactor', 'test', 'docs'] },
                    files: { type: 'array', items: { type: 'string' } },
                    acceptanceCriteria: { type: 'array', items: { type: 'string' } }
                }
            }
        },
        dependencies: {
            type: 'array',
            items: {
                type: 'object',
                required: ['taskId', 'dependsOn'],
                properties: {
                    taskId: { type: 'string' },
                    dependsOn: { type: 'array', items: { type: 'string' } }
                }
            }
        },
        risks: {
            type: 'array',
            items: {
                type: 'object',
                required: ['description', 'severity', 'mitigation'],
                properties: {
                    description: { type: 'string' },
                    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                    mitigation: { type: 'string' }
                }
            }
        }
    }
};
exports.planOutputSchema = {
    name: 'plan',
    version: 'v1',
    description: 'Workflow plan artifact',
    schema: planSchema,
    validate: (data) => (0, schemas_1.validateSchema)(data, planSchema),
    parse: (rawContent) => (0, schemas_1.parseJSON)(rawContent)
};
class ArtifactGenerator {
    runner;
    useFallback;
    constructor(config) {
        this.runner = config.runner;
        this.useFallback = config.useFallback ?? true;
    }
    /**
     * Generate a Decision artifact.
     */
    async generateDecision(input) {
        const prompt = this.buildDecisionPrompt(input);
        const response = await this.runner.run('architect', prompt, {
            schema: exports.decisionOutputSchema,
            context: { workflowId: input.workflowId }
        });
        if (response.success && response.data) {
            return {
                success: true,
                artifact: response.data,
                markdown: this.formatDecisionMarkdown(response.data),
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
            const fallback = this.createFallbackDecision(input);
            return {
                success: true,
                artifact: fallback,
                markdown: this.formatDecisionMarkdown(fallback),
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
     * Generate a Plan artifact.
     */
    async generatePlan(input, decision) {
        const prompt = this.buildPlanPrompt(input, decision);
        const response = await this.runner.run('architect', prompt, {
            schema: exports.planOutputSchema,
            context: { workflowId: input.workflowId }
        });
        if (response.success && response.data) {
            return {
                success: true,
                artifact: response.data,
                markdown: this.formatPlanMarkdown(response.data),
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
            const fallback = this.createFallbackPlan(input);
            return {
                success: true,
                artifact: fallback,
                markdown: this.formatPlanMarkdown(fallback),
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
    // ============================================================================
    // Prompt Builders
    // ============================================================================
    buildDecisionPrompt(input) {
        let prompt = `Analyze the following issue and make a decision about how to proceed.

## Issue Content
${input.issueContent}
`;
        if (input.repoContext) {
            prompt += `
## Repository Context
- Owner: ${input.repoContext.owner}
- Repo: ${input.repoContext.repo}
- Base SHA: ${input.repoContext.baseSha}
`;
            if (input.repoContext.relevantFiles?.length) {
                prompt += '\n## Relevant Files\n';
                for (const file of input.repoContext.relevantFiles.slice(0, 5)) {
                    prompt += `\n### ${file.path}\n\`\`\`${file.language ?? ''}\n${file.content.slice(0, 2000)}\n\`\`\`\n`;
                }
            }
        }
        prompt += `
## Output Format
Respond with a JSON object containing:
- recommendation: PROCEED | DEFER | REJECT | CLARIFY
- summary: Brief summary of the issue
- rationale: Why this recommendation
- concerns: Array of concerns to address
- prerequisites: Optional array of things needed first
- estimatedComplexity: trivial | low | medium | high | very_high
`;
        return prompt;
    }
    buildPlanPrompt(input, decision) {
        return `Create an implementation plan based on the decision.

## Issue Content
${input.issueContent}

## Decision
- Recommendation: ${decision.recommendation}
- Summary: ${decision.summary}
- Complexity: ${decision.estimatedComplexity}
- Concerns: ${decision.concerns.join(', ')}

## Output Format
Respond with a JSON object containing:
- title: Plan title
- overview: High-level overview
- tasks: Array of tasks with id, title, description, type, files, acceptanceCriteria
- dependencies: Array of task dependencies
- risks: Array of risks with description, severity, mitigation
`;
    }
    // ============================================================================
    // Formatters
    // ============================================================================
    formatDecisionMarkdown(decision) {
        const lines = [
            '# Decision',
            '',
            `**Recommendation:** ${decision.recommendation}`,
            '',
            '## Summary',
            decision.summary,
            '',
            '## Rationale',
            decision.rationale,
            '',
            `**Estimated Complexity:** ${decision.estimatedComplexity}`,
            ''
        ];
        if (decision.concerns.length > 0) {
            lines.push('## Concerns');
            for (const concern of decision.concerns) {
                lines.push(`- ${concern}`);
            }
            lines.push('');
        }
        if (decision.prerequisites?.length) {
            lines.push('## Prerequisites');
            for (const prereq of decision.prerequisites) {
                lines.push(`- ${prereq}`);
            }
            lines.push('');
        }
        return lines.join('\n');
    }
    formatPlanMarkdown(plan) {
        const lines = [
            `# ${plan.title}`,
            '',
            plan.overview,
            '',
            '## Tasks',
            ''
        ];
        for (const task of plan.tasks) {
            lines.push(`### ${task.id}: ${task.title}`);
            lines.push(`**Type:** ${task.type}`);
            lines.push('');
            lines.push(task.description);
            lines.push('');
            if (task.files?.length) {
                lines.push('**Files:**');
                for (const file of task.files) {
                    lines.push(`- ${file}`);
                }
                lines.push('');
            }
            if (task.acceptanceCriteria?.length) {
                lines.push('**Acceptance Criteria:**');
                for (const ac of task.acceptanceCriteria) {
                    lines.push(`- [ ] ${ac}`);
                }
                lines.push('');
            }
        }
        if (plan.risks?.length) {
            lines.push('## Risks');
            lines.push('');
            for (const risk of plan.risks) {
                lines.push(`### ${risk.severity.toUpperCase()}: ${risk.description}`);
                lines.push(`**Mitigation:** ${risk.mitigation}`);
                lines.push('');
            }
        }
        return lines.join('\n');
    }
    // ============================================================================
    // Fallbacks
    // ============================================================================
    createFallbackDecision(input) {
        return {
            recommendation: 'DEFER',
            summary: 'Issue requires manual review - LLM processing unavailable',
            rationale: 'The LLM service was unavailable or returned an invalid response. This decision was generated as a fallback.',
            concerns: ['LLM service unavailable', 'Manual review required'],
            estimatedComplexity: 'medium'
        };
    }
    createFallbackPlan(input) {
        return {
            title: 'Fallback Plan - Manual Implementation Required',
            overview: 'This plan was generated as a fallback because the LLM service was unavailable.',
            tasks: [
                {
                    id: 'T1',
                    title: 'Review Issue Manually',
                    description: 'Review the issue content and determine implementation approach.',
                    type: 'feature',
                    files: [],
                    acceptanceCriteria: ['Issue understood', 'Approach documented']
                }
            ],
            dependencies: [],
            risks: [
                {
                    description: 'LLM service unavailable',
                    severity: 'low',
                    mitigation: 'Proceed with manual implementation'
                }
            ]
        };
    }
}
exports.ArtifactGenerator = ArtifactGenerator;
//# sourceMappingURL=artifact-generator.js.map