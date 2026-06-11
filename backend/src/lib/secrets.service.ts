// src/lib/secrets.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  
  constructor(private config: ConfigService) {}

  async get(key: string): Promise<string> {
    const value = this.config.get<string>(key);
    
    if (!value) {
      this.logger.error(`Secret ${key} is not configured in environment`);
      throw new Error(`Secret ${key} not configured`);
    }
    
    return value;
  }

  redact(obj: Record<string, any>): Record<string, any> {
    const redacted = { ...obj };
    const sensitiveKeys = ['password', 'key', 'token', 'secret', 'apiKey', 'auth'];
    
    for (const k of sensitiveKeys) {
      if (redacted[k] && typeof redacted[k] === 'string') {
        redacted[k] = '[REDACTED]';
      }
    }
    
    return redacted;
  }

  async validateRequired(keys: string[]): Promise<void> {
    const missing = keys.filter(key => !this.config.get(key));
    
    if (missing.length > 0) {
      this.logger.error(`Missing required secrets: ${missing.join(', ')}`);
      throw new Error(`Missing required secrets: ${missing.join(', ')}`);
    }
    
    this.logger.log(`✅ All required secrets validated: ${keys.join(', ')}`);
  }
}
