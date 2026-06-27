import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface CompetitorInsight {
  competitor: string;
  finding: string;
  threatLevel: ThreatLevel;
  recommendation: string;
  source?: string;
}

export interface IntelligenceReport {
  runAt: string;
  insights: CompetitorInsight[];
  summary: string;
  topAction: string;
  rawResults: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

/** AiEvent types that appear in the unified, ranked "Action items" worklist. */
const ACTIONABLE_TYPES = ['COMPETITOR_THREAT', 'PLATFORM_UPGRADE'];

@Injectable()
export class CompetitiveIntelligenceService {
  private readonly logger = new Logger('CLAW_INTEL');
  private readonly TAVILY = 'https://api.tavily.com/search';
  private readonly CF_BASE = 'https://api.cloudflare.com/client/v4/accounts';
  private readonly GROQ   = 'https://api.groq.com/openai/v1/chat/completions';

  /** Tracked competitors — add more as needed */
  private readonly COMPETITORS = [
    'Onfleet', 'Track-POD', 'Detrack', 'Shipday', 'Bringg',
    'Locus', 'Routific', 'Tookan', 'Courier IT', 'RAM Couriers',
  ];

  /** Search queries — mix of competitor-specific and market-wide */
  private readonly QUERIES = [
    'South African logistics courier SaaS new features 2025',
    'Onfleet OR Track-POD OR Detrack new features update 2025',
    'last mile delivery software AI tracking Africa innovation 2025',
    'courier management SaaS competitors comparison 2025',
    'route optimisation real-time ETA delivery app South Africa',
    'fleet management COD cash on delivery app Africa 2025',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: EventsGateway,
    private readonly config: ConfigService,
  ) {}

  // ── Weekly cron: every Monday at 08:00 ────────────────────────────────────

  @Cron('0 8 * * 1')
  async weeklyIntelligenceSweep() {
    this.logger.log('🌐 CLAW INTEL: Starting weekly competitive sweep...');

    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const company of companies) {
      try {
        const report = await this.runSweep(company.id);
        await this.persistAndBroadcast(company.id, report);
      } catch (err: any) {
        this.logger.error(`Intel sweep failed for company ${company.id}: ${err.message}`);
      }
    }

    this.logger.log('✅ CLAW INTEL: Weekly sweep complete.');
  }

  // ── Manual trigger (called from controller) ───────────────────────────────

  async runSweep(companyId: string): Promise<IntelligenceReport> {
    this.logger.log(`🔍 CLAW INTEL: Running sweep for company ${companyId}`);

    // 1. Gather raw web intelligence
    const rawResults = await this.gatherIntelligence();

    // 2. Analyse with AI
    const insights = await this.analyseWithAI(rawResults);

    // 3. Build summary
    const summary = await this.buildExecutiveSummary(insights);

    const topAction = insights.length > 0
      ? insights.sort((a, b) =>
          ['CRITICAL','HIGH','MEDIUM','LOW'].indexOf(a.threatLevel) -
          ['CRITICAL','HIGH','MEDIUM','LOW'].indexOf(b.threatLevel)
        )[0].recommendation
      : 'No immediate action required.';

    return {
      runAt: new Date().toISOString(),
      insights,
      summary,
      topAction,
      rawResults: rawResults.length,
    };
  }

  // ── Step 1: Web search via Tavily (or fallback) ───────────────────────────

  private async gatherIntelligence(): Promise<SearchResult[]> {
    const tavilyKey = this.config.get<string>('TAVILY_API_KEY');

    if (tavilyKey) {
      return this.searchTavily(tavilyKey);
    }

    this.logger.warn('TAVILY_API_KEY not set — using Cloudflare AI knowledge base fallback');
    return this.synthesiseFallback();
  }

