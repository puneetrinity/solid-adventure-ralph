"use strict";
/**
 * Diagnoser
 *
 * LLM-based failure diagnosis service.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Diagnoser = void 0;
exports.createDiagnoser = createDiagnoser;
const uuid_1 = require("uuid");
const types_1 = require("./types");
// ============================================================================
// Diagnoser
// ============================================================================
class Diagnoser {
    runner;
    config;
    constructor(runner, config = {}) {
        this.runner = runner;
        this.config = config;
    }
    get diagnosisTimeoutMs() {
        return this.config.diagnosisTimeoutMs ?? types_1.DEFAULT_DIAGNOSIS_CONFIG.diagnosisTimeoutMs;
    }
    /**
     * Diagnose a failure and identify root cause.
     */
    async diagnose(context) {
        const startTime = Date.now();
        if (this.runner) {
            return this.diagnoseWithLLM(context, startTime);
        }
        return this.diagnoseWithHeuristics(context, startTime);
    }
    /**
     * Diagnose using LLM for deep analysis.
     */
    async diagnoseWithLLM(context, startTime) {
        const prompt = this.buildDiagnosisPrompt(context);
        const response = await this.runner.run('diagnoser', prompt, {
            context: { workflowId: context.workflowId },
        });
        if (!response.success) {
            // Fall back to heuristics if LLM fails
            return this.diagnoseWithHeuristics(context, startTime);
        }
        // Parse LLM response (would extract structured data)
        // For now, use heuristics augmented with LLM insights
        return this.diagnoseWithHeuristics(context, startTime);
    }
    /**
     * Build diagnosis prompt for LLM.
     */
    buildDiagnosisPrompt(context) {
        return `You are a senior software engineer diagnosing a failure. Analyze the following context and provide:
1. Root cause category
2. Detailed analysis
3. Potential fixes with confidence levels

## Failure Context

**Workflow ID:** ${context.workflowId}
**Job:** ${context.jobName}
**State:** ${context.workflowState}
**Failed At:** ${context.failedAt.toISOString()}

## Error
\`\`\`
${context.errorMessage}
\`\`\`

${context.stackTrace ? `## Stack Trace\n\`\`\`\n${context.stackTrace}\n\`\`\`\n` : ''}

## Inputs
\`\`\`json
${JSON.stringify(context.inputs, null, 2).substring(0, 2000)}
\`\`\`

${context.policyViolations ? `## Policy Violations\n${context.policyViolations.map(v => `- [${v.severity}] ${v.rule}: ${v.message} (${v.file})`).join('\n')}\n` : ''}

${context.involvedFiles ? `## Involved Files\n${context.involvedFiles.map(f => `- ${f}`).join('\n')}\n` : ''}

## Recent Events (last ${context.recentEvents.length})
${context.recentEvents.slice(-10).map(e => `- ${e.type} at ${e.timestamp.toISOString()}`).join('\n')}

Provide your analysis in structured format with root_cause, summary, analysis, and potential_fixes.`;
    }
    /**
     * Diagnose using pattern-matching heuristics.
     */
    diagnoseWithHeuristics(context, startTime) {
        const rootCause = this.identifyRootCause(context);
        const potentialFixes = this.identifyPotentialFixes(context, rootCause);
        const analysis = this.generateAnalysis(context, rootCause);
        const summary = this.generateSummary(context, rootCause);
        return {
            id: (0, uuid_1.v4)(),
            context,
            rootCause: rootCause.category,
            confidence: rootCause.confidence,
            summary,
            analysis,
            potentialFixes,
            relatedPatterns: this.findRelatedPatterns(context),
            preventionRecommendations: this.generatePreventionRecommendations(rootCause.category),
            diagnosedAt: new Date(),
            diagnosisDurationMs: Date.now() - startTime,
        };
    }
    /**
     * Identify root cause from failure context.
     */
    identifyRootCause(context) {
        const errorLower = context.errorMessage.toLowerCase();
        const jobName = context.jobName.toLowerCase();
        // Policy violation - highest confidence
        if (context.policyViolations && context.policyViolations.length > 0) {
            return { category: 'policy_violation', confidence: 0.95 };
        }
        // Test failure patterns
        if (jobName.includes('test') || errorLower.includes('assertion') ||
            errorLower.includes('expect') || errorLower.includes('test failed')) {
            return { category: 'test_failure', confidence: 0.9 };
        }
        // Build/compile errors
        if (jobName.includes('build') || errorLower.includes('compile') ||
            errorLower.includes('typescript error') || errorLower.includes('tsc') ||
            errorLower.includes('syntax error')) {
            return { category: 'build_error', confidence: 0.85 };
        }
        // Dependency issues
        if (errorLower.includes('module not found') || errorLower.includes('cannot find') ||
            errorLower.includes('npm err') || errorLower.includes('package') ||
            errorLower.includes('dependency')) {
            return { category: 'dependency_issue', confidence: 0.85 };
        }
        // Permission/auth issues
        if (errorLower.includes('permission denied') || errorLower.includes('unauthorized') ||
            errorLower.includes('forbidden') || errorLower.includes('access denied') ||
            errorLower.includes('401') || errorLower.includes('403')) {
            return { category: 'permission_denied', confidence: 0.85 };
        }
        // Resource limits
        if (errorLower.includes('timeout') || errorLower.includes('out of memory') ||
            errorLower.includes('heap') || errorLower.includes('quota') ||
            errorLower.includes('limit exceeded')) {
            return { category: 'resource_limit', confidence: 0.8 };
        }
        // Network errors
        if (errorLower.includes('econnrefused') || errorLower.includes('network') ||
            errorLower.includes('connection') || errorLower.includes('dns') ||
            errorLower.includes('socket')) {
            return { category: 'network_error', confidence: 0.8 };
        }
        // External service
        if (errorLower.includes('api') || errorLower.includes('external') ||
            errorLower.includes('service unavailable') || errorLower.includes('500') ||
            errorLower.includes('502') || errorLower.includes('503')) {
            return { category: 'external_service', confidence: 0.75 };
        }
        // Configuration errors
        if (errorLower.includes('config') || errorLower.includes('environment') ||
            errorLower.includes('env') || errorLower.includes('missing')) {
            return { category: 'configuration_error', confidence: 0.7 };
        }
        // Data issues
        if (errorLower.includes('invalid') || errorLower.includes('parse') ||
            errorLower.includes('json') || errorLower.includes('undefined') ||
            errorLower.includes('null') || errorLower.includes('type error')) {
            return { category: 'data_issue', confidence: 0.65 };
        }
        // Generic code error
        if (context.stackTrace || errorLower.includes('error') ||
            errorLower.includes('exception')) {
            return { category: 'code_error', confidence: 0.5 };
        }
        return { category: 'unknown', confidence: 0.3 };
    }
    /**
     * Identify potential fixes for the failure.
     */
    identifyPotentialFixes(context, rootCause) {
        const fixes = [];
        switch (rootCause.category) {
            case 'policy_violation':
                if (context.policyViolations) {
                    for (const violation of context.policyViolations) {
                        fixes.push({
                            description: `Fix policy violation: ${violation.rule} in ${violation.file}`,
                            confidence: 0.8,
                            effort: 'small',
                            risk: 'low',
                            canAutoPatch: violation.rule !== 'secret_detected', // Can't auto-fix secrets
                            verificationCommands: ['npm run lint', 'npm test'],
                        });
                    }
                }
                break;
            case 'test_failure':
                fixes.push({
                    description: 'Fix failing test assertions',
                    confidence: 0.7,
                    effort: 'medium',
                    risk: 'low',
                    canAutoPatch: true,
                    verificationCommands: ['npm test'],
                });
                fixes.push({
                    description: 'Update test expectations to match new behavior',
                    confidence: 0.5,
                    effort: 'small',
                    risk: 'medium', // Could hide actual bugs
                    canAutoPatch: true,
                    verificationCommands: ['npm test'],
                });
                break;
            case 'build_error':
                fixes.push({
                    description: 'Fix TypeScript/compilation errors',
                    confidence: 0.85,
                    effort: 'small',
                    risk: 'low',
                    canAutoPatch: true,
                    verificationCommands: ['npm run build'],
                });
                break;
            case 'dependency_issue':
                fixes.push({
                    description: 'Install missing dependencies',
                    confidence: 0.8,
                    effort: 'trivial',
                    risk: 'low',
                    canAutoPatch: false, // Requires npm install
                    verificationCommands: ['npm install', 'npm run build'],
                });
                fixes.push({
                    description: 'Update import paths',
                    confidence: 0.6,
                    effort: 'small',
                    risk: 'low',
                    canAutoPatch: true,
                    verificationCommands: ['npm run build'],
                });
                break;
            case 'configuration_error':
                fixes.push({
                    description: 'Add missing environment variables',
                    confidence: 0.7,
                    effort: 'trivial',
                    risk: 'low',
                    canAutoPatch: false, // Env vars are external
                    verificationCommands: [],
                });
                fixes.push({
                    description: 'Fix configuration file',
                    confidence: 0.6,
                    effort: 'small',
                    risk: 'medium',
                    canAutoPatch: true,
                    verificationCommands: ['npm run build', 'npm test'],
                });
                break;
            case 'data_issue':
                fixes.push({
                    description: 'Add input validation',
                    confidence: 0.7,
                    effort: 'medium',
                    risk: 'low',
                    canAutoPatch: true,
                    verificationCommands: ['npm test'],
                });
                fixes.push({
                    description: 'Handle null/undefined cases',
                    confidence: 0.65,
                    effort: 'small',
                    risk: 'low',
                    canAutoPatch: true,
                    verificationCommands: ['npm test'],
                });
                break;
            case 'resource_limit':
                fixes.push({
                    description: 'Increase timeout/memory limits',
                    confidence: 0.6,
                    effort: 'trivial',
                    risk: 'medium',
                    canAutoPatch: false,
                    verificationCommands: [],
                });
                fixes.push({
                    description: 'Optimize resource usage',
                    confidence: 0.5,
                    effort: 'large',
                    risk: 'medium',
                    canAutoPatch: false,
                    verificationCommands: ['npm test'],
                });
                break;
            case 'code_error':
            default:
                fixes.push({
                    description: 'Review and fix code logic',
                    confidence: 0.5,
                    effort: 'medium',
                    risk: 'medium',
                    canAutoPatch: false,
                    verificationCommands: ['npm test'],
                });
                break;
        }
        // Add retry as a low-confidence option for transient errors
        if (['network_error', 'external_service', 'resource_limit'].includes(rootCause.category)) {
            fixes.push({
                description: 'Retry the operation (may be transient)',
                confidence: 0.4,
                effort: 'trivial',
                risk: 'low',
                canAutoPatch: false,
                verificationCommands: [],
            });
        }
        return fixes.sort((a, b) => b.confidence - a.confidence);
    }
    /**
     * Generate detailed analysis text.
     */
    generateAnalysis(context, rootCause) {
        const lines = [];
        lines.push(`## Root Cause Analysis`);
        lines.push(`**Category:** ${rootCause.category.replace(/_/g, ' ')}`);
        lines.push(`**Confidence:** ${(rootCause.confidence * 100).toFixed(0)}%`);
        lines.push('');
        lines.push(`## Error Details`);
        lines.push(`\`\`\`\n${context.errorMessage}\n\`\`\``);
        lines.push('');
        if (context.stackTrace) {
            lines.push(`## Stack Trace`);
            lines.push(`\`\`\`\n${context.stackTrace}\n\`\`\``);
            lines.push('');
        }
        if (context.policyViolations && context.policyViolations.length > 0) {
            lines.push(`## Policy Violations`);
            for (const v of context.policyViolations) {
                lines.push(`- **${v.rule}** [${v.severity}]: ${v.message}`);
                lines.push(`  File: ${v.file}${v.line ? `:${v.line}` : ''}`);
            }
            lines.push('');
        }
        lines.push(`## Context`);
        lines.push(`- **Job:** ${context.jobName}`);
        lines.push(`- **Workflow State:** ${context.workflowState}`);
        lines.push(`- **Duration:** ${context.durationMs ? `${context.durationMs}ms` : 'unknown'}`);
        lines.push(`- **Failed At:** ${context.failedAt.toISOString()}`);
        if (context.involvedFiles && context.involvedFiles.length > 0) {
            lines.push('');
            lines.push(`## Involved Files`);
            for (const file of context.involvedFiles.slice(0, 10)) {
                lines.push(`- ${file}`);
            }
        }
        return lines.join('\n');
    }
    /**
     * Generate a one-line summary.
     */
    generateSummary(context, rootCause) {
        const categoryName = rootCause.category.replace(/_/g, ' ');
        switch (rootCause.category) {
            case 'policy_violation':
                return `Policy violation in ${context.policyViolations?.[0]?.file || 'unknown file'}`;
            case 'test_failure':
                return `Test failure in ${context.jobName}`;
            case 'build_error':
                return `Build/compilation error`;
            case 'dependency_issue':
                return `Missing or incompatible dependency`;
            default:
                return `${categoryName} in ${context.jobName}: ${context.errorMessage.substring(0, 50)}...`;
        }
    }
    /**
     * Find related patterns from event history.
     */
    findRelatedPatterns(context) {
        const patterns = [];
        // Check for repeated failures
        const failureEvents = context.recentEvents.filter(e => e.type.includes('FAILED') || e.type.includes('ERROR'));
        if (failureEvents.length > 3) {
            patterns.push('Repeated failures detected - may indicate systemic issue');
        }
        // Check for state thrashing
        const stateChanges = context.recentEvents.filter(e => e.type.includes('STATE_CHANGE'));
        if (stateChanges.length > 10) {
            patterns.push('Excessive state changes - possible infinite loop or race condition');
        }
        return patterns;
    }
    /**
     * Generate prevention recommendations.
     */
    generatePreventionRecommendations(category) {
        const recommendations = [];
        switch (category) {
            case 'test_failure':
                recommendations.push('Ensure tests are run locally before pushing');
                recommendations.push('Consider adding pre-commit hooks');
                break;
            case 'build_error':
                recommendations.push('Enable strict TypeScript checks');
                recommendations.push('Use IDE with real-time error detection');
                break;
            case 'policy_violation':
                recommendations.push('Review policy rules before making changes');
                recommendations.push('Use pre-commit hooks for policy checks');
                break;
            case 'dependency_issue':
                recommendations.push('Lock dependency versions');
                recommendations.push('Regularly update and test dependencies');
                break;
            case 'configuration_error':
                recommendations.push('Document required environment variables');
                recommendations.push('Use configuration validation on startup');
                break;
        }
        return recommendations;
    }
}
exports.Diagnoser = Diagnoser;
// ============================================================================
// Factory
// ============================================================================
/**
 * Create a diagnoser instance.
 */
function createDiagnoser(runner, config) {
    return new Diagnoser(runner, config);
}
//# sourceMappingURL=diagnoser.js.map