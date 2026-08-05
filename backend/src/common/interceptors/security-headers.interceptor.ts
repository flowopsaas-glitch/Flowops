import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Additional security headers beyond what Helmet provides.
 * Applied globally to every response.
 */
@Injectable()
export class SecurityHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse();

    // Prevent caching of authenticated API responses
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');

    // Prevent MIME sniffing (belt + suspenders with Helmet)
    response.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent embedding in iframes (clickjacking protection)
    response.setHeader('X-Frame-Options', 'DENY');

    // Remove server identification
    response.removeHeader('X-Powered-By');
    response.removeHeader('Server');

    // Permissions Policy — restrict browser features
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(self), payment=(self)',
    );

    return next.handle();
  }
}
