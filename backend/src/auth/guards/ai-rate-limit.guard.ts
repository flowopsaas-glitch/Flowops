// src/auth/guards/ai-rate-limit.guard.ts
import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AiRateLimitGuard.name);
  
  constructor(
    private reflector: Reflector,
    @Inject('REDIS_CLIENT') private readonly redis: Redis
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Skip rate limiting for super admins
    if (user?.role === 'SUPER_ADMIN') {
      return true;
    }

    // Get rate limit config from metadata or use defaults
    const maxRequests = this.reflector.get<number>('ai_rate_limit:max', context.getHandler()) || 50;
    const windowSeconds = this.reflector.get<number>('ai_rate_limit:window', context.getHandler()) || 86400; // 24h default
    
    // Default limits by plan
    const planLimits: Record<string, { max: number; window: number }> = {
      FREE: { max: 50, window: 86400 },      // 50/day
      PRO: { max: 500, window: 86400 },      // 500/day
      ENTERPRISE: { max: 5000, window: 86400 }, // 5000/day
    };
    
    const plan = user?.plan || 'FREE';
    const config = planLimits[plan] || planLimits.FREE;
    
    const userId = user?.id || request.ip;
    const endpoint = request.route?.path || request.url;
    const key = `ai_limit:${userId}:${endpoint}`;

    try {
      // Get current count
      const current = await this.redis.get(key);
      const count = current ? parseInt(current) : 0;

      if (count >= config.max) {
        // Get TTL to tell user when they can retry
        const ttl = await this.redis.ttl(key);
        
        this.logger.warn(`Rate limit exceeded: user=${userId}, endpoint=${endpoint}, plan=${plan}`);
        
        throw new HttpException(
          {
            message: `AI request limit exceeded for ${plan} plan`,
            retryAfter: ttl > 0 ? ttl : config.window,
            upgradeUrl: "/billing/upgrade",
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      // Increment counter
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      
      // Set expiry on first request
      if (count === 0) {
        pipeline.expire(key, config.window);
      }
      
      await pipeline.exec();

      // Add rate limit headers to response
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-RateLimit-Limit', config.max);
      response.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - count - 1));
      response.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + config.window);

      return true;
      
    } catch (error: any) {
      // Re-throw TooManyRequestsException, log others
      if (error instanceof HttpException && (error as any).getStatus?.() === 429) {
        throw error;
      }
      this.logger.error(`Rate limit check failed: ${error.message}`);
      return true; // Fail open - don't block legitimate requests
    }
  }
}

/**
 * Decorator to set custom rate limits on endpoints
 * @example @AiRateLimit({ max: 10, window: 3600 }) // 10 requests/hour
 */
export const AiRateLimit = (options: { max: number; window: number }) => {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('ai_rate_limit:max', options.max, descriptor.value);
    Reflect.defineMetadata('ai_rate_limit:window', options.window, descriptor.value);
    return descriptor;
  };
};
