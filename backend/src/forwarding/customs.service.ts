import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * South African import customs estimator.
 *
 * SA import VAT is levied on the Added Tax Value (ATV), not the bare customs
 * value: ATV = (Customs Value x 1.10) + Duty, then VAT = ATV x 15%. The 10%
 * upliftment applies to imports. This is an ESTIMATE — the binding figure is
 * SARS's assessment on the SAD declaration.
 */
@Injectable()
export class CustomsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly VAT_RATE = 0.15;
  private readonly UPLIFTMENT = 0.10; // SA import ATV upliftment

  async estimate(companyId: string, fileId: string) {
    const file = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId },
      include: { cargo: true },
    });
    if (!file) throw new NotFoundException('Shipment file not found');

    const lines = (file.cargo || []).map((c) => {
      const customsValue = c.customsValue ?? 0;
      const dutyRatePct = c.dutyRatePct ?? 0;
      const duty = +(customsValue * (dutyRatePct / 100)).toFixed(2);
      const atv = +(customsValue * (1 + this.UPLIFTMENT) + duty).toFixed(2);
      const vat = +(atv * this.VAT_RATE).toFixed(2);
      return {
        cargoId: c.id,
        description: c.description,
        hsCode: c.hsCode,
        customsValue,
        dutyRatePct,
        duty,
        atv,
        vat,
        totalPayable: +(duty + vat).toFixed(2),
      };
    });

    const totals = lines.reduce(
      (a, l) => ({
        customsValue: +(a.customsValue + l.customsValue).toFixed(2),
        duty: +(a.duty + l.duty).toFixed(2),
        vat: +(a.vat + l.vat).toFixed(2),
        totalPayable: +(a.totalPayable + l.totalPayable).toFixed(2),
      }),
      { customsValue: 0, duty: 0, vat: 0, totalPayable: 0 },
    );

    return {
      currency: 'ZAR',
      vatRatePct: this.VAT_RATE * 100,
      upliftmentPct: this.UPLIFTMENT * 100,
      lines,
      totals,
      note: 'Estimate only — duty rates are operator/AI-set; SARS assessment on the SAD declaration is binding.',
    };
  }

  /** AI: suggest a typical SA ad valorem duty rate for an HS code / description. */
  async suggestDutyRate(hsCode?: string, description?: string) {
    const key = process.env.GROQ_API_KEY;
    if (!key) return { available: false };
    const prompt = `You are a South African customs duty expert. For HS code "${hsCode || 'unknown'}" (goods: "${(description || '').slice(0, 200)}"), give the typical SA ad valorem import duty rate. Return STRICT JSON: {"dutyRatePct": number, "note": "short rationale"}. If unsure, give a reasonable estimate and say so in the note.`;
    try {
      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
      });
      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return { available: false };
      const parsed = JSON.parse(m[0]);
      return { available: true, dutyRatePct: Number(parsed.dutyRatePct) || 0, note: String(parsed.note || '').slice(0, 300) };
    } catch {
      return { available: false };
    }
  }
}
