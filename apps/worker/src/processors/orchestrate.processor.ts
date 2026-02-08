import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getPrisma } from '@arch-orchestrator/db';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { RunRecorder } from '@arch-orchestrator/core/audit/run-recorder';
import type { TransitionEvent } from '@arch-orchestrator/core/workflow/states';

export type OrchestrateJobPayload = {
  workflowId: string;
  event: TransitionEvent;
};

@Processor('orchestrate')
export class OrchestrateProcessor extends WorkerHost {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);

  constructor(private readonly orchestrator: OrchestratorService) {
    super();
  }

  async process(job: Job<OrchestrateJobPayload>) {
    const { workflowId, event } = job.data;

    // Record run start
    const runId = await this.runRecorder.startRun({
      workflowId,
      jobName: 'orchestrate',
      inputs: { workflowId, event }
    });

    try {
      const result = await this.orchestrator.handleEvent(workflowId, event);

      // Record run completion
      await this.runRecorder.completeRun({
        runId,
        outputs: { ok: true, result: result ?? null }
      });

      return { ok: true };
    } catch (err: any) {
      // Record run failure
      await this.runRecorder.failRun({
        runId,
        errorMsg: String(err?.message ?? err)
      });

      throw err;
    }
  }
}
