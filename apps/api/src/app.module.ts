import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { parseRedisUrl } from './redis';
import { PatchesController } from './patches.controller';

@Module({
  imports: [
    BullModule.forRoot({
      connection: parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379')
    }),
    BullModule.registerQueue({ name: 'workflow' })
  ],
  controllers: [WorkflowsController, PatchesController],
  providers: [WorkflowsService]
})
export class AppModule {}
