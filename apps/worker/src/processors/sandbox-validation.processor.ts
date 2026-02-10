import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { createHash } from 'crypto';
import { WriteGate, RunRecorder, PatchApplicator, type GitHubClient } from '@arch-orchestrator/core';
import { GITHUB_CLIENT_TOKEN } from '../constants';

interface SandboxJobData {
  workflowId: string;
  patchSetId: string;
}

type SandboxResult = {
  kind: 'SandboxResultV1';
  status: 'pass' | 'fail';
  conclusion: string;
  runId?: number;
  runUrl?: string;
  logsUrl?: string;
  branch: string;
  repo: string;
  patchSetId: string;
  workflowId: string;
  createdAt: string;
  durationMs?: number;
  commitShas?: string[];
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

@Processor('sandbox')
export class SandboxValidationProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);
  private readonly logger = new Logger(SandboxValidationProcessor.name);

  constructor(
    @Inject(GITHUB_CLIENT_TOKEN) private readonly github: GitHubClient,
    @InjectQueue('orchestrate') private readonly orchestrateQueue: Queue
  ) {
    super();
  }

  async process(job: Job<SandboxJobData>) {
    const { workflowId, patchSetId } = job.data;

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { repos: true }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (workflow.stage === 'sandbox' && workflow.stageStatus === 'pending') {
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { stageStatus: 'processing', stageUpdatedAt: new Date() }
      });
    }

    const patchSet = await this.prisma.patchSet.findUnique({
      where: { id: patchSetId }
    });

    if (!patchSet) {
      throw new Error(`PatchSet ${patchSetId} not found`);
    }

    if (patchSet.workflowId !== workflowId) {
      throw new Error(`PatchSet ${patchSetId} does not belong to workflow ${workflowId}`);
    }

    const repoOwner = patchSet.repoOwner ||
      workflow.repos?.find(r => r.role === 'primary')?.owner ||
      workflow.repoOwner;
    const repoName = patchSet.repoName ||
      workflow.repos?.find(r => r.role === 'primary')?.repo ||
      workflow.repoName;

    const matchingRepo = workflow.repos?.find(r => r.owner === repoOwner && r.repo === repoName);
    const baseBranch = matchingRepo?.baseBranch ||
      workflow.repos?.find(r => r.role === 'primary')?.baseBranch ||
      workflow.baseBranch;

    if (!repoOwner || !repoName) {
      throw new Error(`Workflow ${workflowId} missing repository configuration`);
    }

    const sandboxWorkflowId = process.env.SANDBOX_WORKFLOW_ID || process.env.SANDBOX_WORKFLOW_FILE;
    if (!sandboxWorkflowId) {
      throw new Error('SANDBOX_WORKFLOW_ID not set');
    }

    const pollIntervalMs = Number.parseInt(process.env.SANDBOX_POLL_INTERVAL_MS || '5000', 10);
    const timeoutMs = Number.parseInt(process.env.SANDBOX_TIMEOUT_MS || String(20 * 60 * 1000), 10);

    const branchName = `arch-orchestrator/sandbox/${workflowId.slice(0, 8)}/${patchSetId.slice(0, 8)}-${Date.now()}`;

    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'sandbox_validation',
      inputs: {
        workflowId,
        patchSetId,
        repoOwner,
        repoName,
        baseBranch,
        branchName,
        sandboxWorkflowId
      }
    });

    const writeGate = new WriteGate(this.prisma, this.github);
    const patchApplicator = new PatchApplicator(this.prisma, writeGate);

    try {
      this.logger.log(`Applying patches to sandbox branch for ${repoOwner}/${repoName}`);

      const applyResult = await patchApplicator.applyPatchesToBranch({
        workflowId,
        patchSetId,
        owner: repoOwner,
        repo: repoName,
        baseBranch,
        branchName
      });

      if (!applyResult.success) {
        throw new Error(applyResult.error || 'Failed to apply patches to sandbox branch');
      }

      this.logger.log(`Dispatching workflow ${sandboxWorkflowId} for ${repoOwner}/${repoName} on ${branchName}`);

      await this.github.dispatchWorkflow({
        owner: repoOwner,
        repo: repoName,
        workflowId: sandboxWorkflowId,
        ref: branchName,
        inputs: {
          workflowId,
          patchSetId
        }
      });

      const run = await this.waitForRun({
        owner: repoOwner,
        repo: repoName,
        workflowId: sandboxWorkflowId,
        branch: branchName,
        timeoutMs,
        pollIntervalMs
      });

      const conclusion = run.conclusion || 'failure';
      const status: 'pass' | 'fail' = conclusion === 'success' ? 'pass' : 'fail';
      const durationMs = run.createdAt && run.updatedAt
        ? new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime()
        : undefined;

      const artifact: SandboxResult = {
        kind: 'SandboxResultV1',
        status,
        conclusion,
        runId: run.id,
        runUrl: run.htmlUrl,
        logsUrl: run.logsUrl,
        branch: branchName,
        repo: `${repoOwner}/${repoName}`,
        patchSetId,
        workflowId,
        createdAt: new Date().toISOString(),
        durationMs,
        commitShas: applyResult.commitShas
      };

      const artifactContent = JSON.stringify(artifact, null, 2);
      const contentSha = createHash('sha256').update(artifactContent, 'utf8').digest('hex');

      const existingArtifact = await this.prisma.artifact.findFirst({
        where: { workflowId, kind: 'SandboxResultV1' },
        orderBy: { artifactVersion: 'desc' }
      });

      await this.prisma.artifact.create({
        data: {
          workflowId,
          kind: 'SandboxResultV1',
          path: `.ai/SANDBOX-${patchSetId}.json`,
          content: artifactContent,
          contentSha,
          artifactVersion: existingArtifact ? existingArtifact.artifactVersion + 1 : 1,
          supersedesArtifactId: existingArtifact?.id || null
        }
      });

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.sandbox.completed',
          payload: { patchSetId, status, conclusion, runId: run.id, runUrl: run.htmlUrl, logsUrl: run.logsUrl }
        }
      });

      if (workflow.stage === 'sandbox') {
        const proposedPatchSets = await this.prisma.patchSet.findMany({
          where: { workflowId, status: 'proposed' },
          select: { id: true }
        });

        let remaining = 0;
        let anyFailed = false;

        for (const ps of proposedPatchSets) {
          const event = await this.prisma.workflowEvent.findFirst({
            where: {
              workflowId,
              type: 'worker.sandbox.completed',
              payload: { path: ['patchSetId'], equals: ps.id }
            }
          });

          if (!event) {
            remaining += 1;
          } else if ((event.payload as any)?.status === 'fail') {
            anyFailed = true;
          }
        }

        if (remaining === 0) {
          await this.prisma.workflow.update({
            where: { id: workflowId },
            data: { stageStatus: anyFailed ? 'blocked' : 'ready', stageUpdatedAt: new Date() }
          });
        }
      }

      await this.runRecorder.completeRun({
        runId,
        outputs: {
          status,
          conclusion,
          runId: run.id,
          runUrl: run.htmlUrl,
          logsUrl: run.logsUrl
        }
      });

      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'sandbox',
          result: { status, conclusion }
        }
      });

      return { ok: true, status, conclusion };
    } catch (error: any) {
      const errorMsg = String(error?.message ?? error);
      this.logger.error(`Sandbox validation failed: ${errorMsg}`);

      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { stageStatus: 'blocked', stageUpdatedAt: new Date() }
      });

      await this.runRecorder.failRun({ runId, errorMsg });

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.sandbox.failed',
          payload: { patchSetId, error: errorMsg }
        }
      });

      await this.orchestrateQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_FAILED',
          stage: 'sandbox',
          error: errorMsg
        }
      });

      throw error;
    }
  }

  private async waitForRun(params: {
    owner: string;
    repo: string;
    workflowId: string;
    branch: string;
    timeoutMs: number;
    pollIntervalMs: number;
  }) {
    const deadline = Date.now() + params.timeoutMs;

    while (Date.now() < deadline) {
      const list = await this.github.listWorkflowRuns({
        owner: params.owner,
        repo: params.repo,
        workflowId: params.workflowId,
        branch: params.branch,
        event: 'workflow_dispatch',
        perPage: 5
      });

      const run = list.runs.find(r => r.headBranch === params.branch) || list.runs[0];
      if (run) {
        if (run.status === 'completed') {
          return run;
        }

        if (run.id) {
          const detail = await this.github.getWorkflowRun({
            owner: params.owner,
            repo: params.repo,
            runId: run.id
          });

          if (detail.status === 'completed') {
            return detail;
          }
        }
      }

      await sleep(params.pollIntervalMs);
    }

    throw new Error('Sandbox validation timed out');
  }
}
