/**
 * Review Agent
 *
 * Specialist agent for code review: quality assessment, best practices,
 * security review, and improvement suggestions.
 */

import {
  AgentDescription,
  AgentContext,
  AgentValidationResult,
  ProposalResult,
  PatchSetProposal,
  AgentPatchFile,
} from '../types';
import { BaseAgent } from '../base-agent';
import type { LLMRunner } from '../../llm';

// ============================================================================
// Review Finding Types
// ============================================================================

export interface ReviewFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: ReviewCategory;
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export type ReviewCategory =
  | 'security'
  | 'performance'
  | 'maintainability'
  | 'reliability'
  | 'best-practice'
  | 'style'
  | 'documentation';

export interface ReviewResult {
  findings: ReviewFinding[];
  summary: string;
  overallScore: number; // 0-100
  recommendations: string[];
}

// ============================================================================
// Review Agent
// ============================================================================

export class ReviewAgent extends BaseAgent {
  constructor(runner?: LLMRunner) {
    super({
      id: 'review-agent',
      name: 'Code Review Agent',
      type: 'review',
      capabilities: {
        canGenerateCode: true,
        canGenerateTests: false,
        canReviewCode: true,
        canGenerateDocs: false,
        canRefactor: true,
        filePatterns: [
          '**/*.ts',
          '**/*.tsx',
          '**/*.js',
          '**/*.jsx',
          '**/*.py',
          '**/*.go',
          '**/*.java',
          '**/*.rs',
        ],
        languages: ['typescript', 'javascript', 'python', 'go', 'java', 'rust'],
      },
      runner,
    });
  }

  describe(): AgentDescription {
    return {
      summary: 'Specialist agent for code review including quality, security, and best practices analysis.',
      specialties: [
        'Code quality assessment',
        'Security vulnerability detection',
        'Performance analysis',
        'Best practices enforcement',
        'Code smell detection',
        'Maintainability review',
        'Documentation review',
      ],
      limitations: [
        'Does not implement new features from scratch',
        'Does not generate comprehensive test suites',
        'Does not handle infrastructure or DevOps',
      ],
      examples: [
        'Review a pull request for security issues',
        'Analyze code quality of a module',
        'Suggest performance improvements',
        'Check for coding standard compliance',
      ],
    };
  }

  async validate(context: AgentContext): Promise<AgentValidationResult> {
    const { task } = context;

    // Review agent handles review-related tasks via description

    // Check description for review-related keywords
    const descriptionLower = task.description.toLowerCase();
    const reviewKeywords = [
      'review', 'audit', 'analyze', 'check', 'assess', 'evaluate',
      'security', 'vulnerability', 'quality', 'best practice', 'code smell'
    ];
    const hasReviewDescription = reviewKeywords.some(kw => descriptionLower.includes(kw));

    if (hasReviewDescription) {
      return {
        canHandle: true,
        confidence: 0.85,
        reason: 'Task involves code review or analysis',
      };
    }

    // Review agent can also help with refactoring by identifying issues
    if (task.type === 'refactor') {
      return {
        canHandle: true,
        confidence: 0.6,
        reason: 'Review agent can identify refactoring opportunities',
      };
    }

    return {
      canHandle: false,
      confidence: 0,
      reason: 'Task does not involve code review',
      suggestedAgent: undefined,
    };
  }

  async propose(context: AgentContext): Promise<ProposalResult> {
    const startTime = new Date();

    try {
      if (this.runner) {
        return await this.generateWithLLM(context, startTime);
      }
      return this.generateStubProposal(context, startTime);
    } catch (error) {
      return this.createFailure(
        `Review agent failed: ${(error as Error).message}`,
        startTime
      );
    }
  }

  private async generateWithLLM(
    context: AgentContext,
    startTime: Date
  ): Promise<ProposalResult> {
    const prompt = this.buildReviewPrompt(context);

    const response = await this.runner!.run('coder', prompt, {
      context: { workflowId: context.workflowId },
    });

    if (!response.success) {
      return this.createFailure(response.error || 'LLM generation failed', startTime);
    }

    return this.generateStubProposal(context, startTime);
  }

