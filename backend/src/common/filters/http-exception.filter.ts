import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { reportToSentry } from '../sentry';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as any;
        message = resObj.message || message;
        if (Array.isArray(resObj.message)) {
          errors = resObj.message;
          message = 'Validation failed';
        }
      }
    } else if (exception instanceof Error) {
      // Prisma unique constraint violation
      if ((exception as any).code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'A record with that value already exists';
      } else if ((exception as any).code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found';
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(errors && { errors }),
      path: request.url,
      timestamp: new Date().toISOString(),
    });

    // Report unexpected (5xx) failures to Sentry with request context — 4xx
    // client errors are expected and intentionally skipped to avoid noise.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const user = (request as any).user;
      reportToSentry(exception, {
        method: request.method,
        path: request.url,
        statusCode: status,
        userId: user?.id,
        companyId: user?.companyId,
      });
    }
  }
}
