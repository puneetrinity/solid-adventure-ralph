"use strict";
/**
 * Webhook Service
 *
 * Handles persistence and processing of GitHub webhook events.
 * This service is responsible for:
 * 1. Persisting valid webhook events to the database
 * 2. Processing events to trigger workflow transitions
 * 3. Marking events as processed
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const webhook_1 = require("./webhook");
// ============================================================================
// Webhook Service
// ============================================================================
class WebhookService {
    prisma;
    webhookSecret;
    constructor(prisma, webhookSecret) {
        this.prisma = prisma;
        this.webhookSecret = webhookSecret;
    }
    /**
     * Ingest a webhook event: verify signature and persist to database.
     */
    async ingest(input) {
        const { payload, signature, eventType, deliveryId } = input;
        // Verify signature
        const verification = (0, webhook_1.verifyWebhookSignature)(payload, signature, this.webhookSecret);
        if (!verification.valid) {
            return {
                success: false,
                error: verification.error || 'Signature verification failed'
            };
        }
        // Parse payload
        let parsedPayload;
        try {
            parsedPayload = JSON.parse(payload);
        }
        catch (err) {
            return {
                success: false,
                error: `Invalid JSON payload: ${err}`
            };
        }
        // Determine event type
        const webhookEventType = (0, webhook_1.parseEventType)(eventType);
        // Extract repository info
        const repoInfo = (0, webhook_1.extractRepositoryInfo)((0, webhook_1.createWebhookEvent)(webhookEventType, parsedPayload, deliveryId, signature));
        // Extract head SHA if present
        const headSha = (0, webhook_1.extractHeadSha)((0, webhook_1.createWebhookEvent)(webhookEventType, parsedPayload, deliveryId, signature));
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
    async process(webhookId) {
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
        const payload = webhook.payload;
        const event = (0, webhook_1.createWebhookEvent)(webhook.eventType, payload, webhook.deliveryId, webhook.signature);
        let action;
        let workflowId;
        // Handle CI completion events
        if ((0, webhook_1.isCICompletionEvent)(event)) {
            const conclusion = (0, webhook_1.extractCIConclusion)(event);
            const headSha = (0, webhook_1.extractHeadSha)(event);
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
                }
                else if (event.action === 'closed') {
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
    async getUnprocessedWebhooks(limit = 100) {
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
    async getByDeliveryId(deliveryId) {
        return this.prisma.gitHubWebhook.findUnique({
            where: { deliveryId }
        });
    }
}
exports.WebhookService = WebhookService;
//# sourceMappingURL=webhook-service.js.map