  private buildReviewPrompt(context: AgentContext): string {
    return `You are a senior code reviewer. Review the following code and provide improvement suggestions:

## Task
**Title:** ${context.task.title}
**Description:** ${context.task.description}
**Type:** ${context.task.type}

## Files to Review
${context.task.targetFiles.map(f => `- ${f}`).join('\n')}

## Review Criteria
${context.task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

## Instructions
1. Check for security vulnerabilities (OWASP Top 10)
2. Assess code quality and maintainability
3. Identify performance issues
4. Verify best practices compliance
5. Suggest concrete improvements

For each finding, provide:
- Severity (critical/high/medium/low/info)
- Category (security/performance/maintainability/reliability/best-practice/style)
- File and line number
- Description and suggested fix

Respond with the code improvements as patches.`;
  }

  private generateStubProposal(
    context: AgentContext,
    startTime: Date
  ): ProposalResult {
    const files: AgentPatchFile[] = context.task.targetFiles.map(path => ({
      path,
      action: 'modify' as const,
      additions: 5,
      deletions: 5,
    }));

    const review = this.generateStubReview(context);
    const diff = this.generateReviewDiff(context, review);

    const patchSet: PatchSetProposal = {
      title: `Review: ${context.task.title}`,
      description: `Code review improvements for: ${context.task.description}\n\n${review.summary}`,
      baseSha: context.repo.baseSha,
      patches: [
        this.createPatch(
          context.task.id,
          `Review improvements for ${context.task.title}`,
          `Code quality improvements based on review findings:\n${review.recommendations.map(r => `- ${r}`).join('\n')}`,
          diff,
          files,
          {
            riskLevel: this.determineRiskFromFindings(review.findings),
            commands: ['npm run lint', 'npm test'],
          }
        ),
      ],
    };

    return this.createSuccess(patchSet, startTime);
  }

  private generateStubReview(context: AgentContext): ReviewResult {
    const findings: ReviewFinding[] = [
      {
        severity: 'medium',
        category: 'maintainability',
        file: context.task.targetFiles[0] || 'src/module.ts',
        line: 10,
        message: 'Consider extracting complex logic into a separate function',
        suggestion: 'Create a helper function to improve readability',
      },
      {
        severity: 'low',
        category: 'best-practice',
        file: context.task.targetFiles[0] || 'src/module.ts',
        line: 25,
        message: 'Missing error handling for async operation',
        suggestion: 'Add try-catch block or error boundary',
      },
      {
        severity: 'info',
        category: 'documentation',
        file: context.task.targetFiles[0] || 'src/module.ts',
        line: 1,
        message: 'Missing JSDoc comments for public API',
        suggestion: 'Add documentation for exported functions',
      },
    ];

    return {
      findings,
      summary: `Review completed with ${findings.length} findings`,
      overallScore: 75,
      recommendations: [
        'Add error handling for edge cases',
        'Improve code documentation',
        'Consider extracting complex logic',
      ],
    };
  }

  private generateReviewDiff(context: AgentContext, review: ReviewResult): string {
    const mainFile = context.task.targetFiles[0] || 'src/module.ts';

    return `--- a/${mainFile}
+++ b/${mainFile}
@@ -1,10 +1,20 @@
+/**
+ * ${context.task.title}
+ *
+ * Review improvements applied based on:
+${review.recommendations.map(r => ` * - ${r}`).join('\n')}
+ */
+
 // Existing code...

-function process(data) {
-  return data.map(item => item.value);
+/**
+ * Process data with proper error handling
+ * @param data - Input data array
+ * @returns Processed values
+ */
+function process(data: unknown[]): unknown[] {
+  if (!Array.isArray(data)) {
+    throw new Error('Invalid input: expected array');
+  }
+  return data.map(item => (item as Record<string, unknown>).value);
 }`;
  }

  private determineRiskFromFindings(findings: ReviewFinding[]): 'low' | 'medium' | 'high' {
    const hasCritical = findings.some(f => f.severity === 'critical');
    const hasHigh = findings.some(f => f.severity === 'high');
    const hasSecurity = findings.some(f => f.category === 'security');

    if (hasCritical || hasSecurity) {
      return 'high';
    }
    if (hasHigh) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Perform a standalone review without generating patches
   */
  async review(context: AgentContext): Promise<ReviewResult> {
    if (this.runner) {
      // Would use LLM for real review
      // For now, return stub
    }
    return this.generateStubReview(context);
  }
}
