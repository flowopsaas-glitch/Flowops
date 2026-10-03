import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import {
  RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, recordRailAudit,
} from './rail-audit';
import { InvoiceDraftDto, TariffRequestDto } from './dto/rail-tariff.dto';
import { ANCILLARY_SERVICE_CATALOG } from './catalog/ancillary-services.catalog';
import { CORRIDOR_CATALOG } from './catalog/corridors.catalog';
import { CorridorIdentity, resolveCorridor } from './rail-reference';
import {
  AncillaryLike, RAIL_TARIFF_CONSTANTS, ReadingLike, ScheduleLike, TARIFF_CONSTANT_SOURCE, TARIFF_FORMULA_VERSION, TariffLine, TariffRequest, calculateTariff, financialYearOf,
  latestReadingPerWagon,
} from './rail-tariff.rules';

/** An Annexure 40 line as the API returns it. */
export interface AncillaryView extends AncillaryLike {
  serviceNumber: number; tier: number; tierName: string; group: string; isCompulsory: boolean; description: string | null; section: string | null; sourceLabel: string | null;
  rateSourceRef: string | null; fromCatalog: boolean;
}

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Tariff calculation (RAIL-013): infrastructure (GTK) charge + traction energy + Annexure 40 ancillary services + the
 * weighbridge overload penalty, and a one-click, idempotent invoice DRAFT.
 *
 * Every number that decides a price is derived here from stored data and the pure rules in `rail-tariff.rules.ts`; the
 * client supplies only quantities it knows (distance, litres, kWh, ancillary quantities). A corridor with no VERIFIED loaded
 * rate is refused — the response says so and nothing is saved. A line with no loaded rate is saved UNPRICED, and a
 * calculation that has one can never become an invoice draft.
 */
