"use strict";
/**
 * Frontend Agent
 *
 * Specialist agent for frontend development: UI components, styling,
 * client-side logic, and user interactions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrontendAgent = void 0;
const base_agent_1 = require("../base-agent");
// ============================================================================
// Frontend Agent
// ============================================================================
class FrontendAgent extends base_agent_1.BaseAgent {
    constructor(runner) {
        super({
            id: 'frontend-agent',
            name: 'Frontend Development Agent',
            type: 'frontend',
            capabilities: {
                canGenerateCode: true,
                canGenerateTests: false,
                canReviewCode: false,
                canGenerateDocs: false,
                canRefactor: true,
                filePatterns: [
                    'src/**/*.tsx',
                    'src/**/*.jsx',
                    'components/**/*.tsx',
                    'components/**/*.jsx',
                    'pages/**/*.tsx',
                    'pages/**/*.jsx',
                    'app/**/*.tsx',
                    'views/**/*.tsx',
                    '**/*.css',
                    '**/*.scss',
                    '**/*.less',
                    '**/*.module.css',
                    '**/*.styled.ts',
                    'hooks/**/*.ts',
                    'context/**/*.tsx',
                    'store/**/*.ts',
                ],
                languages: ['typescript', 'javascript', 'css', 'scss', 'html'],
            },
            runner,
        });
    }
    describe() {
        return {
            summary: 'Specialist agent for frontend development including React components, styling, and UI logic.',
            specialties: [
                'React components (functional and class)',
                'CSS/SCSS styling',
                'State management (hooks, context, Redux)',
                'Form handling and validation',
                'Responsive design',
                'Accessibility (a11y)',
                'UI animations',
            ],
            limitations: [
                'Does not handle backend APIs or databases',
                'Does not generate comprehensive test suites',
                'Does not handle build/deployment configuration',
            ],
            examples: [
                'Create a user profile component',
                'Add responsive styling to a dashboard',
                'Implement a form with validation',
                'Add dark mode toggle',
            ],
        };
    }
    async validate(context) {
        const { task } = context;
        // Check task type
        const suitableTypes = ['feature', 'bugfix', 'refactor'];
        if (!suitableTypes.includes(task.type)) {
            return {
                canHandle: false,
                confidence: 0,
                reason: `Frontend agent does not handle ${task.type} tasks`,
                suggestedAgent: task.type === 'test' ? 'test' : undefined,
            };
        }
        // Check for frontend file patterns
        const frontendExtensions = ['.tsx', '.jsx', '.css', '.scss', '.vue', '.svelte'];
        const frontendKeywords = ['component', 'ui', 'page', 'view', 'style', 'hook', 'context', 'store', 'frontend'];
        const hasFrontendFiles = task.targetFiles.some(file => frontendExtensions.some(ext => file.endsWith(ext)) ||
            frontendKeywords.some(kw => file.toLowerCase().includes(kw)));
        // Check description
        const descriptionLower = task.description.toLowerCase();
        const frontendDescKeywords = ['component', 'ui', 'button', 'form', 'modal', 'style', 'responsive', 'frontend', 'react', 'vue'];
        const hasFrontendDescription = frontendDescKeywords.some(kw => descriptionLower.includes(kw));
        if (hasFrontendFiles || hasFrontendDescription) {
            return {
                canHandle: true,
                confidence: hasFrontendFiles && hasFrontendDescription ? 0.95 : 0.75,
                reason: 'Task involves frontend development',
            };
        }
        return {
            canHandle: true,
            confidence: 0.3,
            reason: 'Frontend agent can attempt general UI tasks',
        };
    }
    async propose(context) {
        const startTime = new Date();
        try {
            if (this.runner) {
                return await this.generateWithLLM(context, startTime);
            }
            return this.generateStubProposal(context, startTime);
        }
        catch (error) {
            return this.createFailure(`Frontend agent failed: ${error.message}`, startTime);
        }
    }
    async generateWithLLM(context, startTime) {
        const prompt = this.buildFrontendPrompt(context);
        const response = await this.runner.run('coder', prompt, {
            context: { workflowId: context.workflowId },
        });
        if (!response.success) {
            return this.createFailure(response.error || 'LLM generation failed', startTime);
        }
        return this.generateStubProposal(context, startTime);
    }
    buildFrontendPrompt(context) {
        return `You are a frontend development expert specializing in React and TypeScript. Generate code changes for:

## Task
**Title:** ${context.task.title}
**Description:** ${context.task.description}
**Type:** ${context.task.type}

## Target Files
${context.task.targetFiles.map(f => `- ${f}`).join('\n')}

## Acceptance Criteria
${context.task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

## Instructions
1. Use React functional components with hooks
2. Follow accessibility best practices
3. Use proper TypeScript types
4. Keep components small and focused
5. Use CSS modules or styled-components for styling

Respond with the code changes needed.`;
    }
    generateStubProposal(context, startTime) {
        const files = context.task.targetFiles.map(path => ({
            path,
            action: 'modify',
            additions: 15,
            deletions: 3,
        }));
        const diff = this.generateFrontendStubDiff(context);
        const patchSet = {
            title: `Frontend: ${context.task.title}`,
            description: `Frontend implementation for: ${context.task.description}`,
            baseSha: context.repo.baseSha,
            patches: [
                this.createPatch(context.task.id, `Implement ${context.task.title}`, `Frontend UI changes for: ${context.task.description}`, diff, files, {
                    riskLevel: 'low',
                    commands: ['npm run build', 'npm run lint'],
                }),
            ],
        };
        return this.createSuccess(patchSet, startTime);
    }
    generateFrontendStubDiff(context) {
        const mainFile = context.task.targetFiles[0] || 'src/components/Component.tsx';
        return `--- a/${mainFile}
+++ b/${mainFile}
@@ -1,5 +1,25 @@
+/**
+ * ${context.task.title}
+ *
+ * ${context.task.description}
+ */
+
 import React from 'react';
+import styles from './Component.module.css';

-export const Component = () => {
-  return <div>Component</div>;
+interface ComponentProps {
+  // TODO: Define props
+}
+
+export const Component: React.FC<ComponentProps> = (props) => {
+  // TODO: Implement ${context.task.title}
+  // Acceptance criteria:
+${context.task.acceptanceCriteria.map(c => `  // - ${c}`).join('\n')}
+
+  return (
+    <div className={styles.container}>
+      {/* Implementation placeholder */}
+    </div>
+  );
 };`;
    }
}
exports.FrontendAgent = FrontendAgent;
//# sourceMappingURL=frontend-agent.js.map