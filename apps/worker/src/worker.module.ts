import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { parseRedisUrl } from './redis';
import { IngestContextProcessor } from './processors/ingest-context.processor';
import { ApplyPatchesProcessor } from './processors/apply-patches.processor';
import { OrchestrateProcessor } from './processors/orchestrate.processor';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { StubGitHubClient } from './github.stub';

@Module({
  imports: [
    BullModule.forRoot({
      connection: parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379')
    }),
    BullModule.registerQueue({ name: 'workflow' })
  ],
  providers: [
    // Orchestrator (Phase 3)
    OrchestratorService,
    OrchestrateProcessor,

    // Stage processors
    IngestContextProcessor,
    ApplyPatchesProcessor,

    // GitHub client (stub for now)
    { provide: StubGitHubClient, useClass: StubGitHubClient }
  ]
})
export class WorkerModule {}
