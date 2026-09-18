import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GROQ_ENDPOINT, GROQ_MODEL } from '../ai/groq-model';

export interface CaptureInput {
  source?: 'backend' | 'frontend' | 'integrity';
  level?: 'error' | 'warning';
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  context?: Record<string, any> | null;
  companyId?: string | null;
  userId?: string | null;
}

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger('CLAW_OBSERVATORY');

  constructor(private readonly prisma: PrismaService) {}

  // ── Fingerprinting (groups identical errors) ───────────────────────────────

  /** Normalise a message so near-identical errors group together. */
  private normalizeMessage(msg: string): string {
    return String(msg || '')
      .toLowerCase()
      .replace(/0x[0-9a-f]+/g, '0xHEX')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'UUID')
      .replace(/\b\d+\b/g, 'N')
      .replace(/(["'`]).*?\1/g, '$1…$1')
      .trim()
      .slice(0, 300);
  }

  /** First meaningful stack frame, if any. */
  private firstFrame(stack?: string | null): string {
    if (!stack) return '';
    const line = stack.split('\n').map((l) => l.trim()).find((l) => l.startsWith('at '));
    return (line || '').replace(/:\d+:\d+/g, '').slice(0, 200);
  }

  private fingerprint(input: CaptureInput): string {
    const basis = `${input.source || 'backend'}|${this.normalizeMessage(input.message)}|${this.firstFrame(input.stack)}`;
    return createHash('sha1').update(basis).digest('hex');
  }

  // ── Capture ────────────────────────────────────────────────────────────────

  /**
   * Record an error occurrence. Groups by fingerprint (increments count),
   * reopens a previously-resolved group if it recurs (regression), and triggers
   * a best-effort AI triage for brand-new groups.
   */
  async capture(input: CaptureInput): Promise<{ fingerprint: string; isNew: boolean }> {
    const fingerprint = this.fingerprint(input);
    const now = new Date();

    const existing = await (this.prisma as any).errorEvent.findUnique({ where: { fingerprint } });
    if (existing) {
      await (this.prisma as any).errorEvent.update({
        where: { fingerprint },
        data: {
          count: { increment: 1 },
          lastSeenAt: now,
          ...(existing.resolved ? { resolved: false, resolvedAt: null } : {}),
          ...(input.path ? { path: input.path } : {}),
          ...(input.method ? { method: input.method } : {}),
          ...(input.context ? { context: input.context as any } : {}),
        },
      });
      return { fingerprint, isNew: false };
    }

    await (this.prisma as any).errorEvent.create({
      data: {
        fingerprint,
        source: input.source || 'backend',
        level: input.level || 'error',
        message: String(input.message || 'Unknown error').slice(0, 2000),
        stack: input.stack ? String(input.stack).slice(0, 8000) : null,
        path: input.path ?? null,
        method: input.method ?? null,
        context: (input.context as any) ?? undefined,
        companyId: input.companyId ?? null,
        userId: input.userId ?? null,
      },
    });

    // Fire-and-forget AI triage; never block the request path.
    this.triage(fingerprint).catch((e) => this.logger.warn(`Triage failed: ${e.message}`));
    return { fingerprint, isNew: true };
  }

  // ── CLAW AI triage ───────────────────────────────────────────────────────────

  /** Ask the model to classify + suggest a fix for an error group. Best-effort. */
  async triage(fingerprint: string): Promise<void> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return;

    const ev = await (this.prisma as any).errorEvent.findUnique({ where: { fingerprint } });
    if (!ev) return;

    const prompt = `You are CLAW, the reliability engineer for FlowOps (a NestJS + React logistics SaaS).
Analyse this ${ev.source} error and respond with STRICT JSON only:
{"severity":"LOW|MEDIUM|HIGH|CRITICAL","summary":"one sentence on what's happening","suggestion":"the most likely fix in 1-2 sentences"}

Error message: ${String(ev.message).slice(0, 600)}
Path: ${ev.path || 'n/a'} ${ev.method || ''}
Stack (top): ${String(ev.stack || '').slice(0, 800)}`;

    try {
      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
      });
      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return;
      const parsed = JSON.parse(match[0]);
      await (this.prisma as any).errorEvent.update({
        where: { fingerprint },
        data: {
          aiSeverity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(parsed.severity).toUpperCase())
            ? String(parsed.severity).toUpperCase()
            : 'MEDIUM',
          aiSummary: String(parsed.summary || '').slice(0, 500),
          aiSuggestion: String(parsed.suggestion || '').slice(0, 800),
          aiTriagedAt: new Date(),
        },
      });
    } catch (e: any) {
      this.logger.warn(`Groq triage error: ${e.message}`);
    }
  }

  // ── Queries (owner console) ────────────────────────────────────────────────

  async list(opts: { resolved?: boolean; source?: string; limit?: number } = {}) {
    const where: any = {};
    if (opts.resolved !== undefined) where.resolved = opts.resolved;
    if (opts.source) where.source = opts.source;
    return (this.prisma as any).errorEvent.findMany({
      where,
      orderBy: [{ resolved: 'asc' }, { lastSeenAt: 'desc' }],
      take: Math.min(opts.limit || 100, 300),
    });
  }

  async get(id: string) {
    return (this.prisma as any).errorEvent.findUnique({ where: { id } });
  }

  async setResolved(id: string, resolved: boolean) {
    return (this.prisma as any).errorEvent.update({
      where: { id },
      data: { resolved, resolvedAt: resolved ? new Date() : null },
    });
  }

  /** Re-run AI triage for one group on demand. */
  async retriage(id: string) {
    const ev = await this.get(id);
    if (!ev) return null;
    await this.triage(ev.fingerprint);
    return this.get(id);
  }

  async stats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [openGroups, totalGroups, last24h, bySeverity] = await Promise.all([
      (this.prisma as any).errorEvent.count({ where: { resolved: false } }),
      (this.prisma as any).errorEvent.count(),
      (this.prisma as any).errorEvent.count({ where: { lastSeenAt: { gte: since } } }),
      (this.prisma as any).errorEvent.groupBy({
        by: ['aiSeverity'],
        where: { resolved: false },
        _count: { _all: true },
      }).catch(() => []),
    ]);
    return {
      openGroups,
      totalGroups,
      activeLast24h: last24h,
      bySeverity: (bySeverity as any[]).map((r) => ({ severity: r.aiSeverity || 'UNTRIAGED', count: r._count?._all ?? 0 })),
    };
  }
}
