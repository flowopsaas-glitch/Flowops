// Per-tenant rate limiting: each company gets its own rate limit bucket
// Prevents one bad tenant from exhausting limits for everyone
import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PerTenantThrottleGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Key = companyId + IP so each tenant has their own bucket
    const companyId = req.user?.companyId || 'anonymous';
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return `tenant:${companyId}:${ip}`;
  }

  protected throwThrottlingException(): Promise<void> {
    throw new HttpException(
      { message: 'Too many requests. Please slow down.', error: 'Too Many Requests', statusCode: 429 },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
