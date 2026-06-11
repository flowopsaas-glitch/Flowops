import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    total_tokens?: number;
  };
}

@Injectable()
export class AiOpsService {
  constructor(private config: ConfigService) {}

  async assist(domain: string, message: string, context: any) {
    // Check if Groq API key is configured
    const groqApiKey = this.config.get('GROQ_API_KEY');
    
    if (!groqApiKey || groqApiKey === 'your_groq_api_key_here') {
      return {
        response: "Groq API key not configured. Please add GROQ_API_KEY to your .env file.",
        provider: "error",
      };
    }

    // Call Groq API
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
              content: `You are FlowOps AI Copilot, an expert logistics assistant. Domain: ${domain}. Context: ${JSON.stringify(context)}`
            },
            {
              role: 'user',
              content: message
            }
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      const data: GroqResponse = await response.json();
      
      return {
        response: data.choices?.[0]?.message?.content || 'No response from AI',
        provider: 'groq',
        tokens: data.usage?.total_tokens || 0,
      };
    } catch (error: any) {
      console.error('Groq API error:', error);
      return {
        response: `Error calling Groq API: ${error.message}`,
        provider: 'error',
      };
    }
  }

  async executeAction(action: any, context: any) {
    // Implement action execution logic here
    return {
      success: true,
      message: 'Action executed successfully',
      result: {},
    };
  }
}
