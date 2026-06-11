// src/ai/model-router.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AiTaskType = 'chat' | 'extraction' | 'classification' | 'repair' | 'analysis' | 'vision';

@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);

  constructor(private config: ConfigService) {}

  selectModel(task: AiTaskType, urgency: 'low' | 'medium' | 'high' = 'medium'): string {
    if (urgency === 'high') {
      return this.config.get('AI_FAST_MODEL', 'llama-3.1-8b-instant');
    }

    switch (task) {
      case 'chat': return this.config.get('AI_CHAT_MODEL', 'llama-3.1-8b-instant');
      case 'extraction': return this.config.get('AI_EXTRACT_MODEL', 'llama-3.3-70b-versatile');
      case 'classification': return this.config.get('AI_CLASSIFY_MODEL', 'llama-3.1-8b-instant');
      case 'repair': return this.config.get('AI_REPAIR_MODEL', 'llama-3.3-70b-versatile');
      case 'analysis': return this.config.get('AI_ANALYSIS_MODEL', 'llama-3.3-70b-versatile');
      case 'vision': return this.config.get('AI_VISION_MODEL', 'llama-3.2-11b-vision-instruct');
      default: return this.config.get('AI_DEFAULT_MODEL', 'llama-3.1-8b-instant');
    }
  }

  getModelMetadata(model: string): { provider: string; costTier: 'low' | 'medium' | 'high' } {
    const fastModels = ['llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
    const premiumModels = ['llama-3.3-70b-versatile', 'llama-guard-3-8b'];
    
    if (fastModels.includes(model)) return { provider: 'Groq', costTier: 'low' };
    if (premiumModels.includes(model)) return { provider: 'Groq', costTier: 'high' };
    return { provider: 'Unknown', costTier: 'medium' };
  }

  estimateCost(tokens: number, model: string): number {
    const rates: Record<string, number> = {
      'llama-3.1-8b-instant': 0.00005,
      'llama-3.3-70b-versatile': 0.00088,
      'llama-guard-3-8b': 0.00005,
      'llama-3.2-11b-vision-instruct': 0.00015,
    };
    
    const rate = rates[model] || 0.0001;
    return (tokens / 1000) * rate;
  }
}
