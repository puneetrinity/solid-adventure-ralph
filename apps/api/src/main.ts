import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Capture raw body for webhook signature verification
  const rawBodySaver = (req: any, _res: any, buf: Buffer) => {
    if (buf?.length) {
      req.rawBody = buf;
    }
  };
  app.use(bodyParser.json({ verify: rawBodySaver }));
  app.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: true }));

  // Cookie parsing for auth
  app.use(cookieParser());

  // Configure CORS
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:4173'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-auth-bypass',
      'x-test-user',
      'x-test-user-id',
      'x-test-user-name',
      'x-test-user-avatar',
    ],
  });

  // Global exception filter for normalized errors
  app.useGlobalFilters(new HttpExceptionFilter());

  app.setGlobalPrefix('api');

  // Configure Swagger/OpenAPI
  const config = new DocumentBuilder()
    .setTitle('arch-orchestrator API')
    .setDescription('Policy-, gate-, and approval-driven workflow engine API')
    .setVersion('1.0')
    .addTag('workflows', 'Workflow management endpoints')
    .addTag('patches', 'Patch viewing endpoints')
    .addTag('auth', 'Authentication endpoints')
    .addTag('health', 'Health check endpoints')
    .addCookieAuth('auth_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}
bootstrap();
