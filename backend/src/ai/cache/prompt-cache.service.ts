// src/ai/cache/prompt-cache.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createHash } from 'crypto';

@Injectable()
export class PromptCacheService {
  private readonly logger = new Logger(PromptCacheService.name);
  private readonly DEFAULT_TTL = 3600;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  private hashKey(prompt: string, contextHash: string): string {
    return createHash('md5').update(`prompt:${prompt}:${contextHash}`).digest('hex');
  }

  private hashContext(context: any): string {
    return createHash('md5').update(JSON.stringify(context, Object.keys(context).sort())).digest('hex');
  }

  async get(prompt: string, context: any): Promise<string | null> {
    try {
      const contextHash = this.hashContext(context);
      const key = this.hashKey(prompt, contextHash);
      const cached = await this.redis.get(key);
      
      if (cached) {
        this.logger.debug(`Cache HIT for prompt hash: ${key.substring(0, 8)}...`);
        return cached;
      }
      
      this.logger.debug(`Cache MISS for prompt hash: ${key.substring(0, 8)}...`);
      return null;
      
    } catch (error: any) {
      this.logger.error(`Cache get failed: ${error.message}`);
      return null;
    }
  }

  async set(prompt: string, context: any, response: string, ttlSeconds?: number): Promise<void> {
    try {
      const contextHash = this.hashContext(context);
      const key = this.hashKey(prompt, contextHash);
      const ttl = ttlSeconds || this.DEFAULT_TTL;
      await this.redis.setex(key, ttl, response);
      this.logger.debug(`Cache SET for prompt hash: ${key.substring(0, 8)}... (TTL: ${ttl}s)`);
    } catch (error: any) {
      this.logger.error(`Cache set failed: ${error.message}`);
    }
  }

  async clearPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.scan(0, 'MATCH', `prompt:${pattern}*`, 'COUNT', 100);
      const matchedKeys = keys[1];
      
      if (matchedKeys.length > 0) {
        await this.redis.del(...matchedKeys);
        this.logger.log(`Cleared ${matchedKeys.length} cache entries matching: ${pattern}`);
      }
      
      return matchedKeys.length;
    } catch (error: any) {
      this.logger.error(`Cache clear failed: ${error.message}`);
      return 0;
    }
  }

  async getStats(): Promise<{ keysCount: number; memoryUsage: string }> {
    try {
      const [keysCount, info] = await Promise.all([
        this.redis.dbsize(),
        this.redis.info('memory'),
      ]);

      const memoryLine = info.split('\n').find(line => line.startsWith('used_memory_human:'));
      
      return {
        keysCount: keysCount as number,
        memoryUsage: memoryLine ? memoryLine.split(':')[1].trim() : 'unknown',
      };
    } catch (error: any) {
      this.logger.error(`Cache stats failed: ${error.message}`);
      return { keysCount: 0, memoryUsage: 'error' };
    }
  }
}
