import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EnvValidator {
  private readonly logger = new Logger('EnvValidator');

  constructor(private config: ConfigService) {}

  validate() {
    const required = [
      'APP_KEY',
      'JWT_SECRET',
      'DATABASE_URL',
      'REDIS_HOST',
    ];

    const missing = required.filter(key => !this.config.get(key));

    if (missing.length > 0) {
      this.logger.error('MISSING ENV VARS: ' + missing.join(', '));
      throw new Error('Missing required environment variables: ' + missing.join(', '));
    }

    this.logger.log('Environment validation passed');
  }
}
