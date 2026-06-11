// src/ai/guardians/action-guardian.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class ActionGuardian {
  private readonly logger = new Logger(ActionGuardian.name);
  
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async validate(
    action: string, 
    context: any, 
    user: { id: string; role: string; plan?: string }
  ): Promise<{ allowed: boolean; reason?: string }> {
    
    const dangerousActions = ['delete_company', 'wipe_database', 'execute_raw_sql'];
    if (dangerousActions.includes(action) && user.role !== 'SUPER_ADMIN') {
      this.logger.warn(`User ${user.id} attempted blocked action: ${action}`);
      return { allowed: false, reason: 'Insufficient permissions' };
    }

    const rateLimitedActions = ['auto_repair_code', 'bulk_waybill_create', 'mass_email_send'];
    if (rateLimitedActions.includes(action)) {
      const isLimited = await this.isRateLimited(user.id, action, user.plan);
      if (isLimited) {
        this.logger.warn(`Rate limit exceeded for user ${user.id} on action ${action}`);
        return { allowed: false, reason: 'Rate limit exceeded' };
      }
    }

    if (action.includes('create') || action.includes('update') || action.includes('delete')) {
      if (!context?.companyId) {
        return { allowed: false, reason: 'Missing companyId in context' };
      }
    }

    return { allowed: true };
  }

  private async isRateLimited(userId: string, action: string, plan?: string): Promise<boolean> {
    const limits: Record<string, { free: number; pro: number; enterprise: number }> = {
      'auto_repair_code': { free: 5, pro: 50, enterprise: 500 },
      'bulk_waybill_create': { free: 10, pro: 100, enterprise: 1000 },
      'mass_email_send': { free: 20, pro: 200, enterprise: 2000 },
    };

    const limitConfig = limits[action];
    if (!limitConfig) return false;

    const maxRequests = limitConfig[plan as keyof typeof limitConfig] || limitConfig.free;
    const windowSeconds = 3600;
    const key = `ai_rate_limit:${userId}:${action}`;

    const current = await this.redis.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= maxRequests) {
      return true;
    }

    await this.redis.incr(key);
    await this.redis.expire(key, windowSeconds);

    return false;
  }

  async logAction(
    userId: string,
    action: string,
    result: 'allowed' | 'blocked',
    reason?: string
  ): Promise<void> {
    const logEntry = {
      userId,
      action,
      result,
      reason,
      timestamp: new Date().toISOString(),
    };
    
    await this.redis.xadd('ai_audit_log', '*', ...Object.entries(logEntry).flat());
    this.logger.debug(`AI Action Audit: ${JSON.stringify(this.redactForLog(logEntry))}`);
  }

  private redactForLog(obj: any): any {
    const redacted = { ...obj };
    if (redacted.context?.command) redacted.context.command = '[REDACTED]';
    return redacted;
  }
}
