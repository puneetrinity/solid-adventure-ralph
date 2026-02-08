import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { parseRedisUrl } from './redis';
import { PatchesController } from './patches.controller';
import { HealthController } from './health.controller';
import { AuthController } from './auth.controller';
import { WebhooksController } from './webhooks.controller';
import { LoggingMiddleware } from './logging.middleware';

@Module({
  imports: [
    BullModule.forRoot({
      connection: parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379')
    }),
    BullModule.registerQueue({ name: 'workflow' }),
    BullModule.registerQueue({ name: 'orchestrate' })
  ],
  controllers: [WorkflowsController, PatchesController, HealthController, AuthController, WebhooksController],
  providers: [WorkflowsService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
