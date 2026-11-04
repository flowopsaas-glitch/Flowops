import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GLOBAL_PREFIX_EXCLUDE } from './common/health/health-routes';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { initSentry } from './common/sentry';
import { multipartAggregateLimitMiddleware } from './common/middleware/multipart-aggregate-limit.middleware';

async function bootstrap() {
  // Initialise error tracking before anything else so early failures are caught.
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Trust the FULL internal proxy chain (Cloudflare tunnel -> nginx -> Docker
  // bridge) so req.ip reflects the real forwarded client address — needed for
  // accurate rate-limit tracking, login-IP audit and tenant presence geo.
  //
  // `trust proxy: 1` only strips ONE hop, which in this stack lands on the
  // Docker gateway (172.18.0.x) instead of the client. Trusting loopback +
  // private ranges makes Express walk back through every internal hop to the
  // first PUBLIC address in X-Forwarded-For — which can't be spoofed by the
  // client because everything in front of the app is our own trusted infra.
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

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
  // Cap raw multipart bytes before Multer can buffer file parts. This remains
  // effective for chunked requests that omit Content-Length.
  app.use(multipartAggregateLimitMiddleware);
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
    // `/health` is the INTERNAL probe: Docker HEALTHCHECK, compose healthcheck,
    // the deploy script and CI all call it on the container's own root, so it
    // must stay un-prefixed. `/api/v1/health` is the PUBLIC one — nginx proxies
    // only `/api/`, so it is the only health URL that survives the tunnel. Both
    // delegate to HealthSentinelService.probe(), so they cannot disagree.
    //
    // The list lives in common/health/health-routes.ts so a test can boot a real
    // app with these exact values and prove the paths resolve.
    exclude: [...GLOBAL_PREFIX_EXCLUDE],
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
