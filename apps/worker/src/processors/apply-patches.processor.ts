import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { WriteGate, RunRecorder, PatchApplicator, type GitHubClient } from '@arch-orchestrator/core';
import { GITHUB_CLIENT_TOKEN } from '../constants';

@Processor('apply_patches')
export class ApplyPatchesProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);
  private readonly logger = new Logger(ApplyPatchesProcessor.name);

  constructor(
    @Inject(GITHUB_CLIENT_TOKEN) private readonly github: GitHubClient,
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {
    super();
  }

  async process(job: Job<{ workflowId: string; patchSetId: string }>) {
    const { workflowId, patchSetId } = job.data;

    // Get workflow with repo info
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (!workflow.repoOwner || !workflow.repoName) {
      throw new Error(`Workflow ${workflowId} missing repository configuration`);
    }

    // Validate patchSet belongs to this workflow
    const patchSet = await this.prisma.patchSet.findUnique({
      where: { id: patchSetId }
    });

    if (!patchSet) {
      throw new Error(`PatchSet ${patchSetId} not found`);
    }

    if (patchSet.workflowId !== workflowId) {
      throw new Error(`PatchSet ${patchSetId} does not belong to workflow ${workflowId}`);
    }

    this.logger.log(`Applying patches for ${workflow.repoOwner}/${workflow.repoName}`);

    // Record run start
    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'apply_patches',
      inputs: { workflowId, patchSetId }
    });

    const writeGate = new WriteGate(this.prisma, this.github);
    const patchApplicator = new PatchApplicator(this.prisma, writeGate);

    try {
      // Use PatchApplicator which handles:
      // - Unique branch naming
      // - WriteGate enforcement for all operations
      // - Actual diff application
      // - PR creation and recording
      const result = await patchApplicator.applyPatches({
        workflowId,
        patchSetId,
        owner: workflow.repoOwner,
        repo: workflow.repoName,
        baseBranch: workflow.baseBranch
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to apply patches');
      }

      this.logger.log(`Created PR #${result.prNumber}: ${result.prUrl}`);

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.apply_patches.opened_pr',
          payload: {
            patchSetId,
            prNumber: result.prNumber,
            prUrl: result.prUrl,
            branchName: result.branchName,
            commitShas: result.commitShas
          }
        }
      });

      // Record run completion
      await this.runRecorder.completeRun({
        runId,
        outputs: {
          prNumber: result.prNumber,
          prUrl: result.prUrl,
          branchName: result.branchName
        }
      });

      // Emit success event to orchestrator
      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'apply_patches',
          result: {
            prNumber: result.prNumber,
            prUrl: result.prUrl
          }
        }
      });

      return { ok: true, prNumber: result.prNumber, prUrl: result.prUrl };
    } catch (err: any) {
      const errorMsg = String(err?.message ?? err);
      this.logger.error(`Failed to apply patches: ${errorMsg}`);

      // Record run failure
      await this.runRecorder.failRun({
        runId,
        errorMsg
      });

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.apply_patches.failed',
          payload: { patchSetId, error: errorMsg }
        }
      });

      // Emit failure event to orchestrator
      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_FAILED',
          stage: 'apply_patches',
          error: errorMsg
        }
      });

      return { ok: false, error: errorMsg };
    }
  }
}
