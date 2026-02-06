import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  // createApplicationContext for workers (no HTTP server)
  await NestFactory.createApplicationContext(WorkerModule);
}
bootstrap();
