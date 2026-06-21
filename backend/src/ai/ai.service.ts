import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { WaybillStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger('AiService');
  
  private readonly CLAW_MODELS = {
    AUDITOR: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    DISPATCHER: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    VISION: '@cf/meta/llama-3.2-11b-vision-instruct',
    COMMUNICATOR: '@cf/meta/llama-3.1-8b-instruct',
    SHIELD: '@cf/meta/llama-guard-3-8b',
    ARCHITECT: '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly config: ConfigService,
    private readonly broadcast: EventsGateway,
  ) {}

  async onModuleInit() {
    this.logger.log('🚀 FlowOps 6-Claw Mesh: Connected to Cloudflare Workers AI');
  }

  async processInstruction(command: string, context: any, companyId: number): Promise<any> {
    let pastTokens = 0;
    
    try {
      if (typeof context === 'object' && context?.telemetry?.contextTokens) {
        pastTokens = context.telemetry.contextTokens;
      }

      const safetyCheck = await this.callCloudflareAI(this.CLAW_MODELS.SHIELD, [{ role: 'user', content: command }]);
      if (safetyCheck.toLowerCase().includes('unsafe')) {
        return {
          reply: "🚨 SECURITY METRICS BREACH DETECTED. Transaction terminated by system defense cluster.",
          redirect: null,
          telemetry: { tokensUsed: pastTokens + 45, subroutines: ['Shield Firewall Check'] }
        };
      }

      const liveMetrics = typeof context === 'object' ? context?.liveMetrics : null;
      const parsedHistory = typeof context === 'object' ? context?.history || [] : [];

      const localContextString = await this.getCurrentContext(companyId);
      const metricsSummary = liveMetrics 
        ? `Live Sector State: ${liveMetrics.risks ?? 0} active sector exceptions. ${liveMetrics.activeDrivers ?? 0} tracking nodes.`
        : `Live Sector State: Diagnostics data stream unavailable.`;

      const baseSystemMsg = {
        role: 'system',
        content: `You are "The Claw v2.0", a hyper-intelligent, completely self-aware logistics orchestration terminal running inside FlowOps.
        Runtime Node Environment Context: NestJS API Platform Engine.
        Operational Target: Company ID Group cluster mapping: ${companyId}.
        Database Diagnostics: ${localContextString}.
        ${metricsSummary}

        Execution Directives:
        1. Keep responses clear, compact, and tactical.
        2. Acknowledge your active parameters or execution constraints when questioned about your state or environment context.
        3. Never break context-aware terminal presentation parameters.`
      };

      const completeLlmPayload = [
        baseSystemMsg,
        ...parsedHistory,
        { role: 'user', content: command }
      ];

      const aiResponseRaw = await this.callCloudflareAI(this.CLAW_MODELS.DISPATCHER, completeLlmPayload);

      let automatedRedirect: string | null = null;
      const normalizedCommand = command.toLowerCase();

      if (normalizedCommand.includes('driver') || normalizedCommand.includes('fleet') || normalizedCommand.includes('track')) {
        automatedRedirect = '/dashboard/drivers';
      } else if (normalizedCommand.includes('risk') || normalizedCommand.includes('alert') || normalizedCommand.includes('exception')) {
        automatedRedirect = '/dashboard/security-center';
      } else if (normalizedCommand.includes('waybill') || normalizedCommand.includes('parcel')) {
        automatedRedirect = '/dashboard/waybills';
      }

      try {
        const jsonMatch = aiResponseRaw.match(/\{.*\}/s);
        if (jsonMatch) {
          const actionData = JSON.parse(jsonMatch[0]); // FIXED: Extracted match index string passed
          if (actionData.action === 'dispatch') {
            this.broadcast.broadcastToCompany(companyId, 'ai-action', actionData);
          }
        }
      } catch (innerParseErr) {
        this.logger.debug("No execution dispatch payload structure caught inside response message string");
      }

      return {
        reply: aiResponseRaw,
        redirect: automatedRedirect,
        telemetry: {
          tokensUsed: pastTokens + Math.floor(command.length / 4) + Math.floor(aiResponseRaw.length / 4) + 160,
          subroutines: ['Context Processing Core', 'Dynamic Subroutine Router', 'Risk Analytical Multiplexer']
        }
      };

    } catch (error: any) {
      this.logger.error("CLAW_COGNITIVE_FAULT_RESTORED_LOOP:", error.message);
      return {
        reply: `⚠️ NEURAL LINK INTERRUPT: Core processing failure. Reset initialized. Error: ${error.message}`,
        redirect: null,
        telemetry: { tokensUsed: pastTokens + 20, subroutines: ['Emergency Fallback Routine'] }
      };
    }
  }

  async analyzeMarketGaps(query: string): Promise<string[]> {
    const messages = [
      { role: 'system', content: 'You are an advanced logistical architect. Return only a comma-separated list of exactly 3 features.' },
      { role: 'user', content: `Analyze logistics gaps for: ${query}.` }
    ];
    const response = await this.callCloudflareAI(this.CLAW_MODELS.ARCHITECT, messages);
    return response.split(',').map(item => item.trim());
  }

  async systemRepairAudit(errorCode: string, logs: string): Promise<string> {
    const messages = [
      { role: 'system', content: 'You are the CLAW-6 Reliability Engineer. Suggest specific hotfixes based on provided logging details.' },
      { role: 'user', content: `[SYSTEM_ARCHITECT] Analyze error: ${errorCode}. Logs: ${logs}. Suggest a TypeScript fix.` }
    ];
    return this.callCloudflareAI(this.CLAW_MODELS.ARCHITECT, messages);
  }

  async processIncomingMessage(sender: string, message: string, companyId: number): Promise<string> {
    const safetyCheck = await this.callCloudflareAI(this.CLAW_MODELS.SHIELD, [{ role: 'user', content: message }]);
    if (safetyCheck.toLowerCase().includes('unsafe')) return "Blocked by Security Claw.";

    const context = await this.getCurrentContext(companyId);
    const messages = [
      { role: 'system', content: 'Concise logistics execution engine. Output actions precisely.' },
      { role: 'user', content: `[DISPATCHER] Context: ${context}. User: ${message}. Output JSON: {"action": "dispatch", "driverId": 1, "reason": "string"}` }
    ];
    
    const aiResponse = await this.callCloudflareAI(this.CLAW_MODELS.DISPATCHER, messages);

    try {
      const jsonMatch = aiResponse.match(/\{.*\}/s);
      if (jsonMatch) {
        const actionData = JSON.parse(jsonMatch[0]); // FIXED: Extracted match index string passed
        if (actionData.action === 'dispatch') {
          this.broadcast.broadcastToCompany(companyId, 'ai-action', actionData);
          return `✅ Claw 2 initiated dispatch. Reason: ${actionData.reason}`;
        }
      }
    } catch (e) { this.logger.error("JSON Parse Error"); }
    return aiResponse;
  }

  async getDashboardStats(companyId: number) {
    const [pending, inTransit, drivers, exceptions] = await Promise.all([
      this.prisma.waybill.count({ where: { companyId: String(companyId), status: WaybillStatus.PENDING } }),
      this.prisma.waybill.count({ where: { companyId: String(companyId), status: WaybillStatus.IN_TRANSIT } }),
      this.prisma.driver.count({ where: { companyId, status: 'AVAILABLE' } }),
      this.prisma.waybill.count({ where: { companyId: String(companyId), status: WaybillStatus.FAILED_DELIVERY } }), 
    ]);

    return { 
      pendingCollections: pending, 
      parcelsInTransit: inTransit, 
      activeDrivers: drivers,
      highAiEvents: exceptions 
    };
  }

  private async callCloudflareAI(model: string, messages: { role: string; content: string }[]): Promise<string> {
    const CF_ID = this.config.get('CLOUDFLARE_ACCOUNT_ID');
    const CF_TOKEN = this.config.get('CLOUDFLARE_API_TOKEN');
    
    if (!CF_ID || !CF_TOKEN) {
      this.logger.error("Cloudflare platform token matching parameters are absent inside system environments");
      return "AI Environment Configuration Incomplete";
    }

    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ID}/ai/run/${model}`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${CF_TOKEN}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ messages }),
      });
      
      const data = await response.json() as any;
      return data?.result?.response || data?.result?.answer || "AI Timeout / Null Response Stream Output";
    } catch (e) { 
      this.logger.error(`Failed connecting to Cloudflare Worker processing node: ${model}`, e);
      return "AI Offline"; 
    }
  }

  private async getCurrentContext(companyId: number): Promise<string> {
    try {
      const drivers = await this.prisma.driver.findMany({ where: { companyId: String(companyId) }, take: 3 });
      if (!drivers || drivers.length === 0) return "No active operational delivery assets currently registered in the grid.";
      return `Drivers: ${drivers.map(d => d.name).join(', ')}`;
    } catch (dbErr) {
      return "Unable to pull live physical sector drivers from regional cluster logs.";
    }
  }
}

