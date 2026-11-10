import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { estimateImportDuty } from '../public-tools/sa-import-duty';
import { GROQ_ENDPOINT, GROQ_MODEL } from '../ai/groq-model';

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


  async estimate(companyId: string, fileId: string) {
    const file = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId },
      include: { cargo: true },
    });
    if (!file) throw new NotFoundException('Shipment file not found');

    // The duty arithmetic lives in ONE place (public-tools/sa-import-duty.ts),
    // shared by the public calculator, this in-product estimate and the landing
    // cost page. It used to be re-implemented here with its own VAT_RATE and
    // UPLIFTMENT constants — a third copy sat in rate-shopping. Three copies of
    // a statutory rate is three places to miss when SARS changes it: VAT moved
    // 14% -> 15% in 2018 and will move again.
    //
    // The shared implementation also rounds more correctly. This file used
    // Number.toFixed(2), which rounds 1.005 down to "1.00" because it operates
    // on the binary float rather than the decimal; the shared helper adds
    // Number.EPSILON before scaling. Totals can therefore differ from before by
    // a cent on values that land exactly on a half — that is a fix, not a
    // regression, and the tests below pin the new behaviour.
    const cargo = file.cargo || [];
    const estimate = estimateImportDuty(
      cargo.map((c) => ({
        description: c.description,
        hsCode: c.hsCode,
        quantity: (c as any).quantity,
        customsValue: c.customsValue ?? 0,
        dutyRatePct: c.dutyRatePct ?? 0,
      })),
    );
    // Re-attach the cargo row id the shared helper has no concept of.
    const lines = estimate.lines.map((l, i) => ({ cargoId: cargo[i]?.id, ...l }));

    return {
      ...estimate,
      lines,
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
