import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { getPrisma } from '@db';

@Injectable()
export class WorkflowsService {
  private prisma = getPrisma();

  constructor(@InjectQueue('workflow') private readonly workflowQueue: Queue) {}

  async create(title: string) {
    const workflow = await this.prisma.workflow.create({
      data: { state: 'INGESTED' }
    });

    await this.prisma.workflowEvent.create({
      data: {
        workflowId: workflow.id,
        type: 'ui.create',
        payload: { title }
      }
    });

    // REFACTORED: Emit event to orchestrator instead of directly enqueueing ingest_context
    await this.workflowQueue.add('orchestrate', {
      workflowId: workflow.id,
      event: { type: 'E_WORKFLOW_CREATED' }
    });

    return { id: workflow.id, state: workflow.state };
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
}