@Injectable()
export class RailTariffService {
  private readonly logger = new Logger(RailTariffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException('Rail & Intermodal is an Enterprise feature. Upgrade your plan to calculate rail tariffs.');
    }
  }

  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }

  // ── reference ──────────────────────────────────────────────────────────────

  private async corridors(): Promise<CorridorIdentity[]> {
    const rows = await this.prisma.railCorridorNode.findMany({ where: { isActive: true } });
    const source: readonly CorridorIdentity[] = rows.length ? rows : CORRIDOR_CATALOG;
    return source.map((c) => ({ code: c.code, name: c.name, aliases: c.aliases ?? [], workbookRoutes: c.workbookRoutes ?? [] }));
  }

  /** Seeded rows win; before the seeder has run, the code catalog (the seed's own source) is served. */
  private async ancillaryRows(): Promise<AncillaryView[]> {
    const rows = await this.prisma.railAncillaryServiceCatalog.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    if (rows.length) {
      return rows.map((r) => ({
        code: r.code, name: r.name, serviceName: r.serviceName, unitOfMeasure: r.unitOfMeasure, priceStatus: r.priceStatus, unitRateZar: r.unitRateZar, serviceNumber: r.serviceNumber,
        tier: r.tier, tierName: r.tierName, group: r.serviceGroup, isCompulsory: r.isCompulsory, description: r.description, section: r.section, sourceLabel: r.sourceLabel,
        rateSourceRef: r.rateSourceRef, fromCatalog: false,
      }));
    }
    return ANCILLARY_SERVICE_CATALOG.map((a) => ({
      code: a.code, name: a.name, serviceName: a.serviceName, unitOfMeasure: a.unitOfMeasure, priceStatus: a.priceStatus, unitRateZar: a.unitRateZar ?? null, serviceNumber: a.serviceNumber,
      tier: a.tier, tierName: a.tierName, group: a.group, isCompulsory: a.isCompulsory, description: a.description ?? null, section: a.section ?? null, sourceLabel: a.sourceLabel ?? null,
      rateSourceRef: a.rateSourceRef ?? null, fromCatalog: true,
    }));
  }

  async listAncillary(companyId: string): Promise<AncillaryView[]> {
    await this.assertEntitled(companyId);
    return this.ancillaryRows();
  }

  /** What can and cannot be priced today, per corridor. The honest answer is "nothing" until rates are loaded. */
  async status(companyId: string) {
    await this.assertEntitled(companyId);
    const [corridors, schedules, ancillary] = await Promise.all([
      this.corridors(),
      this.prisma.railTariffSchedule.findMany({ where: { isActive: true }, orderBy: { financialYear: 'asc' } }),
      this.ancillaryRows(),
    ]);
    const rows = corridors.map((c) => {
      const mine = schedules.filter((s) => s.corridorCode === c.code);
      return {
        code: c.code, name: c.name,
        years: mine.map((s) => ({ financialYear: s.financialYear, hasLoadedRate: isPos(s.loadedCentsPerGtk), hasEmptyRate: isPos(s.emptyCentsPerGtk), dataStatus: s.dataStatus })),
        hasVerifiedLoadedRate: mine.some((s) => s.dataStatus === 'VERIFIED' && isPos(s.loadedCentsPerGtk)),
      };
    });
    const withRate = rows.filter((r) => r.hasVerifiedLoadedRate).length;
    return {
      constants: { ...RAIL_TARIFF_CONSTANTS, source: TARIFF_CONSTANT_SOURCE },
      corridors: rows,
      summary: {
        corridors: rows.length, withVerifiedRate: withRate,
        ancillaryLines: ancillary.length, ancillaryPublished: ancillary.filter((a) => a.priceStatus === 'PUBLISHED').length,
        ancillaryTbd: ancillary.filter((a) => a.priceStatus === 'TBD').length, ancillaryNotPublished: ancillary.filter((a) => a.priceStatus === 'NOT_PUBLISHED').length,
      },
      fromCatalogFallback: ancillary.some((a) => a.fromCatalog),
      message: withRate === 0
        ? 'No corridor has a VERIFIED c/GTK rate loaded. The tariff tables were not supplied, so every calculation is refused rather than priced with an invented rate.'
        : `${withRate} of ${rows.length} corridors have a VERIFIED loaded rate; the others cannot be priced.`,
    };
  }

  // ── calculation ────────────────────────────────────────────────────────────

  /** Gathers the stored facts and runs the pure calculator. Writes nothing. */
  private async build(companyId: string, dto: TariffRequestDto) {
    // 404, not 403: another tenant's consignment is invisible.
    const consignment = await this.prisma.railConsignment.findFirst({ where: { id: dto.consignmentId, companyId }, include: { wagons: true } });
    if (!consignment) throw new NotFoundException('Rail consignment not found');

    let financialYear = dto.financialYear?.trim() ?? '';
    if (!financialYear) {
      if (!consignment.plannedDeparture) throw new BadRequestException('financialYear is required: the consignment has no planned departure to take it from.');
      financialYear = financialYearOf(consignment.plannedDeparture);
    }

    const corridor = resolveCorridor(await this.corridors(), consignment.corridor);
    const readings = await this.prisma.railWeighbridgeReading.findMany({ where: { companyId, consignmentId: consignment.id }, orderBy: { createdAt: 'asc' } });
    const latest = latestReadingPerWagon(readings as unknown as (ReadingLike & { wagonNumber: string; actualTonnes: number })[]);
    const latestStatus = new Map(latest.map((r) => [r.wagonNumber, r.status]));
    // A wagon that was overloaded EARLIER but whose latest reading is not: surfaced for a decision, never silently charged or dropped.
    const corrected = new Map<string, number>();
    for (const r of readings) {
      if (r.status === 'OVERLOADED' && latestStatus.get(r.wagonNumber) !== 'OVERLOADED') corrected.set(r.wagonNumber, r.excessTonnes ?? 0);
    }

    const schedules = corridor
      ? await this.prisma.railTariffSchedule.findMany({ where: { corridorCode: corridor.code, isActive: true } })
      : [];
    const requestedAncillary = (dto.ancillary ?? []).map((a) => ({ code: a.code, quantity: a.quantity }));
    const ancillaryCatalog = requestedAncillary.length ? await this.ancillaryRows() : [];

    const request: TariffRequest = {
      corridorCode: corridor?.code ?? null, financialYear, distanceKm: dto.distanceKm, includeEmptyReturn: !!dto.includeEmptyReturn, allowEscalation: !!dto.allowEscalation,
      traction: dto.traction ? { type: dto.traction.type, litres: dto.traction.litres ?? null, kWh: dto.traction.kWh ?? null, pricePerUnitZar: dto.traction.pricePerUnitZar ?? null } : null,
      ancillary: requestedAncillary,
    };
    const result = calculateTariff(request, {
      wagons: consignment.wagons.map((w) => ({ wagonNumber: w.wagonNumber, tareTonnes: w.tareTonnes, loadedTonnes: w.loadedTonnes })),
      latestReadings: latest,
      correctedOverloads: Array.from(corrected, ([wagonNumber, excessTonnes]) => ({ wagonNumber, excessTonnes })),
      schedules: schedules as unknown as ScheduleLike[],
      ancillaryCatalog,
    });
    return { consignment, corridor, financialYear, request, result };
  }

  private describe(b: Awaited<ReturnType<RailTariffService['build']>>) {
    const { consignment, corridor, financialYear, result } = b;
    return {
      consignment: { id: consignment.id, consignmentNumber: consignment.consignmentNumber, corridor: consignment.corridor, clientName: consignment.clientName ?? null, wagons: consignment.wagons.length },
      corridor: corridor ? { code: corridor.code, name: corridor.name } : null,
      financialYear, result, constants: { ...RAIL_TARIFF_CONSTANTS, source: TARIFF_CONSTANT_SOURCE },
    };
  }

  /** Nothing is saved. Any status — including BLOCKED, with the reasons — is returned. */
  async preview(companyId: string, dto: TariffRequestDto) {
    await this.assertEntitled(companyId);
    return this.describe(await this.build(companyId, dto));
  }

  private async nextNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.railTariffCalculation.count({ where: { companyId, createdAt: { gte: new Date(year, 0, 1) } } });
    return `TC-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  /** Saves a PRICED or INCOMPLETE calculation. A BLOCKED one has no numbers worth keeping and is refused. */
  async calculate(companyId: string, dto: TariffRequestDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const built = await this.build(companyId, dto);
    const { consignment, corridor, financialYear, request, result } = built;
    if (result.status === 'BLOCKED') {
      throw new BadRequestException(`This consignment cannot be priced: ${result.blockers.join(' ')}`);
    }

    const inputs = {
      formulaVersion: TARIFF_FORMULA_VERSION, distanceKm: request.distanceKm, includeEmptyReturn: !!request.includeEmptyReturn, allowEscalation: !!request.allowEscalation, traction: request.traction ?? null,
      ancillary: request.ancillary ?? [], corridorText: consignment.corridor ?? null, scheduleFinancialYear: result.scheduleFinancialYear, escalationYears: result.escalationYears,
      weightSources: result.weightSources, constants: RAIL_TARIFF_CONSTANTS, constantsSource: TARIFF_CONSTANT_SOURCE,
    };
    let created: Awaited<ReturnType<typeof this.prisma.railTariffCalculation.create>> | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const calculationNumber = await this.nextNumber(companyId);
      try {
        created = await this.prisma.railTariffCalculation.create({
          data: {
            companyId, calculationNumber, consignmentId: consignment.id, consignmentNumber: consignment.consignmentNumber, corridorCode: corridor!.code, financialYear,
            scheduleId: result.scheduleId, status: result.status, inputs: inputs as unknown as Prisma.InputJsonValue, lines: result.lines as unknown as Prisma.InputJsonValue,
            blockers: result.blockers as unknown as Prisma.InputJsonValue, warnings: result.warnings as unknown as Prisma.InputJsonValue,
            gtkLoaded: result.gtkLoaded, gtkEmpty: result.gtkEmpty, subtotalZar: result.subtotalZar, currency: result.currency, holdTriggered: result.hold.held,
            createdById: actor.id, createdByEmail: actor.email,
          },
        });
      } catch (err: any) {
        if (err?.code !== 'P2002' || attempt === 2) throw err;
      }
    }
    const calc = created as NonNullable<typeof created>;
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.TARIFF_CALCULATED, { type: RAIL_AUDIT_TARGET.TARIFF_CALCULATION, id: calc.id, name: calc.calculationNumber }, {
      consignmentId: consignment.id, consignmentNumber: consignment.consignmentNumber, corridorCode: corridor!.code, financialYear, status: result.status,
      subtotalZar: result.subtotalZar, lines: result.lines.length, unpricedLines: result.blockers.length, escalationYears: result.escalationYears, holdTriggered: result.hold.held,
      formulaVersion: TARIFF_FORMULA_VERSION, scheduleId: result.scheduleId,
    });
    return { calculation: calc, ...this.describe(built) };
  }

  async list(companyId: string, filters: { consignmentId?: string } = {}) {
    await this.assertEntitled(companyId);
    const where: Prisma.RailTariffCalculationWhereInput = { companyId };
    if (filters.consignmentId) where.consignmentId = filters.consignmentId;
    return this.prisma.railTariffCalculation.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async get(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    const row = await this.prisma.railTariffCalculation.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Tariff calculation not found');
    return row;
  }

  // ── invoice draft ──────────────────────────────────────────────────────────

  private lineDescription(l: TariffLine): string {
    const text = `${l.description}: ${l.basis}`;
    return text.length > 480 ? `${text.slice(0, 477)}…` : text;
  }

  /**
   * One click, one draft. The idempotency key is the draft's PRIMARY KEY: its id is derived from the calculation
   * (`rail-draft-<calculationId>`), so a second create — a double-click, or a retry after a crash — fails atomically with a
   * unique violation, and the loser simply reads back the winner's committed draft. The calculation record then points at
   * it (`invoiceDraftId`), which is also what a later call checks first. No second draft can ever exist.
   *
   * `draftData` is exactly what `InvoicesService.finalizeDraft` hands to `create()`: only `clientName`, `notes` and `items`
   * (create() spreads every other key into a Prisma call, so a stray key would break finalisation). Each charge is ONE
   * lump-sum line (quantity 1, unitPrice = the exact amount): `InvoiceItem.quantity` is an Int and `Money.multiply` rounds
   * the unit price to cents, so a per-GTK price could not be carried exactly. No tax rate is set — finalisation applies the
   * platform's default; the rail module does not decide VAT.
   */
  async generateInvoiceDraft(companyId: string, id: string, dto: InvoiceDraftDto, actor: RailActor, now = new Date()) {
    await this.assertEntitled(companyId);
    const calc = await this.prisma.railTariffCalculation.findFirst({ where: { id, companyId } });
    if (!calc) throw new NotFoundException('Tariff calculation not found');

    const existingDraft = (draftId: string) => this.prisma.invoiceDraft.findFirst({ where: { id: draftId, companyId } });
    if (calc.invoiceDraftId) return { created: false, draft: await existingDraft(calc.invoiceDraftId) };

    const lines = (calc.lines as unknown as TariffLine[]) ?? [];
    if (calc.status !== 'PRICED' || lines.some((l) => l.amountZar === null)) {
      throw new BadRequestException(`${calc.calculationNumber} still has unpriced lines (${(calc.blockers as unknown as string[]).length}), so it cannot become an invoice draft. Load the missing rates and calculate again.`);
    }
    const consignment = await this.prisma.railConsignment.findFirst({ where: { id: calc.consignmentId, companyId }, select: { clientName: true } });
    const clientName = dto.clientName?.trim() || consignment?.clientName?.trim();
    if (!clientName) throw new BadRequestException('A client name is required for an invoice: set it on the consignment, or pass clientName.');

    const draftId = `rail-draft-${calc.id}`;
    let draft;
    let created = false;
    try {
      draft = await this.prisma.invoiceDraft.create({
        data: {
          id: draftId, companyId, title: `Rail charges ${calc.consignmentNumber} (${calc.calculationNumber})`,
          draftData: {
            clientName,
            notes: `Rail charges — consignment ${calc.consignmentNumber}, corridor ${calc.corridorCode}, financial year ${calc.financialYear} (calculation ${calc.calculationNumber}).`,
            items: lines.map((l) => ({ description: this.lineDescription(l), quantity: 1, unitPrice: l.amountZar })),
          } as unknown as Prisma.InputJsonValue,
          aiAnalysis: {
            source: 'RAIL_TARIFF', calculationId: calc.id, calculationNumber: calc.calculationNumber, consignmentId: calc.consignmentId, lineCount: lines.length,
            warnings: calc.warnings, subtotalZar: calc.subtotalZar,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      created = true;
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      // Somebody else created it first (a double-click, or an earlier attempt that never got to link it): read it back.
      draft = await existingDraft(draftId);
      if (!draft) throw err;
    }
    // Link the calculation to the draft (only if nobody has yet).
    await this.prisma.railTariffCalculation.updateMany({ where: { id, companyId, invoiceDraftId: null }, data: { invoiceDraftId: draft.id, invoiceDraftedAt: now } });
    if (created) {
      await this.record(companyId, actor, RAIL_AUDIT_ACTION.TARIFF_INVOICE_DRAFT_CREATED, { type: RAIL_AUDIT_TARGET.TARIFF_CALCULATION, id: calc.id, name: calc.calculationNumber }, {
        invoiceDraftId: draft.id, consignmentNumber: calc.consignmentNumber, subtotalZar: calc.subtotalZar, lines: lines.length,
      });
    }
    return { created, draft };
  }
}
