import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { initSentry } from './common/sentry';

async function bootstrap() {
  // Initialise error tracking before anything else so early failures are caught.
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Trust the proxy chain (Cloudflare tunnel -> nginx) so req.ip reflects the
  // forwarded client address — required for accurate rate-limit tracking.
  app.set('trust proxy', 1);

  const config = app.get(ConfigService);

  // ── Security: validate secrets at startup ────────────────────────────
  const jwtSecret = config.get<string>('JWT_SECRET', '');
  const jwtRefreshSecret = config.get<string>('JWT_REFRESH_SECRET', '');

  if (!jwtSecret) {
    Logger.error('JWT_SECRET is not set — refusing to start', 'Bootstrap');
    process.exit(1);
  }
  if (!jwtRefreshSecret) {
    Logger.error('JWT_REFRESH_SECRET is not set — refusing to start', 'Bootstrap');
    process.exit(1);
  }
  if (jwtSecret === jwtRefreshSecret) {
    Logger.error(
      'JWT_SECRET and JWT_REFRESH_SECRET must be different values. ' +
      'A shared secret means a stolen access token can also forge refresh tokens. ' +
      'Generate a new secret with: openssl rand -hex 32',
      'Bootstrap',
    );
    process.exit(1);
  }

  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const corsOrigins = config
    .get<string>('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  // ── Security headers ──────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: nodeEnv === 'production',
    }),
  );

  // ── CORS ──────────────────────────────────────────────────────────────
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Middleware ────────────────────────────────────────────────────────
  app.use(compression());
  app.use(cookieParser());

  // ── Global pipes, filters, interceptors ──────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown properties
      transform: true,       // auto-transform payloads to DTO class instances
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ── API versioning prefix ─────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: ['/health', '/api/v1/whatsapp/webhook', '/api/v1/paystack/webhook'],
  });

  // ── Swagger (dev only) ────────────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FlowOps API')
      .setDescription('FlowOps logistics SaaS — API reference')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
    Logger.log(`Swagger UI: http://localhost:${port}/docs`, 'Bootstrap');
  }

  await app.listen(port);
  Logger.log(
    `FlowOps backend running on http://localhost:${port} [${nodeEnv}]`,
    'Bootstrap',
  );
}

bootstrap();