  private async searchTavily(apiKey: string): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    for (const query of this.QUERIES) {
      try {
        const res = await fetch(this.TAVILY, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query,
            search_depth: 'basic',
            max_results: 5,
            include_answer: false,
          }),
        });

        if (!res.ok) {
          this.logger.warn(`Tavily search failed for "${query}": ${res.status}`);
          continue;
        }

        const data = (await res.json()) as { results?: SearchResult[] };
        if (data.results) {
          allResults.push(...data.results.map(r => ({
            title:   r.title   || 'Untitled',
            url:     r.url     || '',
            content: (r.content || '').slice(0, 500), // keep snippets manageable
            score:   r.score,
          })));
        }

        // Rate-limit: 1 req / 0.5s
        await new Promise(r => setTimeout(r, 500));

      } catch (err: any) {
        this.logger.error(`Tavily search error: ${err.message}`);
      }
    }

    this.logger.log(`📰 CLAW INTEL: Collected ${allResults.length} raw results`);
    return allResults;
  }

  /** Fallback: ask the LLM directly when no search key is configured */
  private async synthesiseFallback(): Promise<SearchResult[]> {
    const cfId    = this.config.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const cfToken = this.config.get<string>('CLOUDFLARE_API_TOKEN');
    const groqKey = this.config.get<string>('GROQ_API_KEY');

    if (!cfId && !groqKey) {
      return [{ title: 'No search key configured', url: '', content: 'Add TAVILY_API_KEY to enable live web search.' }];
    }

    const prompt = `You are a logistics market analyst. List 5 recent feature additions or competitive moves by Onfleet, Track-POD, Detrack, Shipday, or Bringg in 2025 that a South African courier SaaS should be aware of. Format as: Competitor | Feature | Threat Level (LOW/MEDIUM/HIGH/CRITICAL) | Recommended counter-move`;

    try {
      if (groqKey) {
        const res = await fetch(this.GROQ, {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
        });
        const data = (await res.json()) as any;
        const text = data?.choices?.[0]?.message?.content || '';
        return [{ title: 'AI Market Analysis (Groq)', url: '', content: text }];
      }

      if (cfId && cfToken) {
        const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
        const res = await fetch(`${this.CF_BASE}/${cfId}/ai/run/${model}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
        });
        const data = (await res.json()) as any;
        const text = data?.result?.response || '';
        return [{ title: 'AI Market Analysis (Cloudflare)', url: '', content: text }];
      }
    } catch (err: any) {
      this.logger.error(`AI fallback failed: ${err.message}`);
    }

    return [];
  }

  // ── Step 2: Analyse results with AI ──────────────────────────────────────

  private async analyseWithAI(results: SearchResult[]): Promise<CompetitorInsight[]> {
    if (results.length === 0) return [];

    const cfId    = this.config.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const cfToken = this.config.get<string>('CLOUDFLARE_API_TOKEN');
    const groqKey = this.config.get<string>('GROQ_API_KEY');

    const context = results
      .map(r => `Title: ${r.title}\nContent: ${r.content}`)
      .join('\n\n---\n\n')
      .slice(0, 4000); // keep within token limits

    const systemPrompt = `You are a strategic competitive analyst for FlowOps, a South African courier & logistics SaaS. 
Analyse the provided search results and identify specific competitive threats or opportunities.
For each finding, respond in STRICT JSON array format:
[{"competitor":"name","finding":"what they did","threatLevel":"HIGH","recommendation":"what FlowOps should do","source":"url or title"}]
Threat levels: LOW (informational), MEDIUM (monitor), HIGH (respond in 90 days), CRITICAL (respond immediately).
Return ONLY the JSON array, no other text.`;

    const userMsg = `Analyse these market intelligence results for a South African logistics SaaS:\n\n${context}`;

    try {
      let responseText = '';

      if (groqKey) {
        const res = await fetch(this.GROQ, {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userMsg },
            ],
            temperature: 0.2,
          }),
        });
        const data = (await res.json()) as any;
        responseText = data?.choices?.[0]?.message?.content || '[]';
      } else if (cfId && cfToken) {
        const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
        const res = await fetch(`${this.CF_BASE}/${cfId}/ai/run/${model}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userMsg },
          ]}),
        });
        const data = (await res.json()) as any;
        responseText = data?.result?.response || '[]';
      } else {
        // No AI keys — parse the fallback text directly
        return this.parseFallbackText(results);
      }

      // Extract JSON array from response
      const match = responseText.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as CompetitorInsight[];
        this.logger.log(`🧠 CLAW INTEL: Identified ${parsed.length} insights`);
        return parsed;
      }
    } catch (err: any) {
      this.logger.error(`AI analysis failed: ${err.message}`);
    }

    return this.parseFallbackText(results);
  }

  /** Parse pipe-delimited fallback format: Competitor | Feature | Threat | Recommendation */
  private parseFallbackText(results: SearchResult[]): CompetitorInsight[] {
    const insights: CompetitorInsight[] = [];

    for (const r of results) {
      const lines = r.content.split('\n').filter(l => l.includes('|'));
      for (const line of lines) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 4) {
          insights.push({
            competitor:     parts[0],
            finding:        parts[1],
            threatLevel:    (parts[2] as ThreatLevel) || 'MEDIUM',
            recommendation: parts[3],
            source:         r.url || r.title,
          });
        }
      }
    }

    return insights;
  }

  // ── Step 3: Executive summary ────────────────────────────────────────────

  private async buildExecutiveSummary(insights: CompetitorInsight[]): Promise<string> {
    if (insights.length === 0) return 'No significant competitive threats detected this week.';

    const high = insights.filter(i => ['HIGH','CRITICAL'].includes(i.threatLevel)).length;
    const competitors = [...new Set(insights.map(i => i.competitor))].join(', ');

    return `Weekly sweep detected ${insights.length} competitive developments across ${[...new Set(insights.map(i => i.competitor))].length} competitors (${competitors}). ${high} item(s) require immediate attention.`;
  }

  // ── Step 4: Persist as AiEvents + broadcast ───────────────────────────────

  private async persistAndBroadcast(companyId: string, report: IntelligenceReport) {
    // Store summary event
    await (this.prisma.aiEvent as any).create({
      data: {
        companyId,
        type:     'COMPETITIVE_INTELLIGENCE',
        title:    `Weekly Intel: ${report.insights.length} findings`,
        body:     report.summary,
        severity: report.insights.some(i => i.threatLevel === 'CRITICAL') ? 'critical'
                : report.insights.some(i => i.threatLevel === 'HIGH')     ? 'warning'
                : 'info',
        resolved: false,
        metadata: JSON.stringify(report),
      },
    });

    // Store EVERY insight as an individually trackable action item — not just
    // HIGH/CRITICAL — so no recommendation is lost. Deduped by a stable
    // sourceId so the weekly re-run doesn't pile up duplicates OR resurrect
    // items you've already actioned (resolved/dismissed).
    for (const insight of report.insights) {
      const sourceId = this.intelKey(insight);
      const existing = await (this.prisma.aiEvent as any).findFirst({
        where: { companyId, type: 'COMPETITOR_THREAT', sourceId },
        select: { id: true },
      });
      if (existing) continue; // already tracked — leave its status alone
      await (this.prisma.aiEvent as any).create({
        data: {
          companyId,
          type:       'COMPETITOR_THREAT',
          title:      `${insight.competitor}: ${String(insight.finding).slice(0, 80)}`,
          body:       insight.recommendation,
          severity:   this.severityFromThreat(insight.threatLevel),
          sourceType: 'INTEL',
          sourceId,
          resolved:   false,
          dismissed:  false,
          metadata:   JSON.stringify(insight),
        },
      });
    }

    // Broadcast to connected clients
    this.gateway.broadcastToCompany(companyId, 'intel-report', {
      type:   'COMPETITIVE_INTELLIGENCE',
      report,
    });

    this.logger.log(`📊 CLAW INTEL: Persisted ${report.insights.length} insights for company ${companyId}`);
  }

  // ── Action items (trackable recommendations) ──────────────────────────────
  //
  // Every insight becomes a COMPETITOR_THREAT AiEvent (sourceType 'INTEL'). The
  // AiEvent resolved/dismissed flags give each recommendation a lifecycle:
  // open → done (resolved) or dismissed. A stable sourceId dedupes across the
  // weekly sweeps so re-runs never duplicate or reopen an actioned item.

  private severityFromThreat(t: ThreatLevel): string {
    return t === 'CRITICAL' ? 'critical' : t === 'HIGH' ? 'warning' : 'info';
  }

  /**
   * FlowOps Counter-Move Score (0–100): how urgently this recommendation
   * deserves attention. Deterministic (no LLM cost): threat weight + a
   * freshness bonus that decays over ~10 days. Drives the ranked briefing.
   */
  private counterMoveScore(ev: any): number {
    let threat: ThreatLevel = 'MEDIUM';
    try {
      const m = typeof ev.metadata === 'string' ? JSON.parse(ev.metadata) : ev.metadata;
      if (m?.threatLevel) threat = m.threatLevel;
    } catch { /* keep default */ }
    const base = threat === 'CRITICAL' ? 90 : threat === 'HIGH' ? 70 : threat === 'MEDIUM' ? 45 : 20;
    const ageDays = (Date.now() - new Date(ev.createdAt).getTime()) / 86_400_000;
    const freshness = Math.max(0, 10 - Math.floor(ageDays)); // up to +10 for fresh intel
    return Math.min(100, Math.round(base + freshness));
  }

  private withScore = (rows: any[]) =>
    rows
      .map((r) => ({ ...r, counterMoveScore: this.counterMoveScore(r) }))
      .sort((a, b) => b.counterMoveScore - a.counterMoveScore);

  /**
   * Close the loop: record the human's decision into CLAW's competitive memory
   * so the system learns which threats you act on vs. dismiss. This is the bit
   * unique to FlowOps — intel → action → memory, not just a static report.
   */
  private async recordDecisionLearning(companyId: string, metadata: any, decision: string) {
    if (decision !== 'resolved' && decision !== 'dismissed') return;
    try {
      const m = typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || {});
      await (this.prisma.aiEvent as any).create({
        data: {
          companyId,
          type:       'INTEL_DECISION',
          title:      `CLAW memory: ${decision === 'resolved' ? 'actioned' : 'dismissed'} ${m.competitor || 'competitor'} threat`,
          body:       `Strategic decision recorded for CLAW's competitive memory — "${String(m.finding || '').slice(0, 120)}" → ${decision}.`,
          severity:   'info',
          sourceType: 'CLAW_LEARNING',
          resolved:   true,
          dismissed:  false,
          metadata:   JSON.stringify({
            competitor: m.competitor, finding: m.finding,
            threatLevel: m.threatLevel, decision, at: new Date().toISOString(),
          }),
        },
      });
    } catch { /* learning is best-effort — never block the status change */ }
  }

  private intelKey(insight: CompetitorInsight): string {
    const slug = (s: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
    return `intel:${slug(insight.competitor)}:${slug(insight.finding)}`;
  }

  private statusData(status: string): any {
    switch (status) {
      case 'resolved':  return { resolved: true,  dismissed: false, resolvedAt: new Date() };
      case 'dismissed': return { resolved: false, dismissed: true,  resolvedAt: null };
      case 'open':      return { resolved: false, dismissed: false, resolvedAt: null };
      default: throw new NotFoundException(`Unknown status "${status}" (use open|resolved|dismissed)`);
    }
  }

  /** Tenant: open (or all) action items (competitor threats + upgrade ideas), ranked. */
  async getActionItems(companyId: string, includeClosed = false) {
    const where: any = { companyId, type: { in: ACTIONABLE_TYPES } };
    if (!includeClosed) { where.resolved = false; where.dismissed = false; }
    const rows = await (this.prisma.aiEvent as any).findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100,
    });
    return this.withScore(rows);
  }

  /** Tenant: mark one action item open|resolved|dismissed. */
  async setActionStatus(companyId: string, id: string, status: string) {
    const ev = await (this.prisma.aiEvent as any).findFirst({
      where: { id, companyId, type: { in: ACTIONABLE_TYPES } },
      select: { id: true, metadata: true },
    });
    if (!ev) throw new NotFoundException('Action item not found');
    const updated = await (this.prisma.aiEvent as any).update({ where: { id }, data: this.statusData(status) });
    await this.recordDecisionLearning(companyId, ev.metadata, status);
    return updated;
  }

  /** Owner console: open action items across all companies, de-duped + ranked. */
  async getActionItemsAny(includeClosed = false) {
    const where: any = { type: { in: ACTIONABLE_TYPES } };
    if (!includeClosed) { where.resolved = false; where.dismissed = false; }
    const rows = await (this.prisma.aiEvent as any).findMany({
      where, orderBy: { createdAt: 'desc' }, take: 400,
    });
    const seen = new Set<string>();
    const out: any[] = [];
    for (const r of rows) {
      const key = r.sourceId || r.title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= 100) break;
    }
    return this.withScore(out);
  }

  /**
   * Owner console: set status for an item AND every sibling copy across
   * companies (intel is stored per-company), so the aggregated owner view
   * stays consistent — action it once, it's actioned everywhere. The decision
   * is also written to CLAW's competitive memory.
   */
  async setActionStatusAny(id: string, status: string) {
    const ev = await (this.prisma.aiEvent as any).findFirst({
      where: { id, type: { in: ACTIONABLE_TYPES } },
      select: { sourceId: true, title: true, companyId: true, metadata: true },
    });
    if (!ev) throw new NotFoundException('Action item not found');
    // sourceIds are namespaced (intel:* / upgrade:*) so they match siblings safely.
    const match = ev.sourceId
      ? { sourceId: ev.sourceId }
      : { type: { in: ACTIONABLE_TYPES }, title: ev.title };
    const res = await (this.prisma.aiEvent as any).updateMany({ where: match, data: this.statusData(status) });
    await this.recordDecisionLearning(ev.companyId, ev.metadata, status);
    return { updated: res.count, status };
  }

  /**
   * Persist a CLAW platform-upgrade suggestion as a trackable, ranked action
   * item in the same worklist as competitor threats. Deduped by a stable
   * sourceId so re-running ideation never duplicates or resurrects an idea
   * you've already shipped or dismissed. This replaces the old (dishonest)
   * "self-deployed feature node" path — CLAW proposes, a human decides.
   */
  async recordUpgradeSuggestion(companyId: string, feature: string) {
    const clean = String(feature || '').trim();
    if (!clean) return null;
    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const sourceId = `upgrade:${slug}`;
    const existing = await (this.prisma.aiEvent as any).findFirst({
      where: { companyId, type: 'PLATFORM_UPGRADE', sourceId },
      select: { id: true },
    });
    if (existing) return existing;
    return (this.prisma.aiEvent as any).create({
      data: {
        companyId,
        type:       'PLATFORM_UPGRADE',
        title:      `Upgrade idea: ${clean.slice(0, 80)}`,
        body:       'CLAW market-gap analysis suggests evaluating this capability. Mark Done once shipped, or Dismiss if it is not a fit.',
        severity:   'info',
        sourceType: 'CLAW_SUGGESTION',
        resolved:   false,
        dismissed:  false,
        metadata:   JSON.stringify({ feature: clean, threatLevel: 'MEDIUM', kind: 'upgrade' }),
      },
    });
  }

  // ── Public helper: latest report for dashboard ────────────────────────────

  async getLatestReport(companyId: string): Promise<IntelligenceReport | null> {
    const event = await (this.prisma.aiEvent as any).findFirst({
      where: { companyId, type: 'COMPETITIVE_INTELLIGENCE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!event?.metadata) return null;

    try {
      return JSON.parse(event.metadata) as IntelligenceReport;
    } catch {
      return null;
    }
  }

  async getInsights(companyId: string, limit = 20) {
    return (this.prisma.aiEvent as any).findMany({
      where: { companyId, type: { in: ['COMPETITIVE_INTELLIGENCE', 'COMPETITOR_THREAT'] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ── Platform-wide views (owner console) ───────────────────────────────────
  // Competitive intel is market-wide, not tenant-specific — the sweep does web
  // search + AI analysis and stores the same report per company. For the owner
  // console (which runs on an owner token, not a tenant token) we aggregate
  // across ALL companies so the owner sees the latest platform intelligence.

  /** Latest competitive report across every company. */
  async getLatestReportAny(): Promise<IntelligenceReport | null> {
    const event = await (this.prisma.aiEvent as any).findFirst({
      where: { type: 'COMPETITIVE_INTELLIGENCE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!event?.metadata) return null;
    try {
      return (typeof event.metadata === 'string'
        ? JSON.parse(event.metadata)
        : event.metadata) as IntelligenceReport;
    } catch {
      return null;
    }
  }

  /** Recent intel events across every company, de-duplicated by title. */
  async getInsightsAny(limit = 20) {
    const rows = await (this.prisma.aiEvent as any).findMany({
      where: { type: { in: ['COMPETITIVE_INTELLIGENCE', 'COMPETITOR_THREAT'] } },
      orderBy: { createdAt: 'desc' },
      take: limit * 4,
    });
    const seen = new Set<string>();
    const out: any[] = [];
    for (const r of rows) {
      if (seen.has(r.title)) continue;
      seen.add(r.title);
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Run a single sweep and persist the same report to every active company,
   * so the owner console and all tenant buckets stay in sync. Returns the
   * fresh report for immediate display.
   */
  async runSweepForPlatform(): Promise<IntelligenceReport> {
    const report = await this.runSweep('platform');
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const c of companies) {
      try {
        await this.persistAndBroadcast(c.id, report);
      } catch (err: any) {
        this.logger.error(`Intel persist failed for company ${c.id}: ${err.message}`);
      }
    }
    return report;
  }
}
