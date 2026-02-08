import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { WriteGate, type GitHubClient } from '@arch-orchestrator/core';
import { RunRecorder } from '@arch-orchestrator/core/audit/run-recorder';
import { StubGitHubClient } from '../github.stub';

@Processor('apply_patches')
export class ApplyPatchesProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);

  constructor(
    @Inject(StubGitHubClient) private readonly github: GitHubClient,
    @InjectQueue('workflow') private readonly workflowQueue: Queue
  ) {
    super();
  }

  async process(job: Job<{ workflowId: string; patchSetId: string }>) {
    const { workflowId, patchSetId } = job.data;

    // Record run start
    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'apply_patches',
      inputs: { workflowId, patchSetId }
    });

    const writeGate = new WriteGate(this.prisma, this.github);

    try {
      const pr = await writeGate.openPullRequest(workflowId, {
        owner: 'stub-owner',
        repo: 'stub-repo',
        head: `bot/workflow-${workflowId}`,
        base: 'main',
        title: `Stub PR for workflow ${workflowId}`,
        body: `Applying PatchSet ${patchSetId} (stub).`
      });

      await this.prisma.pullRequest.create({
        data: {
          workflowId,
          number: pr.number,
          url: pr.url,
          branch: `bot/workflow-${workflowId}`,
          status: 'open'
        }
      });

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.apply_patches.opened_pr',
          payload: { patchSetId, pr }
        }
      });

      // Record run completion
      await this.runRecorder.completeRun({
        runId,
        outputs: { pr, prNumber: pr.number }
      });

      // REFACTORED: Emit success event to orchestrator instead of setting state directly
      await this.workflowQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'apply_patches',
          result: { pr, prNumber: pr.number }
        }
      });

      return { ok: true, pr };
    } catch (err: any) {
      // Record run failure
      await this.runRecorder.failRun({
        runId,
        errorMsg: String(err?.message ?? err)
      });
      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.apply_patches.blocked',
          payload: { patchSetId, error: String(err?.message ?? err) }
        }
      });

      // REFACTORED: Emit failure event to orchestrator instead of setting state directly
      await this.workflowQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_FAILED',
          stage: 'apply_patches',
          error: String(err?.message ?? err)
        }
      });

      return { ok: false, error: String(err?.message ?? err) };
    }
  }
}
