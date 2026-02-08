/**
 * Tests for GitHub Webhook Handling
 */

import { createHmac } from 'crypto';
import {
  verifyWebhookSignature,
  parseEventType,
  createWebhookEvent,
  isCICompletionEvent,
  extractCIConclusion,
  extractHeadSha,
  extractRepositoryInfo,
  type WebhookPayload,
  type GitHubWebhookEventType
} from '../../packages/core/src/github/webhook';

// Helper to create valid signature
function createSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

describe('Webhook Signature Verification', () => {
  const secret = 'test-webhook-secret';
  const payload = '{"test": "payload"}';

  it('should verify valid signature', () => {
    const signature = createSignature(payload, secret);
    const result = verifyWebhookSignature(payload, signature, secret);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject missing signature', () => {
    const result = verifyWebhookSignature(payload, '', secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing signature header');
  });

  it('should reject invalid signature format', () => {
    const result = verifyWebhookSignature(payload, 'invalid', secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid signature format');
  });

  it('should reject wrong signature', () => {
    const wrongSignature = createSignature(payload, 'wrong-secret');
    const result = verifyWebhookSignature(payload, wrongSignature, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Signature mismatch');
  });

  it('should reject signature with wrong length', () => {
    const result = verifyWebhookSignature(payload, 'sha256=abc', secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Signature length mismatch');
  });
});

describe('Event Type Parsing', () => {
  it('should parse known event types', () => {
    expect(parseEventType('push')).toBe('push');
    expect(parseEventType('pull_request')).toBe('pull_request');
    expect(parseEventType('check_run')).toBe('check_run');
    expect(parseEventType('check_suite')).toBe('check_suite');
    expect(parseEventType('workflow_run')).toBe('workflow_run');
    expect(parseEventType('status')).toBe('status');
    expect(parseEventType('issue_comment')).toBe('issue_comment');
    expect(parseEventType('ping')).toBe('ping');
  });

  it('should return unknown for unrecognized events', () => {
    expect(parseEventType('deployment')).toBe('unknown');
    expect(parseEventType('random_event')).toBe('unknown');
  });

  it('should return unknown for undefined', () => {
    expect(parseEventType(undefined)).toBe('unknown');
  });
});

describe('Webhook Event Creation', () => {
  it('should create webhook event with all fields', () => {
    const payload: WebhookPayload = {
      action: 'opened',
      repository: {
        id: 123,
        name: 'test-repo',
        full_name: 'owner/test-repo',
        owner: { login: 'owner' }
      }
    };

    const event = createWebhookEvent('pull_request', payload, 'delivery-123', 'sig-abc');

    expect(event.id).toBe('delivery-123');
    expect(event.type).toBe('pull_request');
    expect(event.action).toBe('opened');
    expect(event.payload).toBe(payload);
    expect(event.signature).toBe('sig-abc');
    expect(event.deliveryId).toBe('delivery-123');
    expect(event.receivedAt).toBeInstanceOf(Date);
  });
});

describe('CI Completion Detection', () => {
  const createEvent = (type: GitHubWebhookEventType, action?: string) =>
    createWebhookEvent(type, { action }, 'delivery-id', 'signature');

  it('should detect check_suite completed', () => {
    const event = createEvent('check_suite', 'completed');
    expect(isCICompletionEvent(event)).toBe(true);
  });

  it('should detect workflow_run completed', () => {
    const event = createEvent('workflow_run', 'completed');
    expect(isCICompletionEvent(event)).toBe(true);
  });

  it('should detect check_run completed', () => {
    const event = createEvent('check_run', 'completed');
    expect(isCICompletionEvent(event)).toBe(true);
  });

  it('should not detect non-completion events', () => {
    expect(isCICompletionEvent(createEvent('check_suite', 'requested'))).toBe(false);
    expect(isCICompletionEvent(createEvent('workflow_run', 'in_progress'))).toBe(false);
    expect(isCICompletionEvent(createEvent('push'))).toBe(false);
    expect(isCICompletionEvent(createEvent('pull_request', 'opened'))).toBe(false);
  });
});

describe('CI Conclusion Extraction', () => {
  it('should extract success from check_suite', () => {
    const event = createWebhookEvent(
      'check_suite',
      { check_suite: { id: 1, status: 'completed', conclusion: 'success', head_sha: 'abc' } },
      'delivery',
      'sig'
    );
    expect(extractCIConclusion(event)).toBe('success');
  });

  it('should extract failure from workflow_run', () => {
    const event = createWebhookEvent(
      'workflow_run',
      {
        workflow_run: {
          id: 1,
          name: 'CI',
          status: 'completed',
          conclusion: 'failure',
          head_sha: 'abc',
          workflow_id: 1
        }
      },
      'delivery',
      'sig'
    );
    expect(extractCIConclusion(event)).toBe('failure');
  });

  it('should extract cancelled from check_run', () => {
    const event = createWebhookEvent(
      'check_run',
      { check_run: { id: 1, name: 'test', status: 'completed', conclusion: 'cancelled', head_sha: 'abc' } },
      'delivery',
      'sig'
    );
    expect(extractCIConclusion(event)).toBe('cancelled');
  });

  it('should return null for non-CI events', () => {
    const event = createWebhookEvent('push', {}, 'delivery', 'sig');
    expect(extractCIConclusion(event)).toBeNull();
  });

  it('should return null for unknown conclusion', () => {
    const event = createWebhookEvent(
      'check_suite',
      { check_suite: { id: 1, status: 'completed', conclusion: 'neutral', head_sha: 'abc' } },
      'delivery',
      'sig'
    );
    expect(extractCIConclusion(event)).toBeNull();
  });
});

describe('Head SHA Extraction', () => {
  it('should extract from check_suite', () => {
    const event = createWebhookEvent(
      'check_suite',
      { check_suite: { id: 1, status: 'completed', conclusion: 'success', head_sha: 'sha-from-check-suite' } },
      'delivery',
      'sig'
    );
    expect(extractHeadSha(event)).toBe('sha-from-check-suite');
  });

  it('should extract from workflow_run', () => {
    const event = createWebhookEvent(
      'workflow_run',
      {
        workflow_run: {
          id: 1,
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          head_sha: 'sha-from-workflow-run',
          workflow_id: 1
        }
      },
      'delivery',
      'sig'
    );
    expect(extractHeadSha(event)).toBe('sha-from-workflow-run');
  });

  it('should extract from check_run', () => {
    const event = createWebhookEvent(
      'check_run',
      { check_run: { id: 1, name: 'test', status: 'completed', conclusion: 'success', head_sha: 'sha-from-check-run' } },
      'delivery',
      'sig'
    );
    expect(extractHeadSha(event)).toBe('sha-from-check-run');
  });

  it('should extract from pull_request', () => {
    const event = createWebhookEvent(
      'pull_request',
      {
        action: 'opened',
        pull_request: {
          number: 1,
          state: 'open',
          title: 'Test PR',
          head: { sha: 'sha-from-pr-head', ref: 'feature' },
          base: { sha: 'sha-base', ref: 'main' }
        }
      },
      'delivery',
      'sig'
    );
    expect(extractHeadSha(event)).toBe('sha-from-pr-head');
  });

  it('should extract from status event', () => {
    const event = createWebhookEvent(
      'status',
      { sha: 'sha-from-status', state: 'success', context: 'ci/test' },
      'delivery',
      'sig'
    );
    expect(extractHeadSha(event)).toBe('sha-from-status');
  });

  it('should return null when no SHA present', () => {
    const event = createWebhookEvent('ping', { zen: 'Responsive is better' }, 'delivery', 'sig');
    expect(extractHeadSha(event)).toBeNull();
  });
});

describe('Repository Info Extraction', () => {
  it('should extract repository info', () => {
    const event = createWebhookEvent(
      'push',
      {
        repository: {
          id: 123,
          name: 'test-repo',
          full_name: 'owner/test-repo',
          owner: { login: 'owner' }
        }
      },
      'delivery',
      'sig'
    );

    const info = extractRepositoryInfo(event);
    expect(info).toEqual({
      owner: 'owner',
      repo: 'test-repo',
      fullName: 'owner/test-repo'
    });
  });

  it('should return null when no repository', () => {
    const event = createWebhookEvent('ping', { zen: 'Test' }, 'delivery', 'sig');
    expect(extractRepositoryInfo(event)).toBeNull();
  });
});
