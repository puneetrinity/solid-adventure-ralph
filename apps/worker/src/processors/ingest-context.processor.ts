import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { createHash } from 'crypto';
import { RunRecorder } from '@arch-orchestrator/core';

@Processor('ingest_context')
export class IngestContextProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);

  constructor(@InjectQueue('workflow') private readonly workflowQueue: Queue) {
    super();
  }

  async process(job: Job<{ workflowId: string }>) {
    const { workflowId } = job.data;

    // Record run start
    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'ingest_context',
      inputs: { workflowId }
    });

    try {
      const baseSha = 'STUB_BASE_SHA';

      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { baseSha }
      });

      await this.prisma.workflowEvent.create({
        data: {
          workflowId,
          type: 'worker.ingest_context.completed',
          payload: { baseSha }
        }
      });

      // Stub Decision artifact
      const decisionContent = [
        '# Decision (stub)',
        '',
        '- Recommendation: DEFER',
        '- Reason: LLM integration not wired yet',
        '- Next: produce triage artifact via LLM runner'
      ].join('\n');

      const contentSha = createHash('sha256').update(decisionContent, 'utf8').digest('hex');

      await this.prisma.artifact.create({
        data: {
          workflowId,
          kind: 'DecisionV1',
          path: '.ai/DECISION.md',
          content: decisionContent,
          contentSha
        }
      });

      // Create a stub PatchSet + Patch so UI/API can preview diffs immediately.
      const patchSet = await this.prisma.patchSet.create({
        data: {
          workflowId,
          title: 'Stub PatchSet (example)',
          baseSha,
          status: 'proposed'
        }
      });

      const stubDiff = [
        'diff --git a/README.md b/README.md',
        'index 0000000..1111111 100644',
        '--- a/README.md',
        '+++ b/README.md',
        '@@ -1 +1,2 @@',
        '-Hello',
        '+Hello',
        '+(stub patch proposal)'
      ].join('\n');

      await this.prisma.patch.create({
        data: {
          patchSetId: patchSet.id,
          taskId: 'T-STUB',
          title: 'Stub patch (does nothing important)',
          summary: 'Demonstrates patch preview and approval/apply wiring.',
          diff: stubDiff,
          files: [{ path: 'README.md', additions: 1, deletions: 0 }],
          addsTests: false,
          riskLevel: 'low',
          proposedCommands: ['npm test']
        }
      });

      // Record run completion
      await this.runRecorder.completeRun({
        runId,
        outputs: { baseSha, patchSetId: patchSet.id }
      });

      // REFACTORED: Instead of directly setting state, emit event to orchestrator
      await this.workflowQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_COMPLETED',
          stage: 'ingest_context',
          result: { baseSha, patchSetId: patchSet.id }
        }
      });

      return { ok: true, patchSetId: patchSet.id };
    } catch (error: any) {
      // Record run failure
      await this.runRecorder.failRun({
        runId,
        errorMsg: String(error?.message ?? error)
      });
      // Emit failure event to orchestrator
      await this.workflowQueue.add('orchestrate', {
        workflowId,
        event: {
          type: 'E_JOB_FAILED',
          stage: 'ingest_context',
          error: String(error?.message ?? error)
        }
      });

      throw error;
    }
  }
}
