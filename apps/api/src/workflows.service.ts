import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';

interface ListParams {
  limit: number;
  cursor?: string;
  status?: string;
}

interface WorkflowListItem {
  id: string;
  state: string;
  title: string | null;
  repoOwner: string | null;
  repoName: string | null;
  baseBranch: string;
  createdAt: Date;
  baseSha: string | null;
}

export interface ListResult {
  items: WorkflowListItem[];
  nextCursor: string | null;
}

@Injectable()
export class WorkflowsService {
  private prisma = getPrisma();

  constructor(
    @InjectQueue('workflow') private readonly workflowQueue: Queue,
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {}

  async list(params: ListParams): Promise<ListResult> {
    const { limit, cursor, status } = params;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status) {
      where.state = status;
    }
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    // Fetch one extra to determine if there's a next page
    const workflows = await this.prisma.workflow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        state: true,
        title: true,
        repoOwner: true,
        repoName: true,
        baseBranch: true,
        createdAt: true,
        baseSha: true,
      },
    });

    const hasMore = workflows.length > limit;
    const items = hasMore ? workflows.slice(0, limit) : workflows;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor };
  }

  async create(params: {
    goal: string;
    context?: string;
    title?: string;
    repos?: Array<{ owner: string; repo: string; baseBranch?: string; role?: string }>;
    repoOwner?: string;
    repoName?: string;
    baseBranch?: string;
  }) {
    const { goal, context, title, repos, repoOwner, repoName, baseBranch } = params;

    // Validate goal is provided
    if (!goal?.trim()) {
      throw new BadRequestException('goal is required');
    }

    // Handle repos array or legacy single-repo fields
    let repoList = repos || [];
    if (repoList.length === 0 && repoOwner && repoName) {
      // Legacy mode: single repo
      repoList = [{ owner: repoOwner, repo: repoName, baseBranch: baseBranch || 'main', role: 'primary' }];
    }

    // Validate at least one repo
    if (repoList.length === 0) {
      throw new BadRequestException('At least one repository is required (use repos array or repoOwner/repoName)');
    }

    // Validate exactly one primary repo
    const primaryRepos = repoList.filter(r => (r.role || 'primary') === 'primary');
    if (primaryRepos.length === 0) {
      // Default first repo to primary
      repoList[0].role = 'primary';
    } else if (primaryRepos.length > 1) {
      throw new BadRequestException('Exactly one repository must have role "primary"');
    }

    // Use primary repo for legacy fields
    const primaryRepo = repoList.find(r => r.role === 'primary') || repoList[0];

    const workflow = await this.prisma.workflow.create({
      data: {
        state: 'INGESTED',
        goal: goal,
        context: context || null,
        title: title || goal.substring(0, 100),
        // Legacy fields for backwards compat
        repoOwner: primaryRepo.owner,
        repoName: primaryRepo.repo,
        baseBranch: primaryRepo.baseBranch || 'main',
      }
    });

    // Create WorkflowRepo entries
    for (const repo of repoList) {
      await this.prisma.workflowRepo.create({
        data: {
          workflowId: workflow.id,
          owner: repo.owner,
          repo: repo.repo,
          baseBranch: repo.baseBranch || 'main',
          role: repo.role || 'primary',
        }
      });
    }

    await this.prisma.workflowEvent.create({
      data: {
        workflowId: workflow.id,
        type: 'ui.create',
        payload: { goal, context, title, repos: repoList }
      }
    });

    // Emit event to orchestrator
    await this.orchestrateQueue.add('orchestrate', {
      workflowId: workflow.id,
      event: { type: 'E_WORKFLOW_CREATED' }
    });

    return {
      id: workflow.id,
      state: workflow.state,
      goal: workflow.goal,
      context: workflow.context,
      title: workflow.title,
      repoOwner: workflow.repoOwner,
      repoName: workflow.repoName,
      baseBranch: workflow.baseBranch,
      repos: repoList,
    };
  }

  async get(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        repos: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        artifacts: { orderBy: { createdAt: 'asc' } },
        patchSets: {
          orderBy: { createdAt: 'desc' },
          include: { patches: { orderBy: { createdAt: 'asc' } } }
        },
        approvals: { orderBy: { createdAt: 'asc' } },
        pullRequests: { orderBy: { createdAt: 'desc' } },
        runs: { orderBy: { startedAt: 'desc' } },
        policyViolations: { orderBy: { createdAt: 'asc' } }
      }
    });

    return workflow ?? null;
  }

  async approve(workflowId: string, patchSetId?: string, approvedBy: string = 'me') {
    // Pick latest patch set if not provided
    const patchSet =
      patchSetId
        ? await this.prisma.patchSet.findUnique({ where: { id: patchSetId } })
        : await this.prisma.patchSet.findFirst({
            where: { workflowId },
            orderBy: { createdAt: 'desc' }
          });

    if (!patchSet) {
      return { ok: false, error: 'NO_PATCH_SET_FOUND' };
    }

    // Record approval
    await this.prisma.approval.create({
      data: { workflowId, kind: 'apply_patches' }
    });

    await this.prisma.patchSet.update({
      where: { id: patchSet.id },
      data: { status: 'approved', approvedAt: new Date(), approvedBy }
    });

    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'ui.approve',
        payload: { patchSetId: patchSet.id, approvedBy }
      }
    });

    // REFACTORED: Emit event to orchestrator instead of directly enqueueing apply_patches
    // The orchestrator will decide whether to enqueue apply_patches based on state + context
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_APPROVAL_RECORDED' }
    });

    return { ok: true, workflowId, patchSetId: patchSet.id };
  }

  async requestChanges(workflowId: string, patchSetId?: string, comment: string = '', requestedBy: string = 'me') {
    // Pick latest patch set if not provided
    const patchSet =
      patchSetId
        ? await this.prisma.patchSet.findUnique({ where: { id: patchSetId } })
        : await this.prisma.patchSet.findFirst({
            where: { workflowId },
            orderBy: { createdAt: 'desc' }
          });

    if (!patchSet) {
      return { ok: false, error: 'NO_PATCH_SET_FOUND' };
    }

    // Store feedback in workflow for LLM to use on next iteration
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: { feedback: comment }
    });

    // Record event for request changes
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'ui.request_changes',
        payload: { patchSetId: patchSet.id, comment, requestedBy }
      }
    });

    // Emit event to orchestrator
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_CHANGES_REQUESTED', comment }
    });

    return { ok: true, workflowId, patchSetId: patchSet.id };
  }

  async reject(workflowId: string, patchSetId?: string, reason: string = '', rejectedBy: string = 'me') {
    // Pick latest patch set if not provided
    const patchSet =
      patchSetId
        ? await this.prisma.patchSet.findUnique({ where: { id: patchSetId } })
        : await this.prisma.patchSet.findFirst({
            where: { workflowId },
            orderBy: { createdAt: 'desc' }
          });

    if (!patchSet) {
      return { ok: false, error: 'NO_PATCH_SET_FOUND' };
    }

    // Update patch set status to rejected
    await this.prisma.patchSet.update({
      where: { id: patchSet.id },
      data: { status: 'rejected' }
    });

    // Record event for rejection
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'ui.reject',
        payload: { patchSetId: patchSet.id, reason, rejectedBy }
      }
    });

    // Emit event to orchestrator
    await this.orchestrateQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_PATCH_SET_REJECTED', reason }
    });

    return { ok: true, workflowId, patchSetId: patchSet.id };
  }
}
