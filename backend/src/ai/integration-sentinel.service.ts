import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

// ── Types ────────────────────────────────────────────────────────────────────

export type IntegrationStatus = 'ok' | 'misconfigured' | 'failing';

export interface IntegrationCheck {
  key: string;          // stable id, e.g. 'groq'
  name: string;         // human label
  category: string;     // AI | Payments | Email | Messaging | Search | Core
  configured: boolean;  // is it set up at all?
  status: IntegrationStatus;
  detail: string;       // what's wrong / confirmation
  latencyMs: number;
}

// The Groq model the platform actually calls (keep in sync with claw.service +
// competitive-intelligence). The sentinel verifies this is still live so a
// silent decommission (the llama3-8b-8192 incident) is caught proactively.
const EXPECTED_GROQ_MODEL = 'llama-3.3-70b-versatile';

@Injectable()
export class IntegrationSentinelService {
  private readonly logger = new Logger('CLAW_SENTINEL');

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ── HTTP helper with timeout ─────────────────────────────────────────────

  private async timedFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
    const { timeoutMs = 6000, ...rest } = init;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const start = Date.now();
    try {
      const res = await fetch(url, { ...rest, signal: ctrl.signal });
      return { res, latencyMs: Date.now() - start };
    } catch (e: any) {
      // Surface a clear, human message instead of the cryptic "This operation
      // was aborted" that an AbortController timeout otherwise produces.
      if (e?.name === 'AbortError') {
        const err: any = new Error(`timed out after ${(timeoutMs / 1000).toFixed(0)}s`);
        err.isTimeout = true;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  /** Retry a transient check (timeout / network blip) a couple of times. */
  private async withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 800): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  }

  private mk(
    key: string, name: string, category: string,
    configured: boolean, status: IntegrationStatus, detail: string, latencyMs = 0,
  ): IntegrationCheck {
    return { key, name, category, configured, status, detail, latencyMs };
  }

  // ── Individual checks ────────────────────────────────────────────────────

