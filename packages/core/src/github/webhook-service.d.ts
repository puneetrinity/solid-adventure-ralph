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
import { type GitHubWebhookEventType } from './webhook';
export interface WebhookIngestInput {
    payload: string;
    signature: string;
    eventType: string;
    deliveryId: string;
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
export declare class WebhookService {
    private readonly prisma;
    private readonly webhookSecret;
    constructor(prisma: PrismaClient, webhookSecret: string);
    /**
     * Ingest a webhook event: verify signature and persist to database.
     */
    ingest(input: WebhookIngestInput): Promise<WebhookIngestResult>;
    /**
     * Process a webhook event - typically called after ingest.
     * Determines if the event should trigger any workflow transitions.
     */
    process(webhookId: string): Promise<WebhookProcessResult>;
    /**
     * Get unprocessed webhooks for batch processing.
     */
    getUnprocessedWebhooks(limit?: number): Promise<Array<{
        id: string;
        eventType: string;
    }>>;
    /**
     * Get webhook by delivery ID.
     */
    getByDeliveryId(deliveryId: string): Promise<{
        id: string;
        createdAt: Date;
        payload: import("@prisma/client/runtime/library").JsonValue;
        signature: string;
        eventType: string;
        deliveryId: string;
        action: string | null;
        repoOwner: string;
        repoName: string;
        headSha: string | null;
        processed: boolean;
        processedAt: Date | null;
    } | null>;
}
