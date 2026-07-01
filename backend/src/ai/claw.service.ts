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
  async processTenantQuery(command: string, companyId: string): Promise<any> {
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
      const pending = await this.prisma.collection.count({ where: { status: 'PENDING', companyId } });
      return {
        reply: `I'm shifting your view to the Collections workspace. We have ${pending} active collections in flight. What specifically should I investigate in the table?`,
        redirect: '/dashboard/collections'
      };
    }

    // 🧠 INTELLECTUAL RESPONSE: Uses your real logistics context
    return this.generateGroqResponse(command, companyId);
  }

  private async generateGroqResponse(command: string, companyId: string): Promise<any> {
    // Build real tenant context from live data so the AI gives accurate advice,
    // not fabricated numbers that happen to be wrong for every single tenant.
    let contextLine = 'Context: No live data available yet.';
    try {
      const [driverCount, collectionCount, waybillCount] = await Promise.all([
        this.prisma.driver.count({ where: { companyId, isActive: true, status: { in: ['AVAILABLE', 'ON_ROUTE'] } } }),
        this.prisma.collection.count({ where: { companyId, status: { notIn: ['CANCELLED', 'COLLECTED'] } } }),
        this.prisma.waybill.count({ where: { companyId, status: { in: ['PENDING', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } } }),
      ]);
      contextLine = `Context: ${driverCount} active driver(s), ${collectionCount} open collection(s), ${waybillCount} in-flight waybill(s).`;
    } catch (e: any) {
      this.logger.warn(`Could not load live context for CLAW chat: ${e.message}`);
    }

    const systemPrompt = `
      You are Gemini, the intellectual core of the FlowOps Claw. 
      You are an authentic, adaptive collaborator with a touch of wit.
      ${contextLine}
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
          model: 'llama-3.3-70b-versatile',
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

