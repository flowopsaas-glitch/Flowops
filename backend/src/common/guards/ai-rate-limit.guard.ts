// Stricter rate limiting for AI endpoints — expensive Groq calls should be throttled
import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AiRateLimitGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const companyId = req.user?.companyId || 'anonymous';
    const userId = req.user?.sub || req.user?.id || 'unknown';
    return `ai:${companyId}:${userId}`;
  }

  protected throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        message: 'AI rate limit reached. You can make up to 30 AI requests per minute.',
        error: 'AI Rate Limit Exceeded',
        statusCode: 429,
        retryAfter: 60,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
