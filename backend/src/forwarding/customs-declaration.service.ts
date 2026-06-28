import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomsService } from './customs.service';
import { CustomsEdiCredentialService } from './customs-edi/customs-edi-credential.service';
import { CustomsEdiTransportFactory } from './customs-edi/customs-edi-transport.factory';

/**
 * SAD (Single Administrative Document) declaration workflow.
 *
 * Build + lifecycle is unchanged. `submit()` now routes through the pluggable
 * per-tenant transport (see customs-edi/): the tenant's configured path decides
 * how (and whether) the declaration reaches SARS. Status is only advanced to
 * SUBMITTED on a genuine SARS acknowledgement — handoff / fail-closed / no-config
 * paths keep the declaration honest and explain the next step.
 */
@Injectable()
export class CustomsDeclarationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customs: CustomsService,
    private readonly credentials: CustomsEdiCredentialService,
    private readonly transports: CustomsEdiTransportFactory,
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
   * Submit the declaration through the tenant's configured transmission path.
   * Status advances to SUBMITTED only on a genuine SARS acknowledgement
   * (`result.lodged`). Handoff / fail-closed / unconfigured paths keep the
   * current status and record an explicit, honest note + an OUTBOUND message.
   */
  async submit(companyId: string, id: string) {
    const d = await this.getDeclaration(companyId, id);
    if (d.status !== 'DRAFT' && d.status !== 'REJECTED') {
      throw new ForbiddenException(`Declaration is already ${d.status}.`);
    }

    // Idempotency: never re-transmit a CUSDEC that already got an ACK for this LRN.
    const priorAck = await (this.prisma as any).customsEdiMessage.findFirst({
      where: { declarationId: id, direction: 'OUTBOUND', messageType: 'CUSDEC', status: 'ACK' },
    });
    if (priorAck) {
      throw new ForbiddenException('This declaration has already been transmitted (CUSDEC ack on record).');
    }

    const cred = await this.credentials.decryptFor(companyId);
    const transport = this.transports.forPath(cred?.path);
    const result = await transport.transmit(
      cred ?? ({ companyId, path: 'NONE' } as any),
      d as any,
    );

    // Record the OUTBOUND CUSDEC attempt (audit + idempotency).
    await (this.prisma as any).customsEdiMessage.create({
      data: {
        declarationId: id,
        companyId,
        direction: 'OUTBOUND',
        messageType: 'CUSDEC',
        status: result.accepted ? 'ACK' : 'ERROR',
        reference: result.reference ?? null,
        payload: (d.payload as any) ?? undefined,
        error: result.accepted ? null : result.note,
      },
    });

    let updated;
    if (result.lodged) {
      // Genuine SARS acknowledgement — safe to claim SUBMITTED.
      updated = await this.prisma.customsDeclaration.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          lodgementProvider: cred?.path ?? null,
          responseNote: result.note,
        },
      });
    } else {
      // Not lodged with SARS — keep status honest, record what happened + next step.
      updated = await this.prisma.customsDeclaration.update({
        where: { id },
        data: {
          responseNote: result.note,
          lodgementProvider: result.accepted ? cred?.path ?? null : null,
        },
      });
    }

    try {
      await (this.prisma as any).aiEvent.create({
        data: {
          companyId,
          type: 'CUSTOMS_DECLARATION',
          title: `Declaration submit: ${d.lrn}`,
          body: result.note,
          severity: 'info',
          sourceType: 'FORWARDING',
          sourceId: d.fileId,
          resolved: true,
        },
      });
    } catch {
      /* best-effort */
    }

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
