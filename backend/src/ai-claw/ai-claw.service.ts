import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

@Injectable()
export class AiClawService {
  constructor(private config: ConfigService) {}

  async query(message: string, context: any) {
    const groqApiKey = this.config.get('GROQ_API_KEY');
    
    if (!groqApiKey || groqApiKey === 'your_groq_api_key_here') {
      return {
        response: "THE CLAW: Groq API key not configured. Add GROQ_API_KEY to .env",
        signals: [],
        recommendations: [],
      };
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'You are THE CLAW - FlowOps Autonomous Logistics Intelligence. You analyze operational data and provide strategic recommendations. Format responses with clear signals and actionable recommendations.'
            },
            {
              role: 'user',
              content: `${message}\n\nContext: ${JSON.stringify(context)}`
            }
          ],
          temperature: 0.5,
          max_tokens: 1000,
        }),
      });

      const data: GroqResponse = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Parse signals and recommendations from response
      return {
        response: content,
        signals: this.extractSignals(content),
        recommendations: this.extractRecommendations(content),
      };
    } catch (error: any) {
      console.error('THE CLAW error:', error);
      return {
        response: `SIGNAL_LOST: ${error.message}`,
        signals: [],
        recommendations: [],
      };
    }
  }

  private extractSignals(content: string): string[] {
    const signals: string[] = [];
    const lines = content.split('\n');
    lines.forEach(line => {
      if (line.includes('SIGNAL') || line.includes('ALERT') || line.includes('RISK')) {
        signals.push(line.trim());
      }
    });
    return signals;
  }

  private extractRecommendations(content: string): string[] {
    const recommendations: string[] = [];
    const lines = content.split('\n');
    lines.forEach(line => {
      if (line.includes('RECOMMEND') || line.includes('ACTION') || line.includes('DO')) {
        recommendations.push(line.trim());
      }
    });
    return recommendations;
  }
}
