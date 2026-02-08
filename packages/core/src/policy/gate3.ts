/**
 * Gate3 - CI & Quality Gates Evaluation
 *
 * This module handles:
 * 1. Mapping CI events to workflow state changes
 * 2. Evaluating quality gates (CI, coverage, etc.)
 * 3. Recording CI evidence (logs, artifacts)
 * 4. Triggering transitions to terminal states (DONE / NEEDS_HUMAN)
 */

import type { PrismaClient } from '@prisma/client';
import type { TransitionEvent } from '../workflow/states';

// ============================================================================
// Types
// ============================================================================

export type CIConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'neutral' | 'timed_out' | 'action_required';

export type CIEventSource = 'check_suite' | 'workflow_run' | 'check_run' | 'status';

export interface CIEventInput {
  source: CIEventSource;
  conclusion: CIConclusion;
  headSha: string;
  owner: string;
  repo: string;
  webhookId?: string;

  // Source-specific IDs
  checkSuiteId?: number;
  workflowRunId?: number;
  checkRunId?: number;

  // Optional metadata
  name?: string;
  url?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface QualityGate {
  name: string;
  required: boolean;
  evaluator: (evidence: CIEvidence) => QualityGateResult;
}

export interface QualityGateResult {
  name: string;
  passed: boolean;
  reason: string;
  evidence?: any;
}

export interface CIEvidence {
  workflowId: string;
  prNumber?: number;
  headSha: string;

  // CI results
  ciConclusion: CIConclusion;
  ciSource: CIEventSource;
  ciCompletedAt: Date;

  // Evidence links
  checkSuiteUrl?: string;
  workflowRunUrl?: string;
  commitUrl?: string;

  // Quality gate results
  gateResults: QualityGateResult[];
}

export interface Gate3Result {
  workflowId: string;
  passed: boolean;
  ciConclusion: CIConclusion;
  gateResults: QualityGateResult[];
  evidence: CIEvidence;
  transitionEvent: TransitionEvent;
}

// ============================================================================
// Default Quality Gates
// ============================================================================

export const defaultQualityGates: QualityGate[] = [
  {
    name: 'ci_pass',
    required: true,
    evaluator: (evidence: CIEvidence): QualityGateResult => {
      const passed = evidence.ciConclusion === 'success';
      return {
        name: 'ci_pass',
        passed,
        reason: passed ? 'CI completed successfully' : `CI concluded with: ${evidence.ciConclusion}`,
        evidence: { conclusion: evidence.ciConclusion }
      };
    }
  }
];

// ============================================================================
// Gate3 Service
// ============================================================================

export class Gate3Service {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly qualityGates: QualityGate[] = defaultQualityGates
  ) {}

