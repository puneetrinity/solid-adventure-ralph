import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';

@Injectable()
export class ReposService {
  private prisma = getPrisma();

  constructor(
    @InjectQueue('refresh_context') private readonly refreshContextQueue: Queue
  ) {}

  async getContext(repoOwner: string, repoName: string, baseBranch: string = 'main') {
    const context = await this.prisma.repoContext.findUnique({
      where: {
        repoOwner_repoName_baseBranch: { repoOwner, repoName, baseBranch }
      }
    });

    if (!context) {
      return { status: 'missing', context: null };
    }

    return {
      status: context.isStale ? 'stale' : 'fresh',
      context: {
        id: context.id,
        repoOwner: context.repoOwner,
        repoName: context.repoName,
        baseBranch: context.baseBranch,
        baseSha: context.baseSha,
        contextPath: context.contextPath,
        content: context.content,
        summary: context.summary,
        isStale: context.isStale,
        updatedAt: context.updatedAt,
      }
    };
  }

  async refreshContext(
    repoOwner: string,
    repoName: string,
    baseBranch: string = 'main',
    workflowId?: string
  ) {
    if (workflowId) {
      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'context.refresh_requested',
          payload: { repoOwner, repoName, baseBranch }
        }
      });
    }

    // Enqueue refresh job
    const job = await this.refreshContextQueue.add('refresh_context', {
      repoOwner,
      repoName,
      baseBranch,
      workflowId,
    });

    return {
      ok: true,
      jobId: job.id,
      message: 'Context refresh job enqueued',
    };
  }

  async listContexts(repoOwner?: string) {
    const where = repoOwner ? { repoOwner } : {};
    const contexts = await this.prisma.repoContext.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        repoOwner: true,
        repoName: true,
        baseBranch: true,
        baseSha: true,
        contextPath: true,
        summary: true,
        isStale: true,
        updatedAt: true,
      }
    });

    return contexts;
  }

  async getContextContent(repoOwner: string, repoName: string, baseBranch: string = 'main') {
    const context = await this.prisma.repoContext.findUnique({
      where: {
        repoOwner_repoName_baseBranch: { repoOwner, repoName, baseBranch }
      },
      select: {
        content: true,
        contextPath: true,
        summary: true,
      }
    });

    if (!context) {
      return { content: null, contextPath: null, summary: null };
    }

    return context;
  }
}
