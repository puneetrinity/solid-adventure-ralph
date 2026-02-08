/**
 * GitHub Webhook Handling
 *
 * This module handles GitHub webhook events:
 * - Signature verification (HMAC-SHA256)
 * - Event parsing and validation
 * - Event type detection
 */
export type GitHubWebhookEventType = 'push' | 'pull_request' | 'check_run' | 'check_suite' | 'workflow_run' | 'status' | 'issue_comment' | 'ping' | 'unknown';
export interface WebhookPayload {
    action?: string;
    repository?: {
        id: number;
        name: string;
        full_name: string;
        owner: {
            login: string;
        };
    };
    sender?: {
        id: number;
        login: string;
    };
    pull_request?: {
        number: number;
        state: string;
        title: string;
        head: {
            sha: string;
            ref: string;
        };
        base: {
            sha: string;
            ref: string;
        };
    };
    check_run?: {
        id: number;
        name: string;
        status: string;
        conclusion: string | null;
        head_sha: string;
    };
    check_suite?: {
        id: number;
        status: string;
        conclusion: string | null;
        head_sha: string;
    };
    workflow_run?: {
        id: number;
        name: string;
        status: string;
        conclusion: string | null;
        head_sha: string;
        workflow_id: number;
    };
    sha?: string;
    state?: string;
    context?: string;
    zen?: string;
    hook_id?: number;
}
export interface WebhookEvent {
    id: string;
    type: GitHubWebhookEventType;
    action?: string;
    payload: WebhookPayload;
    receivedAt: Date;
    signature: string;
    deliveryId: string;
}
export interface VerifySignatureResult {
    valid: boolean;
    error?: string;
}
/**
 * Verify the GitHub webhook signature.
 * Uses HMAC-SHA256 with timing-safe comparison to prevent timing attacks.
 *
 * @param payload - The raw request body as a string
 * @param signature - The X-Hub-Signature-256 header value
 * @param secret - The webhook secret configured in GitHub
 * @returns Whether the signature is valid
 */
export declare function verifyWebhookSignature(payload: string, signature: string, secret: string): VerifySignatureResult;
/**
 * Determine the webhook event type from the X-GitHub-Event header.
 */
export declare function parseEventType(eventHeader: string | undefined): GitHubWebhookEventType;
/**
 * Create a WebhookEvent from raw request data.
 */
export declare function createWebhookEvent(eventType: GitHubWebhookEventType, payload: WebhookPayload, deliveryId: string, signature: string): WebhookEvent;
/**
 * Check if a webhook event indicates CI completion.
 */
export declare function isCICompletionEvent(event: WebhookEvent): boolean;
/**
 * Extract CI conclusion from a webhook event.
 */
export declare function extractCIConclusion(event: WebhookEvent): 'success' | 'failure' | 'cancelled' | null;
/**
 * Extract the commit SHA from a webhook event.
 */
export declare function extractHeadSha(event: WebhookEvent): string | null;
/**
 * Extract repository info from a webhook event.
 */
export declare function extractRepositoryInfo(event: WebhookEvent): {
    owner: string;
    repo: string;
    fullName: string;
} | null;
