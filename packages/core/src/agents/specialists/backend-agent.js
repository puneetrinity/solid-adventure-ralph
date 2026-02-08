"use strict";
/**
 * Backend Agent
 *
 * Specialist agent for backend development: API endpoints, database operations,
 * services, middleware, and server-side logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendAgent = void 0;
const base_agent_1 = require("../base-agent");
// ============================================================================
// Backend Agent
// ============================================================================
class BackendAgent extends base_agent_1.BaseAgent {
    constructor(runner) {
        super({
            id: 'backend-agent',
            name: 'Backend Development Agent',
            type: 'backend',
            capabilities: {
                canGenerateCode: true,
                canGenerateTests: false,
                canReviewCode: false,
                canGenerateDocs: false,
                canRefactor: true,
                filePatterns: [
                    'src/**/*.ts',
                    'src/**/*.js',
                    'lib/**/*.ts',
                    'lib/**/*.js',
                    'api/**/*.ts',
                    'services/**/*.ts',
                    'controllers/**/*.ts',
                    'middleware/**/*.ts',
                    'routes/**/*.ts',
                    'models/**/*.ts',
                    'repositories/**/*.ts',
                    'prisma/**/*.prisma',
                    '**/*.sql',
                ],
                languages: ['typescript', 'javascript', 'sql', 'prisma'],
            },
            runner,
        });
    }
    describe() {
        return {
            summary: 'Specialist agent for backend development including APIs, databases, and services.',
            specialties: [
                'REST API endpoints',
                'GraphQL resolvers',
                'Database models and migrations',
                'Service layer logic',
                'Middleware and authentication',
                'Data validation',
                'Error handling',
            ],
            limitations: [
                'Does not handle frontend UI components',
                'Does not generate comprehensive test suites',
                'Does not handle DevOps or infrastructure',
            ],
            examples: [
                'Add a new API endpoint for user registration',
                'Create a database migration for orders table',
                'Implement a caching service',
                'Add authentication middleware',
            ],
        };
    }
    async validate(context) {
        const { task } = context;
        // Check if task type is suitable
        const suitableTypes = ['feature', 'bugfix', 'refactor'];
        if (!suitableTypes.includes(task.type)) {
            return {
                canHandle: false,
                confidence: 0,
                reason: `Backend agent does not handle ${task.type} tasks`,
                suggestedAgent: task.type === 'test' ? 'test' : task.type === 'docs' ? 'docs' : undefined,
            };
        }
        // Check if target files match backend patterns
        const backendKeywords = ['api', 'service', 'controller', 'model', 'route', 'middleware', 'db', 'database', 'prisma', 'repository'];
        const hasBackendFiles = task.targetFiles.some(file => backendKeywords.some(kw => file.toLowerCase().includes(kw)) ||
            this.canHandleFile(file));
        // Check task description for backend keywords
        const descriptionLower = task.description.toLowerCase();
        const backendDescKeywords = ['api', 'endpoint', 'database', 'service', 'backend', 'server', 'model', 'query', 'migration'];
        const hasBackendDescription = backendDescKeywords.some(kw => descriptionLower.includes(kw));
        if (hasBackendFiles || hasBackendDescription) {
            return {
                canHandle: true,
                confidence: hasBackendFiles && hasBackendDescription ? 0.95 : 0.75,
                reason: 'Task involves backend development',
            };
        }
        return {
            canHandle: true,
            confidence: 0.4,
            reason: 'Backend agent can attempt general TypeScript tasks',
        };
    }
    async propose(context) {
        const startTime = new Date();
        try {
            // If we have an LLM runner, use it for generation
            if (this.runner) {
                return await this.generateWithLLM(context, startTime);
            }
            // Otherwise, generate a structured stub proposal
            return this.generateStubProposal(context, startTime);
        }
        catch (error) {
            return this.createFailure(`Backend agent failed: ${error.message}`, startTime);
        }
    }
    async generateWithLLM(context, startTime) {
        const prompt = this.buildBackendPrompt(context);
        const response = await this.runner.run('coder', prompt, {
            context: { workflowId: context.workflowId },
        });
        if (!response.success) {
            return this.createFailure(response.error || 'LLM generation failed', startTime);
        }
        // Parse LLM response and create patch set
        // For now, return stub since we don't have full LLM integration
        return this.generateStubProposal(context, startTime);
    }
    buildBackendPrompt(context) {
        return `You are a backend development expert. Generate code changes for the following task:

## Task
**Title:** ${context.task.title}
**Description:** ${context.task.description}
**Type:** ${context.task.type}

## Target Files
${context.task.targetFiles.map(f => `- ${f}`).join('\n')}

## Acceptance Criteria
${context.task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

## Repository Context
- Owner: ${context.repo.owner}
- Repo: ${context.repo.repo}
- Base SHA: ${context.repo.baseSha}

## Instructions
1. Generate TypeScript/JavaScript code following best practices
2. Use proper error handling
3. Follow existing code patterns in the repository
4. Include type definitions
5. Keep changes minimal and focused

Respond with the code changes needed.`;
    }
    generateStubProposal(context, startTime) {
        const files = context.task.targetFiles.map(path => ({
            path,
            action: 'modify',
            additions: 10,
            deletions: 2,
        }));
        const diff = this.generateBackendStubDiff(context);
        const patchSet = {
            title: `Backend: ${context.task.title}`,
            description: `Backend implementation for: ${context.task.description}`,
            baseSha: context.repo.baseSha,
            patches: [
                this.createPatch(context.task.id, `Implement ${context.task.title}`, `Backend changes for ${context.task.type}: ${context.task.description}`, diff, files, {
                    riskLevel: this.assessRiskLevel(context),
                    commands: ['npm run build', 'npm test'],
                }),
            ],
        };
        return this.createSuccess(patchSet, startTime);
    }
    generateBackendStubDiff(context) {
        const mainFile = context.task.targetFiles[0] || 'src/services/service.ts';
        return `--- a/${mainFile}
+++ b/${mainFile}
@@ -1,5 +1,15 @@
+/**
+ * ${context.task.title}
+ *
+ * ${context.task.description}
+ */
+
 // Existing code...

+// TODO: Implement ${context.task.title}
+// Acceptance criteria:
+${context.task.acceptanceCriteria.map(c => `// - ${c}`).join('\n')}
+
 export class Service {
   // Implementation placeholder
 }`;
    }
    assessRiskLevel(context) {
        const highRiskKeywords = ['migration', 'delete', 'drop', 'security', 'auth', 'payment'];
        const mediumRiskKeywords = ['database', 'api', 'service', 'model'];
        const description = context.task.description.toLowerCase();
        const files = context.task.targetFiles.join(' ').toLowerCase();
        if (highRiskKeywords.some(kw => description.includes(kw) || files.includes(kw))) {
            return 'high';
        }
        if (mediumRiskKeywords.some(kw => description.includes(kw) || files.includes(kw))) {
            return 'medium';
        }
        return 'low';
    }
}
exports.BackendAgent = BackendAgent;
//# sourceMappingURL=backend-agent.js.map