  private async checkGroq(): Promise<IntegrationCheck> {
    const key = this.config.get<string>('GROQ_API_KEY');
    if (!key) return this.mk('groq', 'Groq (AI copilot / CLAW)', 'AI', false, 'misconfigured', 'GROQ_API_KEY not set — Ask FlowOps & CLAW chat fall back to canned replies.');
    try {
      const { res, latencyMs } = await this.timedFetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) return this.mk('groq', 'Groq (AI copilot / CLAW)', 'AI', true, 'failing', 'GROQ_API_KEY rejected (401) — key invalid or revoked.', latencyMs);
      if (!res.ok) return this.mk('groq', 'Groq (AI copilot / CLAW)', 'AI', true, 'failing', `Groq API returned ${res.status}.`, latencyMs);
      const body: any = await res.json().catch(() => ({}));
      const ids: string[] = (body?.data || []).map((m: any) => m.id);
      if (ids.length && !ids.includes(EXPECTED_GROQ_MODEL)) {
        return this.mk('groq', 'Groq (AI copilot / CLAW)', 'AI', true, 'failing',
          `Configured model "${EXPECTED_GROQ_MODEL}" is no longer offered by Groq — update the model or AI responses will fail.`, latencyMs);
      }
      return this.mk('groq', 'Groq (AI copilot / CLAW)', 'AI', true, 'ok', `Reachable; model "${EXPECTED_GROQ_MODEL}" available.`, latencyMs);
    } catch (e: any) {
      return this.mk('groq', 'Groq (AI copilot / CLAW)', 'AI', true, 'failing', `Could not reach Groq: ${e.message}`);
    }
  }

  private async checkTavily(): Promise<IntegrationCheck> {
    const key = this.config.get<string>('TAVILY_API_KEY');
    if (!key) return this.mk('tavily', 'Tavily (Competitive Intel search)', 'Search', false, 'misconfigured', 'TAVILY_API_KEY not set — the intel sweep has no live web search.');
    // Tavily /search performs live web crawling and is legitimately slow, so it
    // needs a much longer budget than a simple auth ping; and we retry once so a
    // single slow response doesn't get flagged as a critical outage.
    const timeoutMs = Number(this.config.get<string>('TAVILY_TIMEOUT_MS')) || 15000;
    try {
      const { res, latencyMs } = await this.withRetry(() =>
        this.timedFetch('https://api.tavily.com/search', {
          method: 'POST',
          timeoutMs,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ query: 'flowops integration healthcheck', max_results: 1, search_depth: 'basic' }),
        }),
      );
      if (res.status === 401 || res.status === 403) return this.mk('tavily', 'Tavily (Competitive Intel search)', 'Search', true, 'failing', `Tavily key rejected (${res.status}) — check TAVILY_API_KEY.`, latencyMs);
      if (res.status === 429) return this.mk('tavily', 'Tavily (Competitive Intel search)', 'Search', true, 'misconfigured', 'Tavily rate-limited (429) — usage cap reached; sweeps will retry later.', latencyMs);
      if (!res.ok) return this.mk('tavily', 'Tavily (Competitive Intel search)', 'Search', true, 'failing', `Tavily returned ${res.status}.`, latencyMs);
      return this.mk('tavily', 'Tavily (Competitive Intel search)', 'Search', true, 'ok', `Reachable and authenticated (${latencyMs}ms).`, latencyMs);
    } catch (e: any) {
      // A timeout means slow/unreachable, not a misconfiguration — say so plainly.
      const detail = e?.isTimeout
        ? `Tavily ${e.message} (slow or unreachable) after 2 attempts — intel sweep falls back to the AI knowledge base until it recovers.`
        : `Could not reach Tavily: ${e.message}`;
      return this.mk('tavily', 'Tavily (Competitive Intel search)', 'Search', true, 'failing', detail);
    }
  }

  private async checkPaystack(): Promise<IntegrationCheck> {
    const key = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!key) return this.mk('paystack', 'Paystack (Billing)', 'Payments', false, 'misconfigured', 'PAYSTACK_SECRET_KEY not set — subscriptions/checkout disabled.');
    try {
      const { res, latencyMs } = await this.timedFetch('https://api.paystack.co/balance', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) return this.mk('paystack', 'Paystack (Billing)', 'Payments', true, 'failing', 'Paystack secret key rejected (401).', latencyMs);
      if (!res.ok) return this.mk('paystack', 'Paystack (Billing)', 'Payments', true, 'failing', `Paystack returned ${res.status}.`, latencyMs);
      return this.mk('paystack', 'Paystack (Billing)', 'Payments', true, 'ok', 'Reachable and authenticated.', latencyMs);
    } catch (e: any) {
      return this.mk('paystack', 'Paystack (Billing)', 'Payments', true, 'failing', `Could not reach Paystack: ${e.message}`);
    }
  }

  private async checkSendgrid(): Promise<IntegrationCheck> {
    const key = this.config.get<string>('SENDGRID_API_KEY');
    if (!key) return this.mk('sendgrid', 'SendGrid (Email)', 'Email', false, 'misconfigured', 'SENDGRID_API_KEY not set — transactional email disabled.');
    try {
      const { res, latencyMs } = await this.timedFetch('https://api.sendgrid.com/v3/scopes', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) return this.mk('sendgrid', 'SendGrid (Email)', 'Email', true, 'failing', 'SendGrid key rejected (401).', latencyMs);
      if (!res.ok) return this.mk('sendgrid', 'SendGrid (Email)', 'Email', true, 'failing', `SendGrid returned ${res.status}.`, latencyMs);
      return this.mk('sendgrid', 'SendGrid (Email)', 'Email', true, 'ok', 'Reachable and authenticated.', latencyMs);
    } catch (e: any) {
      return this.mk('sendgrid', 'SendGrid (Email)', 'Email', true, 'failing', `Could not reach SendGrid: ${e.message}`);
    }
  }

  private async checkWhatsApp(): Promise<IntegrationCheck> {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const version = this.config.get<string>('WHATSAPP_API_VERSION', 'v21.0');
    if (!token || !phoneId) return this.mk('whatsapp', 'WhatsApp Business API', 'Messaging', false, 'misconfigured', 'WhatsApp token/phone-number-id not set — Business API send disabled (click-to-chat still works).');
    try {
      const { res, latencyMs } = await this.timedFetch(`https://graph.facebook.com/${version}/${phoneId}?fields=display_phone_number`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 400) return this.mk('whatsapp', 'WhatsApp Business API', 'Messaging', true, 'failing', `WhatsApp token rejected/expired (${res.status}).`, latencyMs);
      if (!res.ok) return this.mk('whatsapp', 'WhatsApp Business API', 'Messaging', true, 'failing', `Graph API returned ${res.status}.`, latencyMs);
      return this.mk('whatsapp', 'WhatsApp Business API', 'Messaging', true, 'ok', 'Token valid; number reachable.', latencyMs);
    } catch (e: any) {
      return this.mk('whatsapp', 'WhatsApp Business API', 'Messaging', true, 'failing', `Could not reach Graph API: ${e.message}`);
    }
  }

  private async checkDatabase(): Promise<IntegrationCheck> {
    const start = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return this.mk('database', 'PostgreSQL', 'Core', true, 'ok', 'Connected.', Date.now() - start);
    } catch (e: any) {
      return this.mk('database', 'PostgreSQL', 'Core', true, 'failing', `DB query failed: ${e.message}`, Date.now() - start);
    }
  }

  // ── Orchestration ────────────────────────────────────────────────────────

  /** Run every integration check concurrently. */
  async runChecks(): Promise<IntegrationCheck[]> {
    const results = await Promise.allSettled([
      this.checkDatabase(),
      this.checkGroq(),
      this.checkTavily(),
      this.checkPaystack(),
      this.checkSendgrid(),
      this.checkWhatsApp(),
    ]);
    return results.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : this.mk('unknown', 'Unknown check', 'Core', true, 'failing', String((r as any).reason?.message || 'check threw')),
    );
  }

  /**
   * Run checks, then reflect the result into the Action Items queue:
   *  - any non-OK integration becomes/stays a trackable INTEGRATION_HEALTH item
   *  - any integration that has recovered auto-resolves its open item
   * Stored against the first active company as the platform carrier; surfaced
   * only in the owner-aggregated worklist (not tenant views).
   */
  async runAndPersist(): Promise<{ ranAt: string; checks: IntegrationCheck[]; problems: number }> {
    const checks = await this.runChecks();

    const carrier = await this.prisma.company.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (carrier) {
      for (const c of checks) {
        const sourceId = `integration:${c.key}`;
        if (c.status === 'ok') {
          // Recovery: close any open alert for this integration.
          await (this.prisma.aiEvent as any).updateMany({
            where: { type: 'INTEGRATION_HEALTH', sourceId, resolved: false, dismissed: false },
            data: { resolved: true, resolvedAt: new Date() },
          });
          continue;
        }
        // Problem: ensure exactly one open alert exists (dedupe).
        const existing = await (this.prisma.aiEvent as any).findFirst({
          where: { type: 'INTEGRATION_HEALTH', sourceId, resolved: false, dismissed: false },
          select: { id: true },
        });
        if (existing) continue;
        await (this.prisma.aiEvent as any).create({
          data: {
            companyId: carrier.id,
            type: 'INTEGRATION_HEALTH',
            title: `Integration ${c.status}: ${c.name}`,
            body: c.detail,
            severity: c.status === 'failing' ? 'critical' : 'warning',
            sourceType: 'CLAW_SENTINEL',
            sourceId,
            resolved: false,
            dismissed: false,
            metadata: JSON.stringify({
              key: c.key, category: c.category, status: c.status,
              // map to threatLevel so the Counter-Move Score ranks it sensibly
              threatLevel: c.status === 'failing' ? 'CRITICAL' : 'MEDIUM',
            }),
          },
        });
      }
    }

    const problems = checks.filter((c) => c.status !== 'ok').length;
    this.logger.log(`Integration sentinel: ${checks.length} checks, ${problems} problem(s).`);
    return { ranAt: new Date().toISOString(), checks, problems };
  }

  /** Daily sweep at 07:00 — proactively flags broken integrations. */
  @Cron('0 7 * * *')
  async scheduledSweep(): Promise<void> {
    try {
      await this.runAndPersist();
    } catch (e: any) {
      this.logger.error(`Scheduled integration sweep failed: ${e.message}`);
    }
  }
}
