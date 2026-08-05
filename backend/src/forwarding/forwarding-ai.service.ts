import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

@Injectable()
export class ForwardingAiService {
  private readonly logger = new Logger('FORWARDING_AI');

  constructor(private readonly prisma: PrismaService) {}

  private async groqJson(prompt: string): Promise<any | null> {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    try {
      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
      });
      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content || '';
      const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      return match ? JSON.parse(match[0]) : null;
    } catch (e: any) {
      this.logger.warn(`Groq call failed: ${e.message}`);
      return null;
    }
  }

  // ── HS-code classification ───────────────────────────────────────────────

  /** Suggest the most likely SA HS tariff heading(s) for a goods description. */
  async classifyHs(description: string) {
    if (!description?.trim()) return { available: false, suggestions: [] };
    const prompt = `You are a South African customs tariff classifier. For the goods below, return STRICT JSON:
{"suggestions":[{"hsCode":"6-10 digit heading","description":"tariff description","confidence":0-100}]}
Give up to 3 candidates, most likely first. Goods: "${description.slice(0, 400)}"`;
    const out = await this.groqJson(prompt);
    if (!out) return { available: false, suggestions: [] };
    return { available: true, suggestions: Array.isArray(out.suggestions) ? out.suggestions.slice(0, 3) : [] };
  }

  // ── Demurrage / delay risk ─────────────────────────────────────────────────

  /**
   * Score a file 0–100 for demurrage/delay risk. Deterministic base (ETA
   * proximity + milestone progress), with an optional AI note. Persists the
   * score + note on the file so the console can rank by risk.
   */
  async assessRisk(companyId: string, fileId: string) {
    const file = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId },
      include: { milestones: true },
    });
    if (!file) throw new NotFoundException('Shipment file not found');

    let score = 0;
    const reasons: string[] = [];
    const now = Date.now();

    // ETA proximity without arrival → rising risk.
    if (file.eta && file.status !== 'DELIVERED' && file.status !== 'CUSTOMS_CLEARED') {
      const days = Math.ceil((new Date(file.eta).getTime() - now) / 86_400_000);
      if (days < 0) { score += 50; reasons.push(`ETA passed ${Math.abs(days)}d ago, not yet cleared`); }
      else if (days <= 2) { score += 30; reasons.push(`Arriving in ${days}d, clearance not started`); }
      else if (days <= 5) { score += 15; reasons.push(`Arriving in ${days}d`); }
    }
    // Stuck early in the lifecycle.
    if (['DRAFT', 'BOOKED'].includes(file.status)) { score += 10; reasons.push('Still pre-departure'); }
    // Arrived but not cleared → demurrage clock risk.
    if (file.status === 'ARRIVED') { score += 35; reasons.push('Arrived but not customs-cleared (demurrage risk)'); }

    score = Math.min(100, score);

    // Optional AI-written one-liner (best-effort).
    let aiNote: string | null = null;
    const ai = await this.groqJson(
      `You are a freight ops risk analyst. In ONE sentence (return {"note":"..."}), summarise the demurrage/delay risk for a ${file.direction} ${file.mode} shipment, status ${file.status}, ETA ${file.eta ?? 'unknown'}. Risk signals: ${reasons.join('; ') || 'none'}.`,
    );
    if (ai?.note) aiNote = String(ai.note).slice(0, 300);

    const note = aiNote || (reasons.length ? reasons.join('; ') : 'No significant risk signals.');
    await this.prisma.shipmentFile.update({
      where: { id: fileId },
      data: { aiRiskScore: score, aiRiskNote: note },
    });
    return { riskScore: score, riskNote: note, reasons };
  }

  // ── Document → file draft extraction (text-based) ──────────────────────────

  /**
   * Extract a Shipment File draft from pasted document text (e.g. a commercial
   * invoice or B/L). Returns a draft object — the operator confirms before save.
   */
  async extractFromText(text: string) {
    if (!text?.trim()) return { available: false, draft: null };
    const prompt = `Extract freight shipment fields from this document text. Return STRICT JSON:
{"shipperName":"","consigneeName":"","goodsDescription":"","incoterm":"","pol":"","pod":"","vesselVoyage":"","containers":["ABCU1234567"],"hsHints":["..."]}
Use empty strings/arrays when unknown. Document:
${text.slice(0, 3000)}`;
    const out = await this.groqJson(prompt);
    if (!out) return { available: false, draft: null };
    return { available: true, draft: out };
  }
}
