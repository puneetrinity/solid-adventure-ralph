import { Processor, Process } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getPrisma } from '@db';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { RunRecorder } from '@core/audit/run-recorder';
import type { TransitionEvent } from '@core/workflow/states';

export type OrchestrateJobPayload = {
  workflowId: string;
  event: TransitionEvent;
};

@Processor('workflow')
export class OrchestrateProcessor {
  private prisma = getPrisma();
  private runRecorder = new RunRecorder(this.prisma);

  constructor(private readonly orchestrator: OrchestratorService) {}

  @Process('orchestrate')
  async handle(job: Job<OrchestrateJobPayload>) {
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
