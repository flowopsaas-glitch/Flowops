// src/ai/plugins/groq.plugin.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiPlugin, AiPluginContext, AiPluginResult } from './plugin.interface';
import { SecretsService } from '../../lib/secrets.service';

@Injectable()
export class GroqPlugin implements AiPlugin {
  private readonly logger = new Logger(GroqPlugin.name);
  private readonly endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    private config: ConfigService,
    private secrets: SecretsService
  ) {}

  name = 'groq-llama3';

  async execute(
    input: { messages: Array<{ role: string; content: string }> },
    context: AiPluginContext
  ): Promise<AiPluginResult> {
    const startTime = Date.now();
    
    try {
      const apiKey = await this.secrets.get('GROQ_API_KEY');
      const model = this.config.get('AI_DEFAULT_MODEL', 'llama-3.1-8b-instant');

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Request-ID': context.requestId,
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      const content = data?.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('Invalid response structure from Groq API');
      }

      const latencyMs = Date.now() - startTime;
      const tokensUsed = data?.usage?.total_tokens || 0;

      // Update telemetry
      if (context.telemetry) {
        context.telemetry.tokensUsed = tokensUsed;
        context.telemetry.model = model;
      }

      return {
        success: true,
        data: { content, usage: data.usage },
        metadata: {
          model,
          tokensUsed,
          latencyMs,
        },
      };

    } catch (error: any) {
      this.logger.error(`GroqPlugin execution failed: ${error.message}`, error.stack);
      
      return {
        success: false,
        error: error.message,
        metadata: {
          model: 'unknown',
          tokensUsed: 0,
          latencyMs: Date.now() - startTime,
        },
      };
    }
  }

  validateOutput(output: any): boolean {
    // Ensure output has the expected structure
    return (
      typeof output === 'object' &&
      output !== null &&
      typeof output.content === 'string' &&
      output.content.length > 0
    );
  }

  getMetadata() {
    return {
      version: '1.0.0',
      provider: 'Groq',
      models: [
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile',
        'llama-guard-3-8b',
        'llama-3.2-11b-vision-instruct',
      ],
      capabilities: ['chat', 'extraction', 'classification', 'code-repair'],
    };
  }
}
