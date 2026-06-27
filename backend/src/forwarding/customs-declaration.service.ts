import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomsService } from './customs.service';

/**
 * SAD (Single Administrative Document) declaration workflow.
 *
 * IMPORTANT: this builds the declaration + a CUSDEC-style payload and runs the
 * lifecycle (DRAFT → SUBMITTED → RELEASED/QUERY/REJECTED). Actual SARS EDI wire
 * submission requires SARS accreditation + a registered EDI gateway/VAN, which
 * is not connected here — `submit()` is a clearly-marked stub. When a gateway
 * is available, swap the stub for the real CUSDEC transmission + CUSRES handler.
 */
@Injectable()
export class CustomsDeclarationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customs: CustomsService,
  ) {}

  private async getFile(companyId: string, fileId: string) {
    const f = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId },
      include: { cargo: true },
    });
    if (!f) throw new NotFoundException('Shipment file not found');
    return f;
  }

  /** Build (or refresh the DRAFT) declaration + CUSDEC-style payload from the file. */
  async buildForFile(companyId: string, fileId: string) {
    const file = await this.getFile(companyId, fileId);
    const estimate = await this.customs.estimate(companyId, fileId);

    const payload = {
      lrn: `${file.fileNumber}-SAD`,
      type: file.direction,
      transport: { mode: file.mode, vesselVoyage: file.vesselVoyage, pol: file.pol, pod: file.pod },
      parties: {
        shipper: file.shipperName,
        consignee: file.consigneeName,
        notify: file.notifyParty,
        carrier: file.carrierName,
      },
      incoterm: file.incoterm,
      lines: estimate.lines.map((l) => ({
        hsCode: l.hsCode, description: l.description, customsValue: l.customsValue,
        dutyRatePct: l.dutyRatePct, duty: l.duty, vat: l.vat,
      })),
      totals: estimate.totals,
      currency: estimate.currency,
      generatedAt: new Date().toISOString(),
    };

    const existingDraft = await this.prisma.customsDeclaration.findFirst({
      where: { fileId, status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
    });

    const data = {
      type: file.direction,
      lrn: payload.lrn,
      payload: payload as any,
      customsValueTotal: estimate.totals.customsValue,
      dutyTotal: estimate.totals.duty,
      vatTotal: estimate.totals.vat,
    };

    if (existingDraft) {
      return this.prisma.customsDeclaration.update({ where: { id: existingDraft.id }, data });
    }
    return this.prisma.customsDeclaration.create({ data: { ...data, fileId, companyId } });
  }

  async getForFile(companyId: string, fileId: string) {
    await this.getFile(companyId, fileId);
    return this.prisma.customsDeclaration.findFirst({
      where: { fileId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getDeclaration(companyId: string, id: string) {
    const d = await this.prisma.customsDeclaration.findFirst({ where: { id, companyId } });
    if (!d) throw new NotFoundException('Declaration not found');
    return d;
  }

  /**
   * Submit the declaration. STUB: no live SARS EDI gateway is configured, so
   * this records the intent and moves to SUBMITTED. Replace with the real
   * CUSDEC transmission once accredited.
   */
  async submit(companyId: string, id: string) {
    const d = await this.getDeclaration(companyId, id);
    if (d.status !== 'DRAFT' && d.status !== 'REJECTED') {
      throw new ForbiddenException(`Declaration is already ${d.status}.`);
    }
    const updated = await this.prisma.customsDeclaration.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        responseNote: 'Queued for SARS EDI. NOTE: no live EDI gateway is configured — this is a workflow stub, not a real SARS lodgement.',
      },
    });
    try {
      await (this.prisma as any).aiEvent.create({
        data: {
          companyId, type: 'CUSTOMS_DECLARATION', title: `Declaration submitted: ${d.lrn}`,
          body: 'SAD declaration moved to SUBMITTED (EDI gateway stub).', severity: 'info',
          sourceType: 'FORWARDING', sourceId: d.fileId, resolved: true,
        },
      });
    } catch { /* best-effort */ }
    return updated;
  }

  /** Record a SARS response / manual status change (RELEASED | QUERY | REJECTED). */
  async setStatus(companyId: string, id: string, status: string, mrn?: string, note?: string) {
    await this.getDeclaration(companyId, id);
    const allowed = ['DRAFT', 'SUBMITTED', 'QUERY', 'RELEASED', 'REJECTED'];
    if (!allowed.includes(status)) throw new ForbiddenException(`Invalid status. Use: ${allowed.join(', ')}`);
    return this.prisma.customsDeclaration.update({
      where: { id },
      data: {
        status: status as any,
        mrn: mrn ?? undefined,
        responseNote: note ?? undefined,
        responseAt: new Date(),
      },
    });
  }
}
