import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateGaEventDto,
  LodgeSecurityDto,
  RecordAwardDto,
  UpdateGaEventDto,
} from './dto/general-average.dto';
import { Money } from '../common/money.util';

/**
 * General Average.
 *
 * This module exists because of one operational rule, and everything else in
 * it is in service of that rule:
 *
 *   THE SHIPOWNER HAS A LIEN OVER THE CARGO. CARGO IS NOT RELEASED UNTIL THE
 *   CARGO INTEREST HAS LODGED GA SECURITY. A FORWARDER WHO RELEASES CARGO
 *   WITHOUT SECURITY IS PERSONALLY LIABLE FOR THE CONTRIBUTION.
 *
 * That is a liability the software can prevent outright, which makes it worth
 * more than any report this module could produce.
 *
 * The principle: when extraordinary expenditure is incurred, or property
 * sacrificed, to save ship and cargo from a common danger, the loss is shared
 * proportionally by everyone whose property came through it — hull, freight
 * and every cargo interest on the voyage. A cargo owner whose goods arrived
 * undamaged still owes a contribution. Cargo release may require financial
 * security before collection.
 *
 * What this module deliberately does NOT do:
 *
 *   - It does not calculate the general average adjustment. That is the
 *     adjuster's job, it is governed by the York-Antwerp Rules, and it can
 *     take years. FlowOps records the award; it does not invent one.
 *   - It does not decide contributory values. It stores what was declared and
 *     what the adjuster assessed, side by side, so they can be reconciled.
 *   - It does not claim to be legal advice. Every estimate is labelled
 *     provisional until the award lands.
 *
 * Every figure derived before the award is explicitly provisional. That is not
 * hedging — a provisional GA figure quoted to a customer as final is exactly
 * the kind of thing that ends up in a dispute.
 */

const PROVISIONAL_NOTE =
  'Provisional. A general average contribution is not final until the adjuster publishes the adjustment.';

@Injectable()
export class GeneralAverageService {
  private readonly logger = new Logger(GeneralAverageService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Events ───────────────────────────────────────────────────────────────

  async listEvents(companyId: string) {
    return this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageEvent.findMany({
        where: { companyId },
        include: { _count: { select: { contributors: true } } },
        orderBy: { occurredAt: 'desc' },
      }),
    );
  }

