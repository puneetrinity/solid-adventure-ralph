"use strict";
/**
 * GitHub Webhook Handling
 *
 * This module handles GitHub webhook events:
 * - Signature verification (HMAC-SHA256)
 * - Event parsing and validation
 * - Event type detection
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.parseEventType = parseEventType;
exports.createWebhookEvent = createWebhookEvent;
exports.isCICompletionEvent = isCICompletionEvent;
exports.extractCIConclusion = extractCIConclusion;
exports.extractHeadSha = extractHeadSha;
exports.extractRepositoryInfo = extractRepositoryInfo;
const crypto_1 = require("crypto");
// ============================================================================
// Signature Verification
// ============================================================================
/**
 * Verify the GitHub webhook signature.
 * Uses HMAC-SHA256 with timing-safe comparison to prevent timing attacks.
 *
 * @param payload - The raw request body as a string
 * @param signature - The X-Hub-Signature-256 header value
 * @param secret - The webhook secret configured in GitHub
 * @returns Whether the signature is valid
 */
function verifyWebhookSignature(payload, signature, secret) {
    if (!signature) {
        return { valid: false, error: 'Missing signature header' };
    }
    if (!signature.startsWith('sha256=')) {
        return { valid: false, error: 'Invalid signature format' };
    }
    const signatureHash = signature.slice(7); // Remove 'sha256=' prefix
    try {
        const hmac = (0, crypto_1.createHmac)('sha256', secret);
        hmac.update(payload, 'utf8');
        const expectedHash = hmac.digest('hex');
        // Use timing-safe comparison to prevent timing attacks
        const signatureBuffer = Buffer.from(signatureHash, 'hex');
        const expectedBuffer = Buffer.from(expectedHash, 'hex');
        if (signatureBuffer.length !== expectedBuffer.length) {
            return { valid: false, error: 'Signature length mismatch' };
        }
        const isValid = (0, crypto_1.timingSafeEqual)(signatureBuffer, expectedBuffer);
        return { valid: isValid, error: isValid ? undefined : 'Signature mismatch' };
    }
    catch (err) {
        return { valid: false, error: `Signature verification error: ${err}` };
    }
}
/**
 * Determine the webhook event type from the X-GitHub-Event header.
 */
function parseEventType(eventHeader) {
    if (!eventHeader)
        return 'unknown';
    const knownTypes = [
        'push',
        'pull_request',
        'check_run',
        'check_suite',
        'workflow_run',
        'status',
        'issue_comment',
        'ping'
    ];
    return knownTypes.includes(eventHeader)
        ? eventHeader
        : 'unknown';
}
/**
 * Create a WebhookEvent from raw request data.
 */
function createWebhookEvent(eventType, payload, deliveryId, signature) {
    return {
        id: deliveryId,
        type: eventType,
        action: payload.action,
        payload,
        receivedAt: new Date(),
        signature,
        deliveryId
    };
}
// ============================================================================
// Event Analysis
// ============================================================================
/**
 * Check if a webhook event indicates CI completion.
 */
function isCICompletionEvent(event) {
    if (event.type === 'check_suite' && event.action === 'completed') {
        return true;
    }
    if (event.type === 'workflow_run' && event.action === 'completed') {
        return true;
    }
    if (event.type === 'check_run' && event.action === 'completed') {
        return true;
    }
    return false;
}
/**
 * Extract CI conclusion from a webhook event.
 */
function extractCIConclusion(event) {
    if (event.type === 'check_suite' && event.payload.check_suite) {
        const conclusion = event.payload.check_suite.conclusion;
        if (conclusion === 'success')
            return 'success';
        if (conclusion === 'failure')
            return 'failure';
        if (conclusion === 'cancelled')
            return 'cancelled';
    }
    if (event.type === 'workflow_run' && event.payload.workflow_run) {
        const conclusion = event.payload.workflow_run.conclusion;
        if (conclusion === 'success')
            return 'success';
        if (conclusion === 'failure')
            return 'failure';
        if (conclusion === 'cancelled')
            return 'cancelled';
    }
    if (event.type === 'check_run' && event.payload.check_run) {
        const conclusion = event.payload.check_run.conclusion;
        if (conclusion === 'success')
            return 'success';
        if (conclusion === 'failure')
            return 'failure';
        if (conclusion === 'cancelled')
            return 'cancelled';
    }
    return null;
}
/**
 * Extract the commit SHA from a webhook event.
 */
function extractHeadSha(event) {
    if (event.payload.check_suite?.head_sha) {
        return event.payload.check_suite.head_sha;
    }
    if (event.payload.workflow_run?.head_sha) {
        return event.payload.workflow_run.head_sha;
    }
    if (event.payload.check_run?.head_sha) {
        return event.payload.check_run.head_sha;
    }
    if (event.payload.pull_request?.head?.sha) {
        return event.payload.pull_request.head.sha;
    }
    if (event.payload.sha) {
        return event.payload.sha;
    }
    return null;
}
/**
 * Extract repository info from a webhook event.
 */
function extractRepositoryInfo(event) {
    if (event.payload.repository) {
        return {
            owner: event.payload.repository.owner.login,
            repo: event.payload.repository.name,
            fullName: event.payload.repository.full_name
        };
    }
    return null;
}
//# sourceMappingURL=webhook.js.map