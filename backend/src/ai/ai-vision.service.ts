// src/ai/ai-vision.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GroqVisionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

@Injectable()
export class AiVisionService {
  private readonly logger = new Logger(AiVisionService.name);
  private readonly groqApiKey: string;
  private readonly visionModel: string;

  constructor(private config: ConfigService) {
    this.groqApiKey = this.config.get<string>('GROQ_API_KEY') || '';
    this.visionModel = this.config.get<string>('AI_VISION_MODEL') || 'llama-3.2-11b-vision-instruct';
  }

  async analyzePod(imageUrl: string, waybillNumber: string): Promise<{
    isValid: boolean;
    hasSignature: boolean;
    confidence: number;
    summary: string;
    issues: string[];
  }> {
    try {
      if (!this.groqApiKey) {
        return {
          isValid: false,
          hasSignature: false,
          confidence: 0,
          summary: 'AI Vision not configured',
          issues: ['GROQ_API_KEY not set'],
        };
      }

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.visionModel,
          messages: [
            {
              role: 'system',
              content: 'You are FlowOps AI Vision. Analyze POD photos and respond with JSON: {isValid, hasSignature, confidence, summary, issues}'
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: `Analyze this POD for waybill ${waybillNumber}` },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            }
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: 'json_object' }
        }),
      });

      const data: GroqVisionResponse = await response.json() as GroqVisionResponse;
      const content = data.choices?.[0]?.message?.content || '{}';
      
      let analysis;
      try {
        analysis = JSON.parse(content);
      } catch {
        analysis = { isValid: true, hasSignature: false, confidence: 75, summary: content, issues: [] };
      }

      this.logger.log(`✅ AI Vision: ${waybillNumber} - ${analysis.confidence}% confidence`);
      
      return {
        isValid: analysis.isValid ?? true,
        hasSignature: analysis.hasSignature ?? false,
        confidence: analysis.confidence ?? 75,
        summary: analysis.summary || 'POD analyzed',
        issues: analysis.issues || [],
      };
    } catch (error: any) {
      this.logger.error(`❌ AI Vision failed: ${error.message}`);
      return {
        isValid: false,
        hasSignature: false,
        confidence: 0,
        summary: 'Analysis failed',
        issues: [error.message],
      };
    }
  }
}
