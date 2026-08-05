import {
  CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ObservabilityService } from './observability.service';

/**
 * Global interceptor that feeds unexpected (5xx) server errors into the CLAW
 * Observatory, then rethrows so the existing HttpExceptionFilter still formats
 * the HTTP response. Implemented as an interceptor (not a filter edit) so it
 * composes cleanly with the existing/other exception handling.
 */
@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((err) => {
        try {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          // Only capture server-side failures — 4xx client errors are expected.
          if (status >= 500 && context.getType() === 'http') {
            const req: any = context.switchToHttp().getRequest();
            void this.observability
              .capture({
                source: 'backend',
                level: 'error',
                message: err?.message || String(err),
                stack: err?.stack,
                path: req?.url,
                method: req?.method,
                userId: req?.user?.id,
                companyId: req?.user?.companyId,
                context: { name: err?.name, code: err?.code },
              })
              .catch(() => undefined);
          }
        } catch {
          /* error reporting must never break the request */
        }
        return throwError(() => err);
      }),
    );
  }
}
