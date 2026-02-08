import { Controller, Post, Headers, Body, RawBodyRequest, Req, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { createHmac, timingSafeEqual } from 'crypto';
import { getPrisma } from '@arch-orchestrator/db';
import type { Request } from 'express';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  private prisma = getPrisma();

  constructor(
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {}

  @Post('github')
  @HttpCode(200)
  @ApiOperation({ summary: 'GitHub webhook', description: 'Receives GitHub webhook events' })
  @ApiHeader({ name: 'X-Hub-Signature-256', description: 'HMAC signature' })
  @ApiHeader({ name: 'X-GitHub-Event', description: 'Event type' })
  @ApiHeader({ name: 'X-GitHub-Delivery', description: 'Delivery ID' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleGitHubWebhook(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: any
  ) {
    // Validate signature if webhook secret is configured
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret) {
      if (!signature) {
        this.logger.warn(`Missing signature for delivery ${deliveryId}`);
        return { ok: false, error: 'Missing signature' };
      }

      const rawBody = req.rawBody;
      if (!rawBody) {
        this.logger.warn(`Missing raw body for delivery ${deliveryId}`);
        return { ok: false, error: 'Missing raw body' };
      }

      if (!this.verifySignature(rawBody, signature, webhookSecret)) {
        this.logger.warn(`Invalid signature for delivery ${deliveryId}`);
        return { ok: false, error: 'Invalid signature' };
      }
    }

    this.logger.log(`Received GitHub webhook: ${event} (${deliveryId})`);

    try {
      switch (event) {
        case 'pull_request':
          await this.handlePullRequestEvent(body);
          break;
        case 'check_run':
          await this.handleCheckRunEvent(body);
          break;
        case 'check_suite':
          await this.handleCheckSuiteEvent(body);
          break;
        case 'status':
          await this.handleStatusEvent(body);
          break;
        case 'ping':
          this.logger.log('Received ping event');
          return { ok: true, message: 'pong' };
        default:
          this.logger.log(`Ignoring event type: ${event}`);
      }

      return { ok: true };
    } catch (err) {
      this.logger.error(`Error processing webhook: ${err}`);
      return { ok: false, error: String(err) };
    }
  }

  private verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    const expectedSignature = 'sha256=' + createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  private async handlePullRequestEvent(payload: any) {
    const action = payload.action;
    const prNumber = payload.pull_request?.number;
    const prUrl = payload.pull_request?.html_url;
    const merged = payload.pull_request?.merged;
    const headBranch = payload.pull_request?.head?.ref;

    this.logger.log(`PR #${prNumber} action: ${action}, merged: ${merged}`);

    // Find workflow by PR number or branch
    const pr = await this.prisma.pullRequest.findFirst({
      where: {
        OR: [
          { number: prNumber },
          { branch: headBranch }
        ]
      }
    });

    if (!pr) {
      this.logger.log(`No workflow found for PR #${prNumber}`);
      return;
    }

    // Update PR status
    let newStatus = pr.status;
    if (action === 'closed') {
      newStatus = merged ? 'merged' : 'closed';
    }

    await this.prisma.pullRequest.update({
      where: { id: pr.id },
      data: { status: newStatus }
    });

    // Record event
    await this.prisma.workflowEvent.create({
      data: {
        workflowId: pr.workflowId,
        type: `webhook.pull_request.${action}`,
        payload: {
          prNumber,
          prUrl,
          action,
          merged,
          headBranch
        }
      }
    });

    // Emit to orchestrator if merged or closed
    if (action === 'closed') {
      await this.orchestrateQueue.add('orchestrate', {
        workflowId: pr.workflowId,
        event: {
          type: merged ? 'E_PR_MERGED' : 'E_PR_CLOSED',
          prNumber,
          merged
        }
      });
    }
  }

  private async handleCheckRunEvent(payload: any) {
    const action = payload.action;
    const checkRun = payload.check_run;
    const conclusion = checkRun?.conclusion;
    const headSha = checkRun?.head_sha;
    const name = checkRun?.name;

    if (action !== 'completed') {
      return; // Only care about completed checks
    }

    this.logger.log(`Check run "${name}" completed: ${conclusion}`);

    // Find workflow by commit SHA
    const workflow = await this.prisma.workflow.findFirst({
      where: { baseSha: headSha },
      include: { pullRequests: true }
    });

    if (!workflow) {
      // Try finding by PR branch
      const prHeadBranch = payload.check_run?.check_suite?.head_branch;
      if (prHeadBranch) {
        const pr = await this.prisma.pullRequest.findFirst({
          where: { branch: prHeadBranch }
        });
        if (pr) {
          await this.recordCIEvent(pr.workflowId, name, conclusion, headSha);
        }
      }
      return;
    }

    await this.recordCIEvent(workflow.id, name, conclusion, headSha);
  }

  private async handleCheckSuiteEvent(payload: any) {
    const action = payload.action;
    const conclusion = payload.check_suite?.conclusion;
    const headSha = payload.check_suite?.head_sha;
    const headBranch = payload.check_suite?.head_branch;

    if (action !== 'completed') {
      return;
    }

    this.logger.log(`Check suite completed: ${conclusion}`);

    // Find PR by branch
    const pr = await this.prisma.pullRequest.findFirst({
      where: { branch: headBranch }
    });

    if (!pr) {
      return;
    }

    await this.prisma.workflowEvent.create({
      data: {
        workflowId: pr.workflowId,
        type: 'webhook.check_suite.completed',
        payload: {
          conclusion,
          headSha,
          headBranch
        }
      }
    });

    // Emit CI completed event
    await this.orchestrateQueue.add('orchestrate', {
      workflowId: pr.workflowId,
      event: {
        type: 'E_CI_COMPLETED',
        result: { conclusion }
      }
    });
  }

  private async handleStatusEvent(payload: any) {
    const state = payload.state; // pending, success, failure, error
    const context = payload.context;
    const sha = payload.sha;
    const targetUrl = payload.target_url;

    this.logger.log(`Status "${context}": ${state}`);

    // Find workflow by SHA
    const workflow = await this.prisma.workflow.findFirst({
      where: { baseSha: sha }
    });

    if (!workflow) {
      return;
    }

    await this.prisma.workflowEvent.create({
      data: {
        workflowId: workflow.id,
        type: `webhook.status.${state}`,
        payload: {
          context,
          state,
          sha,
          targetUrl
        }
      }
    });
  }

  private async recordCIEvent(
    workflowId: string,
    name: string,
    conclusion: string,
    headSha: string
  ) {
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'webhook.check_run.completed',
        payload: {
          name,
          conclusion,
          headSha
        }
      }
    });

    // Emit CI result to orchestrator
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: {
        type: 'E_CI_COMPLETED',
        result: { conclusion, checkName: name }
      }
    });
  }
}
