import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { CopilotService } from '../copilot/copilot.service';
import { AskSupportDto } from './dto/ask.dto';
import { CreateTicketDto, UpdateTicketDto } from './dto/create-ticket.dto';

interface KbArticle {
  id: string;
  title: string;
  tags: string[];
  body: string;
}

/**
 * FlowOps AI Support Agent.
 *
 * What makes it 50× better than a bolt-on chatbot:
 *  1. GROUNDED — answers from a curated FlowOps knowledge base, so it gives
 *     accurate product help instead of hallucinated generic advice.
 *  2. LIVE — fuses the deterministic CopilotService, so the same agent can also
 *     answer "what's my…" operational questions from the tenant's real data.
 *  3. HONEST + ACTIONABLE — returns a confidence score and, when it can't fully
 *     resolve, recommends escalation to a real, persisted SupportTicket so
 *     nothing falls through.
 *
 * Enterprise-gated (feature: aiSupportAgent). Groq-powered, with a graceful
 * keyword/KB fallback when no key is configured.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger('CLAW_SUPPORT');
  private readonly GROQ = 'https://api.groq.com/openai/v1/chat/completions';
  private readonly MODEL = 'llama-3.3-70b-versatile';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    private readonly copilot: CopilotService,
  ) {}

  // ── Curated FlowOps knowledge base ─────────────────────────────────────────
  private readonly KB: KbArticle[] = [
    { id: 'waybills', title: 'Creating & tracking waybills', tags: ['waybill', 'parcel', 'shipment', 'tracking', 'pod', 'label'],
      body: 'Create waybills under Waybills → Capture (or Scan/Batch Scan for bulk). Each waybill gets a tracking number trackable at /track. Proof of delivery (signature/photo) is captured by the driver and attached to the waybill. Labels print as PDF.' },
    { id: 'drivers', title: 'Managing drivers', tags: ['driver', 'fleet', 'assign', 'dispatch', 'pin'],
      body: 'Add drivers under Drivers. Each driver logs into the driver portal (driver.flowop.work) with their phone + PIN. Assign deliveries via Dispatch. Starter plan allows 3 drivers, Professional 25, Enterprise unlimited.' },
    { id: 'cod', title: 'Cash on delivery (COD) reconciliation', tags: ['cod', 'cash', 'wallet', 'reconcile', 'settle'],
      body: 'COD is tracked per driver wallet under Billing → COD Reconciliation. Driver collects cash → wallet balance grows → dispatch settles → balance clears. Every movement is an immutable ledger entry.' },
    { id: 'billing', title: 'Invoices, quotes & rate cards', tags: ['invoice', 'quote', 'rate', 'price', 'billing', 'paystack'],
      body: 'Build zone-based rate cards under Billing → Rate Cards. Generate quotes and convert to invoices. Invoices can be paid online via Paystack. Multi-carrier rate shopping compares Aramex/DHL/PostNet/Courier IT/RAM.' },
    { id: 'plans', title: 'Plans, limits & upgrades', tags: ['plan', 'billing', 'upgrade', 'limit', 'subscription', 'enterprise', 'professional', 'starter'],
      body: 'See your plan, usage meters and limits under Billing → Plans & Usage. Starter is free (100 waybills/mo, 3 drivers). Professional unlocks unlimited waybills, accounting, rate shopping, AI Control Tower. Enterprise adds CLAW Autopilot, SSO, Freight Forwarding and the AI Support Agent.' },
    { id: 'returns', title: 'Returns / RMA', tags: ['return', 'rma', 'refund', 'restock'],
      body: 'Manage returns under Returns. Lifecycle: request → collect → inspect → resolve (refund / replace / restock / dispose). Approved returns can generate a credit note.' },
    { id: 'whatsapp', title: 'WhatsApp & Email Hub', tags: ['whatsapp', 'email', 'message', 'notify', 'communication'],
      body: 'Send WhatsApp updates from Communications → WhatsApp (requires Meta Business API keys). The Email Hub is a unified inbox that AI-triages incoming email and can auto-promote bookings into waybills.' },
    { id: 'tracking', title: 'Customer tracking & ratings', tags: ['track', 'customer', 'rating', 'portal'],
      body: 'Customers track parcels at /track/<number> with a live map and predictive ETA, and can rate the delivery. No login required for public tracking.' },
    { id: 'integrations', title: 'API, webhooks & e-commerce', tags: ['api', 'webhook', 'shopify', 'woocommerce', 'integration'],
      body: 'Generate API keys under Settings → Integrations. Signed webhooks fire on waybill events with automatic retries. Shopify/WooCommerce orders can auto-create waybills.' },
    { id: 'forwarding', title: 'Freight forwarding (import/export)', tags: ['forwarding', 'import', 'export', 'container', 'customs', 'sars', 'duty', 'vat'],
      body: 'Enterprise: manage ocean/air import-export shipment files under Forwarding — containers, cargo, HS codes, SA customs duty/VAT estimate, draft SAD500/commercial-invoice PDFs, and a last-mile bridge to a domestic delivery.' },
    { id: 'account', title: 'Users, roles & company settings', tags: ['user', 'role', 'permission', 'settings', 'branding', 'company'],
      body: 'Invite team members and set roles under Settings → User Roles. Branding (logo, colours) is under Settings → Branding. Each role sees only the nav it has permission for.' },
  ];

  // ── Public: suggested starter questions ────────────────────────────────────
  suggestions(): string[] {
    return [
      'How do I create a waybill?',
      'How does COD reconciliation work?',
      'How many deliveries failed this week?',
      'How do I add a driver?',
      "What's included in my plan?",
      'How do I set up WhatsApp notifications?',
    ];
  }

  // ── Ask the agent ──────────────────────────────────────────────────────────
  async ask(companyId: string, user: any, dto: AskSupportDto) {
    await this.assertEntitled(companyId);

    const question = (dto.message || '').trim();
    if (!question) {
      return { answer: 'Ask me anything about using FlowOps — or about your live operation.', confidence: 0, shouldEscalate: false, suggestedFollowUps: this.suggestions().slice(0, 3), relatedHelp: [] };
    }

    // 1) Best-effort live data via the deterministic copilot (free, offline).
    let live: any = null;
    try {
      const ans = await this.copilot.ask(companyId, question);
      if (ans?.matched && ans.intent !== 'empty' && ans.intent !== 'error') {
        live = { answer: ans.answer, value: ans.value, unit: ans.unit, intent: ans.intent, chart: ans.chart ?? null, table: ans.table ?? null };
      }
    } catch { /* live data is a bonus, never block */ }

    // 2) Relevant KB articles (keyword overlap) to ground the model.
    const kb = this.relevantKb(question);

    const groqKey = this.config.get<string>('GROQ_API_KEY');
    if (!groqKey) {
      return this.fallback(question, kb, live);
    }

    const planName = await this.planName(companyId);
    const system =
      `You are the FlowOps AI Support Agent — friendly, concise, accurate. FlowOps is a South African courier & ` +
      `logistics SaaS. Help the user use the product and answer questions about their account/operation.\n` +
      `Use ONLY the knowledge base and live data provided; if the answer isn't covered, say so honestly and set ` +
      `shouldEscalate=true with a low confidence. Never invent features, prices, or steps. Currency is ZAR (R).\n\n` +
      `KNOWLEDGE BASE:\n${kb.map((a) => `[${a.id}] ${a.title}: ${a.body}`).join('\n')}\n\n` +
      (live ? `LIVE DATA for this tenant (already computed from their real data — quote it if relevant): ${live.answer}\n\n` : '') +
      `User context: plan=${planName}, role=${user?.role || 'user'}.\n\n` +
      `Respond with ONLY a JSON object: {"answer": string, "confidence": 0-100, "category": string, ` +
      `"shouldEscalate": boolean, "suggestedFollowUps": string[], "relatedHelp": string[] (KB ids you used)}.`;

    const messages: any[] = [{ role: 'system', content: system }];
    for (const t of (dto.history || []).slice(-6)) messages.push({ role: t.role, content: t.content });
    messages.push({ role: 'user', content: question });

    const parsed = await this.callGroqJSON(groqKey, messages);
    if (!parsed) return this.fallback(question, kb, live);

    const relatedHelp = this.resolveHelp(parsed.relatedHelp || kb.map((a) => a.id));
    return {
      answer: String(parsed.answer || '').trim() || this.fallback(question, kb, live).answer,
      confidence: this.clampConfidence(parsed.confidence),
      category: parsed.category || this.guessCategory(kb),
      shouldEscalate: Boolean(parsed.shouldEscalate) || this.clampConfidence(parsed.confidence) < 40,
      suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps) ? parsed.suggestedFollowUps.slice(0, 4) : [],
      relatedHelp,
      live,
    };
  }

  // ── Escalation → persisted ticket ──────────────────────────────────────────
  async createTicket(companyId: string, user: any, dto: CreateTicketDto) {
    await this.assertEntitled(companyId);
    const ticket = await (this.prisma as any).supportTicket.create({
      data: {
        companyId,
        subject: dto.subject.slice(0, 160),
        message: dto.message,
        priority: dto.priority || 'normal',
        category: dto.category || null,
        raisedById: user?.id || null,
        raisedByName: user?.name || user?.email || null,
        transcript: dto.transcript ?? null,
        aiSummary: dto.aiSummary || null,
        status: 'OPEN',
      },
    });
    this.logger.log(`📨 Support ticket ${ticket.id} opened for company ${companyId}`);
    return ticket;
  }

  async listTickets(companyId: string, status?: string) {
    await this.assertEntitled(companyId);
    const where: any = { companyId };
    if (status) where.status = status;
    return (this.prisma as any).supportTicket.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async updateTicket(companyId: string, id: string, dto: UpdateTicketDto) {
    await this.assertEntitled(companyId);
    const existing = await (this.prisma as any).supportTicket.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Ticket not found');
    return (this.prisma as any).supportTicket.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.resolution !== undefined ? { resolution: dto.resolution } : {}),
      },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private async assertEntitled(companyId: string) {
    const ok = await this.billing.hasFeature(companyId, 'aiSupportAgent');
    if (!ok) {
      throw new ForbiddenException('The AI Support Agent is available on the Enterprise plan. Upgrade to unlock it.');
    }
  }

  private async planName(companyId: string): Promise<string> {
    try {
      const c = await this.prisma.company.findUnique({ where: { id: companyId }, select: { plan: true } });
      return String(c?.plan || 'enterprise');
    } catch { return 'enterprise'; }
  }

  private relevantKb(question: string): KbArticle[] {
    const q = question.toLowerCase();
    const scored = this.KB.map((a) => {
      let score = a.tags.reduce((s, t) => (q.includes(t) ? s + 2 : s), 0);
      if (q.includes(a.id)) score += 2;
      for (const w of a.title.toLowerCase().split(/\s+/)) if (w.length > 3 && q.includes(w)) score += 1;
      return { a, score };
    }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score);
    // Always give the model something to work with.
    return (scored.length ? scored.map((x) => x.a) : this.KB).slice(0, 4);
  }

  private resolveHelp(ids: string[]): { id: string; title: string }[] {
    const seen = new Set<string>();
    const out: { id: string; title: string }[] = [];
    for (const id of ids) {
      const art = this.KB.find((a) => a.id === id);
      if (art && !seen.has(art.id)) { seen.add(art.id); out.push({ id: art.id, title: art.title }); }
      if (out.length >= 3) break;
    }
    return out;
  }

  private guessCategory(kb: KbArticle[]): string {
    return kb[0]?.id || 'general';
  }

  private clampConfidence(c: any): number {
    const n = Number(c);
    if (!Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private fallback(question: string, kb: KbArticle[], live: any) {
    if (live) {
      return { answer: live.answer, confidence: 75, category: 'operations', shouldEscalate: false, suggestedFollowUps: this.suggestions().slice(0, 3), relatedHelp: [], live };
    }
    const top = kb[0];
    if (top) {
      return {
        answer: `${top.body}\n\n(Answered from the FlowOps help library — connect an AI key for richer answers.)`,
        confidence: 55, category: top.id, shouldEscalate: false,
        suggestedFollowUps: this.suggestions().slice(0, 3),
        relatedHelp: this.resolveHelp(kb.map((a) => a.id)),
        live: null,
      };
    }
    return {
      answer: "I couldn't find a confident answer to that. Would you like to raise a support ticket so a human can help?",
      confidence: 20, category: 'general', shouldEscalate: true,
      suggestedFollowUps: this.suggestions().slice(0, 3), relatedHelp: [], live: null,
    };
  }

  private async callGroqJSON(apiKey: string, messages: any[]): Promise<any | null> {
    try {
      const res = await fetch(this.GROQ, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.MODEL, messages, temperature: 0.3, response_format: { type: 'json_object' } }),
      });
      if (!res.ok) { this.logger.warn(`Groq support call failed: ${res.status}`); return null; }
      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content || '';
      try { return JSON.parse(text); }
      catch { const m = text.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
    } catch (err: any) {
      this.logger.error(`Groq support error: ${err.message}`);
      return null;
    }
  }
}
