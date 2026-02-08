/**
 * GitHub Webhook Handling
 *
 * This module handles GitHub webhook events:
 * - Signature verification (HMAC-SHA256)
 * - Event parsing and validation
 * - Event type detection
 */

import { createHmac, timingSafeEqual } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type GitHubWebhookEventType =
  | 'push'
  | 'pull_request'
  | 'check_run'
  | 'check_suite'
  | 'workflow_run'
  | 'status'
  | 'issue_comment'
  | 'ping'
  | 'unknown';

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
  // Pull request events
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
  // Check run events
  check_run?: {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    head_sha: string;
  };
  // Check suite events
  check_suite?: {
    id: number;
    status: string;
    conclusion: string | null;
    head_sha: string;
  };
  // Workflow run events
  workflow_run?: {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    head_sha: string;
    workflow_id: number;
  };
  // Status events
  sha?: string;
  state?: string;
  context?: string;
  // Ping event
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
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): VerifySignatureResult {
  if (!signature) {
    return { valid: false, error: 'Missing signature header' };
  }

  if (!signature.startsWith('sha256=')) {
    return { valid: false, error: 'Invalid signature format' };
  }

  const signatureHash = signature.slice(7); // Remove 'sha256=' prefix

  try {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload, 'utf8');
    const expectedHash = hmac.digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signatureHash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: 'Signature length mismatch' };
    }

    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);
    return { valid: isValid, error: isValid ? undefined : 'Signature mismatch' };
  } catch (err) {
    return { valid: false, error: `Signature verification error: ${err}` };
  }
}

/**
 * Determine the webhook event type from the X-GitHub-Event header.
 */
export function parseEventType(eventHeader: string | undefined): GitHubWebhookEventType {
  if (!eventHeader) return 'unknown';

  const knownTypes: GitHubWebhookEventType[] = [
    'push',
    'pull_request',
    'check_run',
    'check_suite',
    'workflow_run',
    'status',
    'issue_comment',
    'ping'
  ];

  return knownTypes.includes(eventHeader as GitHubWebhookEventType)
    ? (eventHeader as GitHubWebhookEventType)
    : 'unknown';
}

/**
 * Create a WebhookEvent from raw request data.
 */
export function createWebhookEvent(
  eventType: GitHubWebhookEventType,
  payload: WebhookPayload,
  deliveryId: string,
  signature: string
): WebhookEvent {
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
export function isCICompletionEvent(event: WebhookEvent): boolean {
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
export function extractCIConclusion(event: WebhookEvent): 'success' | 'failure' | 'cancelled' | null {
  if (event.type === 'check_suite' && event.payload.check_suite) {
    const conclusion = event.payload.check_suite.conclusion;
    if (conclusion === 'success') return 'success';
    if (conclusion === 'failure') return 'failure';
    if (conclusion === 'cancelled') return 'cancelled';
  }

  if (event.type === 'workflow_run' && event.payload.workflow_run) {
    const conclusion = event.payload.workflow_run.conclusion;
    if (conclusion === 'success') return 'success';
    if (conclusion === 'failure') return 'failure';
    if (conclusion === 'cancelled') return 'cancelled';
  }

  if (event.type === 'check_run' && event.payload.check_run) {
    const conclusion = event.payload.check_run.conclusion;
    if (conclusion === 'success') return 'success';
    if (conclusion === 'failure') return 'failure';
    if (conclusion === 'cancelled') return 'cancelled';
  }

  return null;
}

/**
 * Extract the commit SHA from a webhook event.
 */
export function extractHeadSha(event: WebhookEvent): string | null {
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
export function extractRepositoryInfo(event: WebhookEvent): {
  owner: string;
  repo: string;
  fullName: string;
} | null {
  if (event.payload.repository) {
    return {
      owner: event.payload.repository.owner.login,
      repo: event.payload.repository.name,
      fullName: event.payload.repository.full_name
    };
  }
  return null;
}