  /**
   * Find the workflow associated with a CI event.
   */
  async findWorkflowForCIEvent(input: CIEventInput): Promise<string | null> {
    // Find PR with matching head SHA
    const pr = await this.prisma.pullRequest.findFirst({
      where: {
        status: 'open',
        workflow: {
          OR: [
            { baseSha: input.headSha },
            {
              patchSets: {
                some: {
                  baseSha: input.headSha
                }
              }
            }
          ]
        }
      },
      include: {
        workflow: true
      }
    });

    if (pr) {
      return pr.workflowId;
    }

    // Also check if head SHA matches any workflow's baseSha directly
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        baseSha: input.headSha,
        state: { in: ['PR_OPEN', 'VERIFYING_CI'] }
      }
    });

    return workflow?.id ?? null;
  }

  /**
   * Process a CI event and evaluate quality gates.
   */
  async processCIEvent(input: CIEventInput): Promise<Gate3Result | null> {
    // Find associated workflow
    const workflowId = await this.findWorkflowForCIEvent(input);

    if (!workflowId) {
      return null;
    }

    // Get workflow with PR
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        pullRequests: {
          where: { status: 'open' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!workflow) {
      return null;
    }

    // Build CI evidence
    const evidence = this.buildEvidence(workflowId, input, workflow.pullRequests[0]?.number);

    // Evaluate quality gates
    const gateResults = this.evaluateGates(evidence);

    // Determine if passed
    const requiredGates = gateResults.filter((r) =>
      this.qualityGates.find((g) => g.name === r.name)?.required
    );
    const passed = requiredGates.every((r) => r.passed);

    // Update evidence with gate results
    evidence.gateResults = gateResults;

    // Record CI evidence
    await this.recordEvidence(workflowId, evidence, input);

    // Create transition event
    const transitionEvent = this.createTransitionEvent(input.conclusion);

    return {
      workflowId,
      passed,
      ciConclusion: input.conclusion,
      gateResults,
      evidence,
      transitionEvent
    };
  }

  /**
   * Build CI evidence from input.
   */
  private buildEvidence(
    workflowId: string,
    input: CIEventInput,
    prNumber?: number
  ): CIEvidence {
    const evidence: CIEvidence = {
      workflowId,
      prNumber,
      headSha: input.headSha,
      ciConclusion: input.conclusion,
      ciSource: input.source,
      ciCompletedAt: input.completedAt ?? new Date(),
      gateResults: []
    };

    // Add evidence URLs based on source
    if (input.checkSuiteId) {
      evidence.checkSuiteUrl = `https://github.com/${input.owner}/${input.repo}/runs/${input.checkSuiteId}`;
    }

    if (input.workflowRunId) {
      evidence.workflowRunUrl = `https://github.com/${input.owner}/${input.repo}/actions/runs/${input.workflowRunId}`;
    }

    evidence.commitUrl = `https://github.com/${input.owner}/${input.repo}/commit/${input.headSha}`;

    return evidence;
  }

  /**
   * Evaluate all quality gates.
   */
  private evaluateGates(evidence: CIEvidence): QualityGateResult[] {
    return this.qualityGates.map((gate) => gate.evaluator(evidence));
  }

  /**
   * Record CI evidence in the database.
   */
  private async recordEvidence(
    workflowId: string,
    evidence: CIEvidence,
    input: CIEventInput
  ): Promise<void> {
    // Create workflow event with CI evidence
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'E_CI_COMPLETED',
        payload: {
          conclusion: input.conclusion,
          source: input.source,
          headSha: input.headSha,
          webhookId: input.webhookId,
          checkSuiteId: input.checkSuiteId,
          workflowRunId: input.workflowRunId,
          checkRunId: input.checkRunId,
          gateResults: JSON.parse(JSON.stringify(evidence.gateResults)),
          evidenceUrls: {
            checkSuite: evidence.checkSuiteUrl,
            workflowRun: evidence.workflowRunUrl,
            commit: evidence.commitUrl
          }
        }
      }
    });

    // Also store as artifact for audit
    await this.prisma.artifact.create({
      data: {
        workflowId,
        kind: 'ci_evidence',
        content: JSON.stringify(evidence, null, 2),
        contentSha: this.hashContent(JSON.stringify(evidence))
      }
    });
  }

  /**
   * Create a transition event for CI completion.
   */
  private createTransitionEvent(conclusion: CIConclusion): TransitionEvent {
    // Map CI conclusion to our transition event format
    let mappedConclusion: 'success' | 'failure' | 'cancelled';

    switch (conclusion) {
      case 'success':
        mappedConclusion = 'success';
        break;
      case 'cancelled':
      case 'skipped':
        mappedConclusion = 'cancelled';
        break;
      default:
        // failure, neutral, timed_out, action_required
        mappedConclusion = 'failure';
    }

    return {
      type: 'E_CI_COMPLETED',
      result: { conclusion: mappedConclusion }
    };
  }

  /**
   * Simple content hash for artifacts.
   */
  private hashContent(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get CI evidence for a workflow.
   */
  async getCIEvidence(workflowId: string): Promise<CIEvidence | null> {
    const artifact = await this.prisma.artifact.findFirst({
      where: {
        workflowId,
        kind: 'ci_evidence'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!artifact) {
      return null;
    }

    return JSON.parse(artifact.content) as CIEvidence;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map a webhook CI event to the CIEventInput format.
 */
export function mapWebhookToCIEvent(
  webhookId: string,
  eventType: string,
  payload: any
): CIEventInput | null {
  const repoOwner = payload.repository?.owner?.login;
  const repoName = payload.repository?.name;

  if (!repoOwner || !repoName) {
    return null;
  }

  if (eventType === 'check_suite' && payload.check_suite) {
    const cs = payload.check_suite;
    return {
      source: 'check_suite',
      conclusion: cs.conclusion as CIConclusion,
      headSha: cs.head_sha,
      owner: repoOwner,
      repo: repoName,
      webhookId,
      checkSuiteId: cs.id,
      completedAt: cs.updated_at ? new Date(cs.updated_at) : undefined
    };
  }

  if (eventType === 'workflow_run' && payload.workflow_run) {
    const wr = payload.workflow_run;
    return {
      source: 'workflow_run',
      conclusion: wr.conclusion as CIConclusion,
      headSha: wr.head_sha,
      owner: repoOwner,
      repo: repoName,
      webhookId,
      workflowRunId: wr.id,
      name: wr.name,
      url: wr.html_url,
      startedAt: wr.run_started_at ? new Date(wr.run_started_at) : undefined,
      completedAt: wr.updated_at ? new Date(wr.updated_at) : undefined
    };
  }

  if (eventType === 'check_run' && payload.check_run) {
    const cr = payload.check_run;
    return {
      source: 'check_run',
      conclusion: cr.conclusion as CIConclusion,
      headSha: cr.head_sha,
      owner: repoOwner,
      repo: repoName,
      webhookId,
      checkRunId: cr.id,
      name: cr.name,
      url: cr.html_url,
      startedAt: cr.started_at ? new Date(cr.started_at) : undefined,
      completedAt: cr.completed_at ? new Date(cr.completed_at) : undefined
    };
  }

  if (eventType === 'status' && payload.sha) {
    return {
      source: 'status',
      conclusion: payload.state as CIConclusion,
      headSha: payload.sha,
      owner: repoOwner,
      repo: repoName,
      webhookId,
      name: payload.context
    };
  }

  return null;
}

/**
 * Check if a CI conclusion is terminal (workflow should complete).
 */
export function isCIConclusionTerminal(conclusion: CIConclusion): boolean {
  // These conclusions indicate the CI run is finished
  return [
    'success',
    'failure',
    'cancelled',
    'timed_out',
    'action_required'
  ].includes(conclusion);
}

/**
 * Check if a CI conclusion indicates success.
 */
export function isCISuccess(conclusion: CIConclusion): boolean {
  return conclusion === 'success';
}
