import { Injectable } from '@nestjs/common';
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

  constructor(@InjectQueue('workflow') private readonly workflowQueue: Queue) {}

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

  async create(params: { title?: string; repoOwner?: string; repoName?: string; baseBranch?: string }) {
    const { title, repoOwner, repoName, baseBranch } = params;

    const workflow = await this.prisma.workflow.create({
      data: {
        state: 'INGESTED',
        title: title || null,
        repoOwner: repoOwner || null,
        repoName: repoName || null,
        baseBranch: baseBranch || 'main',
      }
    });

    await this.prisma.workflowEvent.create({
      data: {
        workflowId: workflow.id,
        type: 'ui.create',
        payload: { title, repoOwner, repoName, baseBranch }
      }
    });

    // REFACTORED: Emit event to orchestrator instead of directly enqueueing ingest_context
    await this.workflowQueue.add('orchestrate', {
      workflowId: workflow.id,
      event: { type: 'E_WORKFLOW_CREATED' }
    });

    return {
      id: workflow.id,
      state: workflow.state,
      title: workflow.title,
      repoOwner: workflow.repoOwner,
      repoName: workflow.repoName,
      baseBranch: workflow.baseBranch,
    };
  }

  async get(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        artifacts: { orderBy: { createdAt: 'asc' } },
        patchSets: {
          orderBy: { createdAt: 'desc' },
          include: { patches: { orderBy: { createdAt: 'asc' } } }
        },
        approvals: { orderBy: { createdAt: 'asc' } },
        pullRequests: { orderBy: { createdAt: 'desc' } }
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
    await this.workflowQueue.add('orchestrate', {
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

    // Record event for request changes
    await this.prisma.workflowEvent.create({
      data: {
        workflowId,
        type: 'ui.request_changes',
        payload: { patchSetId: patchSet.id, comment, requestedBy }
      }
    });

    // Emit event to orchestrator
    await this.workflowQueue.add('orchestrate', {
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
    await this.workflowQueue.add('orchestrate', {
      workflowId,
      event: { type: 'E_PATCH_SET_REJECTED', reason }
    });

    return { ok: true, workflowId, patchSetId: patchSet.id };
  }
}
