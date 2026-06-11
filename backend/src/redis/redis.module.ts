// src/redis/redis.module.ts
import { Module, Global, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (config: ConfigService) => {
        const redisHost = config.get('REDIS_HOST', 'localhost');
        const redisPort = config.get('REDIS_PORT', 6379);
        const redisPassword = config.get('REDIS_PASSWORD');
        const redisUrl = config.get('REDIS_URL');
        
        const client = new Redis(redisUrl || {
          host: redisHost,
          port: redisPort,
          password: redisPassword || undefined,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          retryStrategy: (times) => Math.min(times * 50, 2000),
          keepAlive: 30000,
        });

        client.on('error', (err) => {
          console.error('Redis connection error:', err);
        });

        client.on('connect', () => {
          console.log('✅ Redis connected');
        });

        await client.ping();
        
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
