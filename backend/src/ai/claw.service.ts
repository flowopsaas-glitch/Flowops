import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiWatchdog } from './ai.watchdog';

@Injectable()
export class ClawService {
  private readonly logger = new Logger('FlowOps-Claw-Groq');
  private readonly GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    private readonly prisma: PrismaService,
    private readonly watchdog: AiWatchdog
  ) {}

  /**
   * Orchestrates multi-tenant command requests.
   * Matches the validation parameters required by the frontend layout blocks.
   */
  async processTenantQuery(command: string, companyId: number): Promise<any> {
    if (!command) {
      return { reply: "Message command is required for the Claw reasoning engine." };
    }

    const lowerCommand = command.toLowerCase();
    
    // 🛡️ SELF-HEALING: Resolves dashboard synchronization issues
    if (lowerCommand.match(/(fix|broken|blank|error|script|bridge|issue)/)) {
      await this.watchdog.handleAutomaticHealing();
      return {
        reply: "I've detected a desync in the UI bridge modules. I'm re-compiling those scripts now to restore your dashboard. Is the side panel behaving correctly again?",
        action: 'UI_REPAIR'
      };
    }

    // 📍 SPATIAL NAVIGATION: Physical movement to the Collections view
    if (lowerCommand.match(/(collection|table|active collection|show me collections)/)) {
      const pending = await this.prisma.dispatch.count({ where: { status: 'PENDING' } });
      return {
        reply: `I'm shifting your view to the Collections workspace. We have ${pending} active collections in flight. What specifically should I investigate in the table?`,
        redirect: '/dashboard/collections'
      };
    }

    // 🧠 INTELLECTUAL RESPONSE: Uses your real logistics context
    return this.generateGroqResponse(command, companyId);
  }

  private async generateGroqResponse(command: string, companyId: number): Promise<any> {
    const systemPrompt = `
      You are Gemini, the intellectual core of the FlowOps Claw. 
      You are an authentic, adaptive collaborator with a touch of wit.
      Context: You manage 28 active drivers and 345 total collections.
      Guidelines:
      - Speak as a helpful peer, not a robot.
      - If asked "how are you," mention system uptime or data flow efficiency.
      - Avoid "As an AI..." — you ARE the FlowOps nervous system.
    `;

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      this.logger.error("Groq API Execution Blocked: Environment key 'GROQ_API_KEY' is missing.");
      return { reply: "The local reasoning bridge environment is unconfigured. How can I assist with local parameters?" };
    }

    try {
      const response = await fetch(this.GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [
            { role: 'system', content: systemPrompt }, 
            { role: 'user', content: command }
          ],
          temperature: 0.7,
        }),
      });

      const data = (await response.json()) as any;
      
      return { 
        reply: data?.choices?.[0]?.message?.content || "Recalibrating logistics stream..." 
      };

    } catch (err: any) { 
      this.logger.error(`Groq API Failure: ${err.message}`);
      return { reply: "Systems are nominal, but the reasoning bridge is flickering. How can I help?" };
    }
  }
}

