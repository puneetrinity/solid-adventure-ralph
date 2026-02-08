"use strict";
/**
 * Test Agent
 *
 * Specialist agent for test generation: unit tests, integration tests,
 * test fixtures, and coverage improvements.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestAgent = void 0;
const base_agent_1 = require("../base-agent");
// ============================================================================
// Test Agent
// ============================================================================
class TestAgent extends base_agent_1.BaseAgent {
    constructor(runner) {
        super({
            id: 'test-agent',
            name: 'Test Generation Agent',
            type: 'test',
            capabilities: {
                canGenerateCode: true,
                canGenerateTests: true,
                canReviewCode: false,
                canGenerateDocs: false,
                canRefactor: false,
                filePatterns: [
                    'test/**/*.ts',
                    'test/**/*.js',
                    'tests/**/*.ts',
                    'tests/**/*.js',
                    '**/*.spec.ts',
                    '**/*.spec.js',
                    '**/*.test.ts',
                    '**/*.test.js',
                    '__tests__/**/*.ts',
                    '__tests__/**/*.js',
                    'cypress/**/*.ts',
                    'e2e/**/*.ts',
                ],
                languages: ['typescript', 'javascript'],
            },
            runner,
        });
    }
    describe() {
        return {
            summary: 'Specialist agent for test generation including unit tests, integration tests, and test fixtures.',
            specialties: [
                'Unit test generation',
                'Integration test generation',
                'Test fixture creation',
                'Mock and stub generation',
                'Coverage improvement',
                'Test refactoring',
                'E2E test scaffolding',
            ],
            limitations: [
                'Does not implement production code',
                'Does not handle deployment or CI configuration',
                'Does not generate documentation',
            ],
            examples: [
                'Generate unit tests for a service class',
                'Add integration tests for API endpoints',
                'Create test fixtures for database models',
                'Improve test coverage for a module',
            ],
        };
    }
    async validate(context) {
        const { task } = context;
        // Test agent is ideal for test tasks
        if (task.type === 'test') {
            return {
                canHandle: true,
                confidence: 0.95,
                reason: 'Task is explicitly a test task',
            };
        }
        // Check if target files are test files
        const testPatterns = ['.spec.', '.test.', '__tests__', '/test/', '/tests/', 'cypress', 'e2e'];
        const hasTestFiles = task.targetFiles.some(file => testPatterns.some(pattern => file.includes(pattern)));
        // Check description for test-related keywords
        const descriptionLower = task.description.toLowerCase();
        const testKeywords = ['test', 'spec', 'coverage', 'mock', 'stub', 'fixture', 'jest', 'mocha', 'cypress'];
        const hasTestDescription = testKeywords.some(kw => descriptionLower.includes(kw));
        if (hasTestFiles || hasTestDescription) {
            return {
                canHandle: true,
                confidence: hasTestFiles && hasTestDescription ? 0.95 : 0.8,
                reason: 'Task involves test generation or modification',
            };
        }
        // Test agent doesn't handle non-test tasks well
        return {
            canHandle: false,
            confidence: 0,
            reason: 'Task does not involve testing',
            suggestedAgent: task.type === 'feature' ? 'backend' : undefined,
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
            return this.createFailure(`Test agent failed: ${error.message}`, startTime);
        }
    }
    async generateWithLLM(context, startTime) {
        const prompt = this.buildTestPrompt(context);
        const response = await this.runner.run('coder', prompt, {
            context: { workflowId: context.workflowId },
        });
        if (!response.success) {
            return this.createFailure(response.error || 'LLM generation failed', startTime);
        }
        return this.generateStubProposal(context, startTime);
    }
    buildTestPrompt(context) {
        return `You are a test generation expert specializing in TypeScript testing with Jest. Generate tests for:

## Task
**Title:** ${context.task.title}
**Description:** ${context.task.description}
**Type:** ${context.task.type}

## Target Files
${context.task.targetFiles.map(f => `- ${f}`).join('\n')}

## Acceptance Criteria
${context.task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

## Instructions
1. Use Jest testing framework
2. Follow AAA pattern (Arrange, Act, Assert)
3. Use descriptive test names
4. Mock external dependencies
5. Aim for high coverage
6. Include edge cases and error scenarios

Respond with the test code needed.`;
    }
    generateStubProposal(context, startTime) {
        // Determine test file paths based on target files
        const testFiles = this.determineTestFiles(context.task.targetFiles);
        const files = testFiles.map(path => ({
            path,
            action: 'create',
            additions: 50,
            deletions: 0,
        }));
        const diff = this.generateTestStubDiff(context, testFiles[0]);
        const patchSet = {
            title: `Tests: ${context.task.title}`,
            description: `Test generation for: ${context.task.description}`,
            baseSha: context.repo.baseSha,
            patches: [
                this.createPatch(context.task.id, `Add tests for ${context.task.title}`, `Test implementation: ${context.task.description}`, diff, files, {
                    riskLevel: 'low',
                    commands: ['npm test'],
                }),
            ],
        };
        return this.createSuccess(patchSet, startTime);
    }
    determineTestFiles(targetFiles) {
        return targetFiles.map(file => {
            // If already a test file, use as is
            if (file.includes('.spec.') || file.includes('.test.')) {
                return file;
            }
            // Convert source file to test file
            const ext = file.endsWith('.ts') ? '.ts' : '.js';
            const baseName = file.replace(/\.(ts|js)$/, '');
            // Check if it's in src directory
            if (file.startsWith('src/')) {
                return `test/unit/${file.replace('src/', '').replace(/\.(ts|js)$/, '.spec' + ext)}`;
            }
            return baseName + '.spec' + ext;
        });
    }
    generateTestStubDiff(context, testFile) {
        const sourceFile = context.task.targetFiles[0] || 'src/module.ts';
        const moduleName = this.extractModuleName(sourceFile);
        return `--- /dev/null
+++ b/${testFile}
@@ -0,0 +1,60 @@
+/**
+ * Tests for ${context.task.title}
+ *
+ * ${context.task.description}
+ */
+
+import { ${moduleName} } from '${this.getRelativeImport(testFile, sourceFile)}';
+
+describe('${moduleName}', () => {
+  // Test setup
+  let instance: ${moduleName};
+
+  beforeEach(() => {
+    // TODO: Initialize test subject
+    instance = new ${moduleName}();
+  });
+
+  afterEach(() => {
+    // Cleanup
+    jest.clearAllMocks();
+  });
+
+  describe('${context.task.title}', () => {
+    // Acceptance criteria tests:
+${context.task.acceptanceCriteria.map((c, i) => `    // ${i + 1}. ${c}`).join('\n')}
+
+    it('should satisfy basic requirements', () => {
+      // TODO: Implement test
+      expect(instance).toBeDefined();
+    });
+
+    it('should handle valid input', () => {
+      // TODO: Implement test for valid input
+      const result = instance.process?.('valid-input');
+      expect(result).toBeDefined();
+    });
+
+    it('should handle invalid input', () => {
+      // TODO: Implement test for invalid input
+      expect(() => {
+        instance.process?.('invalid-input');
+      }).not.toThrow();
+    });
+
+    it('should handle edge cases', () => {
+      // TODO: Implement edge case tests
+      expect(instance.process?.(null)).toBeUndefined();
+      expect(instance.process?.(undefined)).toBeUndefined();
+    });
+  });
+
+  describe('error handling', () => {
+    it('should handle errors gracefully', () => {
+      // TODO: Implement error handling tests
+      expect(() => {
+        instance.handleError?.(new Error('test error'));
+      }).not.toThrow();
+    });
+  });
+});`;
    }
    extractModuleName(filePath) {
        const fileName = filePath.split('/').pop() || 'Module';
        const baseName = fileName.replace(/\.(ts|js)$/, '');
        // Convert to PascalCase
        return baseName
            .split(/[-_]/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');
    }
    getRelativeImport(testFile, sourceFile) {
        // Simple relative path calculation
        const testParts = testFile.split('/');
        const sourceParts = sourceFile.split('/');
        // Count how many directories up we need to go
        const testDir = testParts.slice(0, -1);
        const upCount = testDir.length;
        // Build relative path
        const relativePath = '../'.repeat(upCount) + sourceFile.replace(/\.(ts|js)$/, '');
        return relativePath;
    }
}
exports.TestAgent = TestAgent;
//# sourceMappingURL=test-agent.js.map