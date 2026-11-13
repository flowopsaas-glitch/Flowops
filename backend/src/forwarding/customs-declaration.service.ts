import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
/**
 * Advisory-lock namespace for SAD submission. Two intents share the 64190x
 * block with invoice numbering (`charges`, `invoices` both use 641902); this
 * one keys on the declaration id, so two different declarations never
 * serialise against each other.
 */
const SUBMIT_LOCK_NAMESPACE = 641905;

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
    const cred = await this.credentials.decryptFor(companyId);
    const transport = this.transports.forPath(cred?.path);

    // ── Phase 1: claim the transmission, atomically ──────────────────────────
    //
    // The old code checked for a prior ACK and *then* transmitted. The ACK is
    // only written after transmission succeeds, so two overlapping calls both
    // passed the check and both reached SARS — the declaration was lodged
    // twice. A double-lodged SAD is a customs incident: the consignment is
    // held, and clearing it needs a formal cancellation or amendment.
    //
    // So the guard and the intent to transmit are committed together, before
    // anything leaves the building:
    //
    //   * the advisory lock serialises callers on this one declaration, so the
    //     check-then-insert cannot interleave;
    //   * the OUTBOUND/SENT row is the durable claim. It survives a crash, so
    //     a retry after we transmitted but before we recorded the outcome is
    //     refused rather than re-sent.
    //
    // The lock covers only this short block, never the network call — holding
    // a transaction across an HTTP request to SARS would tie up a pooled
    // connection for the duration.
    const inFlight = await this.prisma.withTenant(companyId, async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SUBMIT_LOCK_NAMESPACE}, hashtext(${id}))`;

      const d = await tx.customsDeclaration.findFirst({ where: { id, companyId } });
      if (!d) throw new NotFoundException('Declaration not found');
      if (d.status !== 'DRAFT' && d.status !== 'REJECTED') {
        throw new ForbiddenException(`Declaration is already ${d.status}.`);
      }

      const prior = await (tx as any).customsEdiMessage.findFirst({
        where: {
          declarationId: id,
          companyId,
          direction: 'OUTBOUND',
          messageType: 'CUSDEC',
          status: { in: ['SENT', 'ACK'] },
        },
      });
      if (prior?.status === 'ACK') {
        throw new ForbiddenException(
          'This declaration has already been transmitted (CUSDEC ack on record).',
        );
      }
      if (prior?.status === 'SENT') {
        // We transmitted and never learned the outcome. Refusing is the only
        // safe answer: SARS may well hold the declaration already.
        throw new ConflictException(
          'A submission of this declaration is already in flight and its outcome was never ' +
            'recorded. Confirm with SARS whether it was received before transmitting again — ' +
            'sending a second SAD for the same consignment gets the cargo held.',
        );
      }

      return (tx as any).customsEdiMessage.create({
        data: {
          declarationId: id,
          companyId,
          direction: 'OUTBOUND',
          messageType: 'CUSDEC',
          status: 'SENT',
          payload: (d.payload as any) ?? undefined,
        },
      });
    });

    // ── Phase 2: transmit ────────────────────────────────────────────────────
    const d = await this.getDeclaration(companyId, id);
    let result: Awaited<ReturnType<typeof transport.transmit>>;
    try {
      result = await transport.transmit(cred ?? ({ companyId, path: 'NONE' } as any), d as any);
    } catch (error) {
      // The transport failed before returning. Release the claim so the
      // operator can try again — nothing reached SARS, or we cannot know that
      // it did not, and the error names that explicitly.
      await this.prisma.withTenant(companyId, async (tx) => {
        await (tx as any).customsEdiMessage.updateMany({
          where: { id: inFlight.id, companyId },
          data: {
            status: 'ERROR',
            error: `Transmission failed before a response was recorded: ${
              error instanceof Error ? error.message : String(error)
            }. Confirm with SARS that nothing was received before retrying.`,
          },
        });
      });
      throw error;
    }

    // ── Phase 3: record the outcome ──────────────────────────────────────────
    // Compare-and-set on the status phase 1 verified. Nothing else should move
    // the declaration while a submission is in flight, and if something does,
    // it must win rather than be overwritten.
    const verified = await this.getDeclaration(companyId, id);
    await this.prisma.withTenant(companyId, async (tx) => {
      await (tx as any).customsEdiMessage.updateMany({
        where: { id: inFlight.id, companyId },
        data: {
          status: result.accepted ? 'ACK' : 'ERROR',
          reference: result.reference ?? null,
          error: result.accepted ? null : result.note,
        },
      });

      if (!result.lodged) {
        // Not lodged with SARS — keep the status honest and say what happened.
        return tx.customsDeclaration.updateMany({
          where: { id, companyId, status: verified.status as any },
          data: {
            responseNote: result.note,
            lodgementProvider: result.accepted ? cred?.path ?? null : null,
          },
        });
      }

      const { count } = await tx.customsDeclaration.updateMany({
        where: { id, companyId, status: verified.status as any },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
          lodgementProvider: cred?.path ?? null,
          responseNote: result.note,
        },
      });
      if (count === 0) {
        throw new ConflictException(
          'The declaration changed while the submission was in flight — the SARS ' +
            'acknowledgement was recorded against the message log, but the status was not moved.',
        );
      }
    });

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

    return this.getDeclaration(companyId, id);
  }

  /** Record a SARS response / manual status change (RELEASED | QUERY | REJECTED). */
  async setStatus(companyId: string, id: string, status: string, mrn?: string, note?: string) {
    const existing = await this.getDeclaration(companyId, id);
    const allowed = ['DRAFT', 'SUBMITTED', 'QUERY', 'RELEASED', 'REJECTED'];
    if (!allowed.includes(status)) throw new ForbiddenException(`Invalid status. Use: ${allowed.join(', ')}`);

    // Compare-and-set on the status this call read. Two SARS responses arriving
    // together (an automated CUSRES and an operator recording what the agent
    // told them) used to both write, and the notification went out for the one
    // that lost — so the app announced a status the declaration does not hold.
    const { count } = await this.prisma.customsDeclaration.updateMany({
      where: { id, companyId, status: existing.status as any },
      data: {
        status: status as any,
        mrn: mrn ?? undefined,
        responseNote: note ?? undefined,
        responseAt: new Date(),
      },
    });
    if (count === 0) {
      throw new ConflictException(
        `The declaration was already moved to another status while this response was being recorded.`,
      );
    }
    const updated = await this.getDeclaration(companyId, id);

    // ── Close the loop ───────────────────────────────────────────────────
    // A status change is the inbound SARS/agent response (CUSRES). Record it as
    // an INBOUND message and raise a staff notification so the response is
    // visible end-to-end. Best-effort — never blocks the status write.
    try {
      await (this.prisma as any).customsEdiMessage.create({
        data: {
          declarationId: id,
          companyId,
          direction: 'INBOUND',
          messageType: 'CUSRES',
          status: 'RECEIVED',
          reference: mrn ?? null,
          payload: { status, mrn: mrn ?? null, note: note ?? null } as any,
        },
      });
    } catch {
      /* best-effort */
    }
    try {
      await (this.prisma as any).notification.create({
        data: {
          companyId,
          title: `Customs ${status.toLowerCase()} · ${existing.lrn ?? id}`,
          body: `SARS response recorded${mrn ? ` — MRN ${mrn}` : ''}.${note ? ` ${note}` : ''}`,
          type: 'CUSTOMS_RESPONSE',
        },
      });
    } catch {
      /* best-effort */
    }

    return updated;
  }

  /** Full CUSDEC/CUSRES message log for a declaration (audit + UI timeline). */
  async getMessages(companyId: string, id: string) {
    await this.getDeclaration(companyId, id);
    return (this.prisma as any).customsEdiMessage.findMany({
      where: { declarationId: id, companyId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