  async createEvent(companyId: string, dto: CreateGaEventDto) {
    if (!dto.vesselName?.trim()) {
      throw new BadRequestException('A vessel name is required.');
    }
    if (!dto.nature?.trim()) {
      throw new BadRequestException('Record what happened — the wording matters later.');
    }
    if (dto.totalExpenditure < 0 || dto.totalSacrifice < 0) {
      throw new BadRequestException('Expenditure and sacrifice cannot be negative.');
    }

    return this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageEvent.create({
        data: {
          companyId,
          vesselName: dto.vesselName.trim(),
          vesselImo: dto.vesselImo?.trim() || null,
          vesselMmsi: dto.vesselMmsi?.trim() || null,
          voyageNumber: dto.voyageNumber?.trim() || null,
          occurredAt: new Date(dto.occurredAt),
          portOfRefuge: dto.portOfRefuge?.trim() || null,
          nature: dto.nature.trim(),
          declaredBy: dto.declaredBy?.trim() || null,
          declaredAt: dto.declaredAt ? new Date(dto.declaredAt) : null,
          adjusterName: dto.adjusterName?.trim() || null,
          adjusterRef: dto.adjusterRef?.trim() || null,
          totalExpenditure: dto.totalExpenditure ?? 0,
          totalSacrifice: dto.totalSacrifice ?? 0,
          currency: dto.currency ?? 'USD',
          notes: dto.notes?.trim() || null,
        },
      }),
    );
  }

  async getEvent(companyId: string, id: string) {
    const ev = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageEvent.findFirst({
        where: { id, companyId },
        include: {
          contributors: {
            include: {
              shipmentFile: { select: { id: true, fileNumber: true, consigneeName: true, pod: true } },
            },
            orderBy: { contributoryValue: 'desc' },
          },
        },
      }),
    );
    if (!ev) throw new NotFoundException('General average event not found');
    return { ...ev, provisionalNote: PROVISIONAL_NOTE };
  }

  async updateEvent(companyId: string, id: string, dto: UpdateGaEventDto) {
    await this.assertEvent(companyId, id);
    return this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageEvent.update({
        where: { id },
        data: {
          ...(dto.vesselName !== undefined && { vesselName: dto.vesselName.trim() }),
          ...(dto.nature !== undefined && { nature: dto.nature.trim() }),
          ...(dto.totalExpenditure !== undefined && { totalExpenditure: dto.totalExpenditure }),
          ...(dto.totalSacrifice !== undefined && { totalSacrifice: dto.totalSacrifice }),
          ...(dto.adjusterName !== undefined && { adjusterName: dto.adjusterName }),
          ...(dto.adjusterRef !== undefined && { adjusterRef: dto.adjusterRef }),
          ...(dto.status !== undefined && { status: dto.status as any }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      }),
    );
  }

  // ── Contributors ─────────────────────────────────────────────────────────

  /**
   * Find the cargo interests on this voyage.
   *
   * Matches OCEAN shipment files on the same vessel/voyage, or the same IMO,
   * or the same MMSI — whichever identifies the ship. Files already recorded
   * as contributors are excluded so re-running is safe.
   *
   * The contributory value proposed is CIF, and where the file's incoterm is
   * not already CIF it is flagged rather than silently treated as if it were:
   * the basis matters to the adjuster and to the underwriter.
   */
  async discoverContributors(companyId: string, eventId: string) {
    const ev = await this.assertEvent(companyId, eventId);

    const or: any[] = [];
    if (ev.voyageNumber) or.push({ vesselVoyage: ev.voyageNumber });
    if (ev.vesselImo) or.push({ vesselImo: ev.vesselImo });
    if (ev.vesselMmsi) or.push({ vesselMmsi: ev.vesselMmsi });
    if (or.length === 0) return { candidates: [], matchedOn: 'nothing' };

    const { files, taken } = await this.prisma.withTenant(companyId, async (tx) => {
      const f = await tx.shipmentFile.findMany({
        where: { companyId, mode: 'OCEAN' as any, OR: or },
        include: { cargo: { select: { customsValue: true } } },
      });
      const c = await tx.generalAverageContributor.findMany({
        where: { eventId },
        select: { shipmentFileId: true },
      });
      return { files: f, taken: c.map((x) => x.shipmentFileId) };
    });
    const existing = new Set(taken);

    const candidates = files
      .filter((f) => !existing.has(f.id))
      .map((f) => {
        const cif = (f.cargo || []).reduce((sum, c) => sum + (c.customsValue ?? 0), 0);
        const incoterm = (f.incoterm || '').toUpperCase();
        return {
          shipmentFileId: f.id,
          fileNumber: f.fileNumber,
          consigneeName: f.consigneeName,
          pod: f.pod,
          incoterm: f.incoterm,
          suggestedValue: cif,
          basis: 'CIF' as const,
          // Flag, do not convert. Turning FOB into CIF requires the actual
          // insurance and freight figures, and guessing them is how a
          // contribution ends up disputed.
          needsReview: cif === 0 || (incoterm !== '' && incoterm !== 'CIF' && incoterm !== 'CIP'),
        };
      });

    return { candidates, matchedOn: ev.voyageNumber ? 'voyage' : ev.vesselImo ? 'imo' : 'mmsi' };
  }

  async addContributor(
    companyId: string,
    eventId: string,
    dto: { shipmentFileId: string; contributoryValue: number; valueBasis?: string; notes?: string },
  ) {
    await this.assertEvent(companyId, eventId);

    if (!(dto.contributoryValue >= 0)) {
      throw new BadRequestException('A contributory value is required and cannot be negative.');
    }

    const file = await this.prisma.withTenant(companyId, (tx) =>
      tx.shipmentFile.findFirst({ where: { id: dto.shipmentFileId, companyId }, select: { id: true } }),
    );
    if (!file) throw new NotFoundException('Shipment file not found');

    const created = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageContributor.create({
        data: {
          companyId,
          eventId,
          shipmentFileId: dto.shipmentFileId,
          contributoryValue: dto.contributoryValue,
          valueBasis: (dto.valueBasis as any) ?? 'DECLARED',
          notes: dto.notes ?? null,
        },
      }),
    );

    await this.recomputeShares(companyId, eventId);
    return created;
  }

  /**
   * Recompute every contributor's share from the stored values.
   *
   * Share = this interest's contributory value / total contributory value,
   * applied to expenditure + sacrifice. The hull and freight also contribute;
   * they are not modelled here because the tenant is a cargo interest, not the
   * shipowner, and their shares are not ours to compute.
   */
  async recomputeShares(companyId: string, eventId: string) {
    const ev = await this.assertEvent(companyId, eventId);
    const rows = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageContributor.findMany({ where: { eventId } }),
    );

    const total = rows.reduce((s, r) => s + (r.adjustedValue ?? r.contributoryValue), 0);
    const pool = (ev.totalExpenditure ?? 0) + (ev.totalSacrifice ?? 0);

    await this.prisma.withTenant(companyId, async (tx) => {
      for (const r of rows) {
        const value = r.adjustedValue ?? r.contributoryValue;
        // Zero total would divide by zero; share is undefined, not 0.
        const sharePct = total > 0 ? (value / total) * 100 : null;
        const estimated = sharePct === null ? null : round2((sharePct / 100) * pool);
        await tx.generalAverageContributor.update({
          where: { id: r.id },
          data: { sharePct, estimatedContribution: estimated },
        });
      }
    });

    return this.getEvent(companyId, eventId);
  }

  // ── Security and the release gate ────────────────────────────────────────

  async lodgeSecurity(companyId: string, eventId: string, contributorId: string, dto: LodgeSecurityDto) {
    const c = await this.assertContributor(companyId, eventId, contributorId);

    if (c.securityLodgedAt) {
      throw new ConflictException(
        'Security has already been lodged for this cargo interest. Amending it is a new record, not an overwrite — release it first.',
      );
    }
    if (!(dto.amount > 0)) {
      throw new BadRequestException('A security amount is required and must be greater than zero.');
    }

    const claimed = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageContributor.updateMany({
        where: { id: contributorId, eventId, securityLodgedAt: null },
        data: {
          securityType: dto.securityType as any,
          securityAmount: dto.amount,
          securityRef: dto.reference?.trim() || null,
          securityLodgedAt: new Date(),
        },
      }),
    );
    if (claimed.count === 0) {
      throw new ConflictException('Security was lodged by someone else first. Nothing was changed.');
    }

    await this.advanceStatusIfSecure(companyId, eventId);
    return this.getEvent(companyId, eventId);
  }

  /** True only when security is on record. This is the gate. */
  canReleaseCargo(c: { securityLodgedAt: Date | null }): boolean {
    return !!c.securityLodgedAt;
  }

  /**
   * Record that cargo was released.
   *
   * Refuses outright if no security is lodged. This is the whole point of the
   * module: the check is in the service, not only in a button's disabled
   * state, so no controller, import or future caller can bypass it.
   */
  async releaseCargo(
    companyId: string,
    eventId: string,
    contributorId: string,
    actorId: string,
  ) {
    const c = await this.assertContributor(companyId, eventId, contributorId);

    if (!this.canReleaseCargo(c)) {
      throw new ConflictException(
        'Cargo cannot be released: no general average security is on record for this cargo interest. ' +
          'The shipowner holds a lien over the cargo, and releasing it without security makes the ' +
          'forwarder personally liable for the contribution. Lodge security first.',
      );
    }
    if (c.releasedAt) {
      throw new ConflictException('This cargo is already recorded as released.');
    }

    const claimed = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageContributor.updateMany({
        where: { id: contributorId, eventId, releasedAt: null },
        data: { releasedAt: new Date(), releasedBy: actorId },
      }),
    );
    if (claimed.count === 0) {
      throw new ConflictException('This cargo was released by someone else first. Nothing was changed.');
    }

    this.logger.log(`GA ${eventId}: cargo released for contributor ${contributorId} by ${actorId}`);
    return this.getEvent(companyId, eventId);
  }

  // ── Award and settlement ─────────────────────────────────────────────────

  /**
   * Record the adjuster's award.
   *
   * Until this lands, every contribution figure is provisional. After it
   * lands, the difference between what was secured and what was assessed
   * becomes a balance: refund due, or still owed.
   */
  async recordAward(companyId: string, eventId: string, dto: RecordAwardDto) {
    await this.assertEvent(companyId, eventId);

    const contributions = dto.contributions ?? [];
    if (contributions.length === 0) {
      throw new BadRequestException('An award must state at least one assessed contribution.');
    }

    await this.prisma.withTenant(companyId, async (tx) => {
      for (const c of contributions) {
        if (!(c.assessedContribution >= 0)) continue;
        await tx.generalAverageContributor.updateMany({
          where: { id: c.contributorId, eventId },
          data: {
            assessedContribution: c.assessedContribution,
            ...(c.adjustedValue !== undefined && {
              adjustedValue: c.adjustedValue,
              valueBasis: 'ADJUSTED' as any,
            }),
          },
        });
      }
      await tx.generalAverageEvent.updateMany({
        where: { id: eventId, companyId },
        data: {
          status: 'ADJUSTED' as any,
          ...(dto.adjusterName !== undefined && { adjusterName: dto.adjusterName }),
          ...(dto.adjusterRef !== undefined && { adjusterRef: dto.adjusterRef }),
        },
      });
    });

    // Balance = assessed - secured. Positive: still owed. Negative: refund due.
    const rows = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageContributor.findMany({ where: { eventId } }),
    );
    await this.prisma.withTenant(companyId, async (tx) => {
      for (const r of rows) {
        if (r.assessedContribution === null) continue;
        const secured = r.securityAmount ?? 0;
        await tx.generalAverageContributor.update({
          where: { id: r.id },
          data: { balanceDue: round2(r.assessedContribution - secured) },
        });
      }
    });

    return this.getEvent(companyId, eventId);
  }

  async settle(companyId: string, eventId: string) {
    await this.assertEvent(companyId, eventId);
    const rows = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageContributor.findMany({ where: { eventId } }),
    );

    const outstanding = rows.filter((r) => (r.balanceDue ?? 0) > 0);
    if (outstanding.length > 0) {
      throw new ConflictException(
        `${outstanding.length} cargo interest(s) still owe a balance. Settle those before closing the event.`,
      );
    }

    await this.prisma.withTenant(companyId, async (tx) => {
      const now = new Date();
      for (const r of rows) {
        await tx.generalAverageContributor.updateMany({
          where: { id: r.id, eventId, settledAt: null },
          data: { settledAt: now },
        });
      }
      await tx.generalAverageEvent.updateMany({
        where: { id: eventId, companyId },
        data: { status: 'SETTLED' as any },
      });
    });

    return this.getEvent(companyId, eventId);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async advanceStatusIfSecure(companyId: string, eventId: string) {
    const rows = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageContributor.findMany({ where: { eventId } }),
    );
    if (rows.length === 0) return;
    const secured = rows.filter((r) => !!r.securityLodgedAt).length;
    if (secured === 0) return;

    // Partial security is its own state. Collecting bonds takes weeks and the
    // desk needs to see "3 of 12 lodged" without opening the file; without a
    // SECURING step the board would read DECLARED until the last bond lands,
    // and SECURING would be a state nothing ever sets.
    const allSecured = secured === rows.length;

    await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageEvent.updateMany({
        where: {
          id: eventId,
          companyId,
          status: { in: allSecured ? (['DECLARED', 'SECURING'] as any) : (['DECLARED'] as any) },
        },
        data: { status: allSecured ? ('SECURED' as any) : ('SECURING' as any) },
      }),
    );
  }

  private async assertEvent(companyId: string, id: string) {
    const ev = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageEvent.findFirst({ where: { id, companyId } }),
    );
    if (!ev) throw new NotFoundException('General average event not found');
    return ev;
  }

  private async assertContributor(companyId: string, eventId: string, contributorId: string) {
    await this.assertEvent(companyId, eventId);
    const c = await this.prisma.withTenant(companyId, (tx) =>
      tx.generalAverageContributor.findFirst({ where: { id: contributorId, eventId } }),
    );
    if (!c) throw new NotFoundException('Cargo interest not found on this event');
    return c;
  }
}

const round2 = (n: number): number => Money.round(n);
