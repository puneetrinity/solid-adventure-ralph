/**
 * Webhook Service
 *
 * Handles persistence and processing of GitHub webhook events.
 * This service is responsible for:
 * 1. Persisting valid webhook events to the database
 * 2. Processing events to trigger workflow transitions
 * 3. Marking events as processed
 */

import type { PrismaClient } from '@prisma/client';
import {
  verifyWebhookSignature,
  parseEventType,
  createWebhookEvent,
  isCICompletionEvent,
  extractCIConclusion,
  extractHeadSha,
  extractRepositoryInfo,
  type WebhookPayload,
  type WebhookEvent,
  type GitHubWebhookEventType
} from './webhook';

// ============================================================================
// Types
// ============================================================================

export interface WebhookIngestInput {
  payload: string; // raw JSON string
  signature: string; // X-Hub-Signature-256 header
  eventType: string; // X-GitHub-Event header
  deliveryId: string; // X-GitHub-Delivery header
}

export interface WebhookIngestResult {
  success: boolean;
  webhookId?: string;
  eventType?: GitHubWebhookEventType;
  error?: string;
}

export interface WebhookProcessResult {
  processed: boolean;
  action?: string;
  workflowId?: string;
  error?: string;
}

// ============================================================================
// Webhook Service
// ============================================================================

export class WebhookService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly webhookSecret: string
  ) {}

  /**
   * Ingest a webhook event: verify signature and persist to database.
   */
  async ingest(input: WebhookIngestInput): Promise<WebhookIngestResult> {
    const { payload, signature, eventType, deliveryId } = input;

    // Verify signature
    const verification = verifyWebhookSignature(payload, signature, this.webhookSecret);
    if (!verification.valid) {
      return {
        success: false,
        error: verification.error || 'Signature verification failed'
      };
    }

    // Parse payload
    let parsedPayload: WebhookPayload;
    try {
      parsedPayload = JSON.parse(payload) as WebhookPayload;
    } catch (err) {
      return {
        success: false,
        error: `Invalid JSON payload: ${err}`
      };
    }

    // Determine event type
    const webhookEventType = parseEventType(eventType);

    // Extract repository info
    const repoInfo = extractRepositoryInfo(
      createWebhookEvent(webhookEventType, parsedPayload, deliveryId, signature)
    );

    // Extract head SHA if present
    const headSha = extractHeadSha(
      createWebhookEvent(webhookEventType, parsedPayload, deliveryId, signature)
    );

    // Check for duplicate delivery
    const existing = await this.prisma.gitHubWebhook.findUnique({
      where: { deliveryId }
    });

    if (existing) {
      return {
        success: true,
        webhookId: existing.id,
        eventType: webhookEventType,
        error: 'Duplicate delivery - event already processed'
      };
    }

    // Persist to database
    const webhook = await this.prisma.gitHubWebhook.create({
      data: {
        deliveryId,
        eventType: webhookEventType,
        action: parsedPayload.action,
        repoOwner: repoInfo?.owner ?? '',
        repoName: repoInfo?.repo ?? '',
        headSha: headSha ?? null,
        payload: JSON.parse(JSON.stringify(parsedPayload)),
        signature,
        processed: false
      }
    });

    return {
      success: true,
      webhookId: webhook.id,
      eventType: webhookEventType
    };
  }

  /**
   * Process a webhook event - typically called after ingest.
   * Determines if the event should trigger any workflow transitions.
   */
  async process(webhookId: string): Promise<WebhookProcessResult> {
    const webhook = await this.prisma.gitHubWebhook.findUnique({
      where: { id: webhookId }
    });

    if (!webhook) {
      return {
        processed: false,
        error: `Webhook ${webhookId} not found`
      };
    }

    if (webhook.processed) {
      return {
        processed: true,
        action: 'already_processed'
      };
    }

    const payload = webhook.payload as WebhookPayload;
    const event = createWebhookEvent(
      webhook.eventType as GitHubWebhookEventType,
      payload,
      webhook.deliveryId,
      webhook.signature
    );

    let action: string | undefined;
    let workflowId: string | undefined;

    // Handle CI completion events
    if (isCICompletionEvent(event)) {
      const conclusion = extractCIConclusion(event);
      const headSha = extractHeadSha(event);

      if (headSha) {
        // Find workflow with matching PR head SHA
        const pr = await this.prisma.pullRequest.findFirst({
          where: {
            workflow: {
              baseSha: headSha
            },
            status: 'open'
          },
          include: {
            workflow: true
          }
        });

        if (pr) {
          workflowId = pr.workflowId;
          action = `ci_${conclusion ?? 'completed'}`;

          // Create workflow event for CI completion
          await this.prisma.workflowEvent.create({
            data: {
              workflowId: pr.workflowId,
              type: 'E_CI_COMPLETED',
              payload: {
                conclusion,
                headSha,
                webhookId,
                eventType: webhook.eventType,
                checkSuiteId: payload.check_suite?.id,
                workflowRunId: payload.workflow_run?.id
              }
            }
          });
        }
      }
    }

    // Handle PR events (opened, closed, merged)
    if (event.type === 'pull_request' && payload.pull_request) {
      action = `pr_${event.action}`;

      // Find associated workflow if exists
      const pr = await this.prisma.pullRequest.findFirst({
        where: {
          number: payload.pull_request.number,
          workflow: {
            baseSha: payload.pull_request.head.sha
          }
        }
      });

      if (pr) {
        workflowId = pr.workflowId;

        if (event.action === 'closed' && payload.pull_request.state === 'merged') {
          // PR was merged
          await this.prisma.pullRequest.update({
            where: { id: pr.id },
            data: { status: 'merged' }
          });

          await this.prisma.workflowEvent.create({
            data: {
              workflowId: pr.workflowId,
              type: 'E_PR_MERGED',
              payload: {
                prNumber: payload.pull_request.number,
                webhookId
              }
            }
          });
        } else if (event.action === 'closed') {
          // PR was closed without merge
          await this.prisma.pullRequest.update({
            where: { id: pr.id },
            data: { status: 'closed' }
          });
        }
      }
    }

    // Mark as processed
    await this.prisma.gitHubWebhook.update({
      where: { id: webhookId },
      data: {
        processed: true,
        processedAt: new Date()
      }
    });

    return {
      processed: true,
      action,
      workflowId
    };
  }

  /**
   * Get unprocessed webhooks for batch processing.
   */
  async getUnprocessedWebhooks(limit = 100): Promise<Array<{ id: string; eventType: string }>> {
    const webhooks = await this.prisma.gitHubWebhook.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, eventType: true }
    });

    return webhooks;
  }

  /**
   * Get webhook by delivery ID.
   */
  async getByDeliveryId(deliveryId: string) {
    return this.prisma.gitHubWebhook.findUnique({
      where: { deliveryId }
    });
  }
}
