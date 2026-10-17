import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

export const REDIS_CLIENT = 'FLOWOPS_REDIS_CLIENT';

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLifecycle.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'end') return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
    this.logger.log('Redis connection closed');
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const options: RedisOptions = {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 5_000,
          commandTimeout: 5_000,
          retryStrategy: (attempt) => Math.min(attempt * 250, 2_000),
        };
        const url = config.get<string>('REDIS_URL');
        const client = url
          ? new Redis(url, options)
          : new Redis({
              host: config.get<string>('REDIS_HOST', '127.0.0.1'),
              port: Number(config.get<string>('REDIS_PORT', '6379')),
              password: config.get<string>('REDIS_PASSWORD') || undefined,
              ...options,
            });
        const logger = new Logger('REDIS');
        client.on('ready', () => logger.log('Redis connection ready'));
        client.on('error', (error: Error) => logger.error(`Redis connection error: ${error.message}`));
        return client;
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
