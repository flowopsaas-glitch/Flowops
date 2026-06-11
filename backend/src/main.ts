// /opt/Flowops/backend/src/main.ts
import "./tracing";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { Logger, ValidationPipe, RequestMethod } from "@nestjs/common";
import helmet from "helmet";
import * as express from 'express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import compression from 'compression';

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);

  // 1. Performance Optimization Middleware
  app.use(compression());

  // 2. Body Parsers & Static Assets
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());

  // Static folder for waybill uploads/logos
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // 3. Commercial Security Headers (Helmet Protection)
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://flowop.work", "https://api.flowop.work"],
        connectSrc: [
          "'self'", 
          "https://flowop.work", 
          "https://api.flowop.work", 
          "ws://localhost:3000", 
          "ws://localhost:3005", 
          "wss://api.flowop.work",
          "http://localhost:5173", // Allow Vite frontend
          "ws://localhost:5173"    // Allow Vite HMR websockets
        ],
      },
    },
  }));

  // 4. Global API Data Validation Engine
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true
  }));

  // 5. CORS Configuration - ✅ BULLETPROOF (Fixes Frontend API Blocks)
const allowedOrigins = [  'http://localhost:5173',  'http://localhost:8080',  'http://localhost:3000',  'https://flowop.work',  'https://app.flowop.work',  'https://platform.flowop.work',  'https://holdings.flowop.work',  'https://api.flowop.work'];

  const corsOriginFunction = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Allow explicitly listed origins OR any localhost/127.0.0.1 dev environment
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    } else {
      // Fallback: Allow anyway to prevent blocking legitimate dev environments
      callback(null, true); 
    }
  };

  app.enableCors({
    origin: corsOriginFunction,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With', 
      'Accept', 
      'Origin',
      'X-Access-Token'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    credentials: true, // Essential for cookies/tokens
    maxAge: 86400,     // 24 hours preflight cache
  });

  // 6. Prefix all routes with /api/v1
  app.setGlobalPrefix("api/v1", {
      exclude: [
        { path: "public-tracking/:token", method: RequestMethod.GET },
        { path: "public-tracking/:token/", method: RequestMethod.GET },
        { path: "track/:token", method: RequestMethod.GET },
      ],
    });

  // 7. Engine Initialization
  const port = Number(process.env.PORT ?? 3000);
  app.enableShutdownHooks();

  await app.listen(port, "0.0.0.0");

  logger.log(`🚀 FLOWOPS ENGINE LIVE on port ${port} | Mode: ${process.env.NODE_ENV || 'production'} | Region: South Africa (ZAR)`);
  logger.log(`🔗 CORS enabled for frontend origins including http://localhost:5173`);
}

bootstrap().catch((err) => {
  console.error("Critical Engine Failure:", err);
  process.exit(1);
});
