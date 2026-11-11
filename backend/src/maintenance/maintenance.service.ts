import { Money } from '../common/money.util';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { MaintenanceJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assetWarrantyStanding,
  availability,
  checkCommercialUpdate,
  commercialAnomalies,
  commercialChain,
  canTransition,
  checkMeterReading,
  checkWarrantyTerm,
  costAmount,
  downtimeMinutes,
  faultPattern,
  findComeback,
  humanStatus,
  isPlannedWork,
  isWarrantyComeback,
  maintenanceVerdict,
  nextJobNumber,
  overlapMinutes,
  summariseCosts,
  toHours,
  transitionRefusal,
  warrantyExpiry,
  warrantyPosition,
  WORKED_JOB_STATUSES,
} from './maintenance.rules';
import type {
  AddJobCostDto,
  AddJobNoteDto,
  AssetHistoryQuery,
  CancelJobDto,
  CompleteJobDto,
  CreateAssetDto,
  CreateFaultCodeDto,
  CreateJobDto,
  ListAssetsQuery,
  ListJobsQuery,
  MaintenanceSummaryQuery,
  RecordMeterDto,
  SignOffJobDto,
  UpdateCommercialDto,
  StartJobDto,
  UpdateAssetDto,
} from './dto/maintenance.dto';

/** The authenticated tenant user, as the guards leave it on the request. */
export interface MaintenanceActor {
  id?: string;
  name?: string | null;
}

const MAX_NUMBER_ATTEMPTS = 5;
/** A card cannot be stamped in the future by more than clock skew. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Asset maintenance, job cards and warranty.
 *
 * The service exists to make four things impossible:
 *
 *  1. **A job card without a unit.** Every card hangs off a registered asset,
 *     so "we fixed something" always names what was fixed.
 *  2. **A warranty that turns into a liability by accident.** The term is
 *     validated at completion, `lifetime` is refused, and an unrecorded term
 *     reads as UNKNOWN rather than as "out of warranty".
 *  3. **Downtime that can be typed.** It is computed from the card's own
 *     timestamps, so the person who benefits from a flattering number cannot
 *     enter it.
 *  4. **A comeback that nobody notices.** Same unit, same fault code, inside
 *     the earlier job's warranty → the second card is linked to the first, and
 *     the link is visible on both.
 *
 * Reads and writes are scoped by `companyId` from the JWT throughout: an id
 * from another tenant is a 404, never an empty result, so ids cannot be probed.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Assets ───────────────────────────────────────────────────────────────

  /**
   * Unit numbers are stored uppercase.
   *
   * `RS-014` and `rs-014` are the same stacker to everybody except a database.
   * Two rows for one machine is the failure that makes a maintenance history
   * worthless, so the code carries a single canonical form and the unique index
   * is on that form.
   */
  private static canonicalAssetCode(code: string): string {
    return code.trim().toUpperCase();
  }

  async createAsset(companyId: string, actor: MaintenanceActor, dto: CreateAssetDto) {
    const assetCode = MaintenanceService.canonicalAssetCode(dto.assetCode);
    if (!assetCode) {
      throw new BadRequestException('A unit number is required.');
    }

    const existing = await this.prisma.maintenanceAsset.findFirst({
      where: { companyId, assetCode },
      select: { id: true, assetCode: true },
    });
    if (existing) {
      throw new ConflictException(
        `Unit ${assetCode} is already on the register. If this is a different machine, give it a distinct unit number.`,
      );
    }

    const openingReading =
      typeof dto.meterReading === 'number' && Number.isFinite(dto.meterReading) ? dto.meterReading : null;

    const asset = await this.prisma.maintenanceAsset.create({
      data: {
        companyId,
        assetCode,
        name: dto.name?.trim() || null,
        assetClass: dto.assetClass,
        make: dto.make?.trim() || null,
        model: dto.model?.trim() || null,
        serialNumber: dto.serialNumber?.trim() || null,
        custodian: dto.custodian?.trim() || null,
        site: dto.site?.trim() || null,
        meterType: dto.meterType ?? 'HOURS',
        meterReading: openingReading ?? 0,
        meterReadAt: openingReading !== null ? new Date() : null,
        commissionedAt: dto.commissionedAt ? new Date(dto.commissionedAt) : null,
        warrantySupplier: dto.warrantySupplier?.trim() || null,
        warrantyStartAt: dto.warrantyStartAt ? new Date(dto.warrantyStartAt) : null,
        warrantyTermDays: dto.warrantyTermDays ?? null,
        warrantyServiceIntervalDays: dto.warrantyServiceIntervalDays ?? null,
        notes: dto.notes?.trim() || null,
      },
    });

    if (openingReading !== null) {
      await this.prisma.maintenanceMeterReading.create({
        data: {
          companyId,
          assetId: asset.id,
          reading: openingReading,
          source: 'MANUAL',
          recordedByName: actor.name ?? null,
        },
      });
    }

    return asset;
  }

  async listAssets(companyId: string, query: ListAssetsQuery = {}) {
    const where: Prisma.MaintenanceAssetWhereInput = { companyId };
    if (query.status) where.status = query.status;
    if (query.assetClass) where.assetClass = query.assetClass;
    if (query.site) where.site = { contains: query.site, mode: 'insensitive' };
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { assetCode: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { custodian: { contains: q, mode: 'insensitive' } },
      ];
    }

    const assets = await this.prisma.maintenanceAsset.findMany({
      where,
      orderBy: { assetCode: 'asc' },
      take: Math.min(Number(query.take) || 200, 500),
      include: {
        jobs: {
          where: { status: { in: ['REPORTED', 'IN_PROGRESS'] } },
          orderBy: { reportedAt: 'desc' },
          take: 1,
          select: { id: true, jobNumber: true, status: true, type: true, reportedAt: true },
        },
      },
    });

    const serviced = await this.lastServiceByAsset(
      companyId,
      assets.map((asset) => asset.id),
    );

    return assets.map((asset) => ({
      ...asset,
      openJob: asset.jobs?.[0] ?? null,
      warranty: assetWarrantyStanding(
        {
          warrantyStartAt: asset.warrantyStartAt,
          warrantyTermDays: asset.warrantyTermDays,
          warrantyServiceIntervalDays: asset.warrantyServiceIntervalDays,
          lastServiceAt: serviced.get(asset.id) ?? null,
        },
        new Date(),
      ),
      jobs: undefined,
    }));
  }

  async getAsset(companyId: string, id: string) {
    const asset = await this.prisma.maintenanceAsset.findFirst({
      where: { id, companyId },
      include: {
        meterReadings: { orderBy: { readAt: 'desc' }, take: 20 },
        jobs: {
          orderBy: { reportedAt: 'desc' },
          take: 50,
          include: { faultCode: { select: { id: true, code: true, label: true } } },
        },
      },
    });
    if (!asset) throw new NotFoundException('Asset not found.');

    const openJob = asset.jobs.find((job) => job.status === 'REPORTED' || job.status === 'IN_PROGRESS') ?? null;
    const lastCompleted = asset.jobs.find((job) => WORKED_JOB_STATUSES.includes(job.status)) ?? null;
    const lastService = asset.jobs.find(
      (job) => WORKED_JOB_STATUSES.includes(job.status) && isPlannedWork(job.type),
    );

    return {
      ...asset,
      openJob,
      warranty: assetWarrantyStanding(
        {
          warrantyStartAt: asset.warrantyStartAt,
          warrantyTermDays: asset.warrantyTermDays,
          warrantyServiceIntervalDays: asset.warrantyServiceIntervalDays,
          lastServiceAt: lastService?.completedAt ?? null,
        },
        new Date(),
      ),
      lastJobWarranty: lastCompleted
        ? {
            jobId: lastCompleted.id,
            jobNumber: lastCompleted.jobNumber,
            position: warrantyPosition(lastCompleted),
            expiresAt: lastCompleted.warrantyExpiresAt,
            termDays: lastCompleted.warrantyTermDays,
          }
        : null,
    };
  }

  async updateAsset(companyId: string, actor: MaintenanceActor, id: string, dto: UpdateAssetDto) {
    const asset = await this.prisma.maintenanceAsset.findFirst({ where: { id, companyId } });
    if (!asset) throw new NotFoundException('Asset not found.');

    const data: Prisma.MaintenanceAssetUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim() || null;
    if (dto.custodian !== undefined) data.custodian = dto.custodian.trim() || null;
    if (dto.site !== undefined) data.site = dto.site.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;

    // Warranty terms can be corrected and can be withdrawn, because both happen:
    // a term written on the wrong unit, and a term the supplier never gave. Null
    // clears — which is the honest correction, and is not the same as zero days.
    if (dto.warrantySupplier !== undefined) data.warrantySupplier = dto.warrantySupplier?.trim() || null;
    if (dto.warrantyStartAt !== undefined) {
      data.warrantyStartAt = dto.warrantyStartAt ? new Date(dto.warrantyStartAt) : null;
    }
    if (dto.warrantyTermDays !== undefined) data.warrantyTermDays = dto.warrantyTermDays ?? null;
    if (dto.warrantyServiceIntervalDays !== undefined) {
      data.warrantyServiceIntervalDays = dto.warrantyServiceIntervalDays ?? null;
    }

    if (dto.assetCode !== undefined) {
      const nextCode = MaintenanceService.canonicalAssetCode(dto.assetCode);
      if (nextCode !== asset.assetCode) {
        // Renaming a unit that already has history would break the one thing
        // that makes the history useful: that RS-014 today is the RS-014 the
        // workshop wrote about last year.
        const jobCount = await this.prisma.maintenanceJob.count({ where: { companyId, assetId: id } });
        if (jobCount > 0) {
          throw new ConflictException(
            `Unit ${asset.assetCode} already has ${jobCount} job ${jobCount === 1 ? 'card' : 'cards'}. Its unit number cannot change without breaking that history — raise a new unit instead if this is a different machine.`,
          );
        }
        const clash = await this.prisma.maintenanceAsset.findFirst({
          where: { companyId, assetCode: nextCode, id: { not: id } },
          select: { id: true },
        });
        if (clash) throw new ConflictException(`Unit ${nextCode} is already on the register.`);
        data.assetCode = nextCode;
      }
    }

    if (dto.status !== undefined) {
      data.status = dto.status;
      // Retirement is a one-way stamp: it dates the decision, and the fleet
      // report excludes retired units rather than counting them as available.
      if (dto.status === 'RETIRED' && !asset.retiredAt) data.retiredAt = new Date();
      if (dto.status !== 'RETIRED') data.retiredAt = null;
    }

    const updated = await this.prisma.maintenanceAsset.update({ where: { id }, data });
    this.logger.log(`asset ${updated.assetCode} updated by ${actor.name ?? actor.id ?? 'unknown'}`);
    return updated;
  }

  async recordMeter(companyId: string, actor: MaintenanceActor, assetId: string, dto: RecordMeterDto) {
    const asset = await this.prisma.maintenanceAsset.findFirst({ where: { id: assetId, companyId } });
    if (!asset) throw new NotFoundException('Asset not found.');

    const check = checkMeterReading(dto.reading, asset.meterReading);
    if (!check.ok) throw new BadRequestException(check.reason);

    await this.prisma.maintenanceMeterReading.create({
      data: {
        companyId,
        assetId,
        reading: dto.reading,
        source: dto.source ?? 'MANUAL',
        recordedByName: dto.recordedByName ?? actor.name ?? null,
      },
    });

    return this.prisma.maintenanceAsset.update({
      where: { id: assetId },
      data: { meterReading: dto.reading, meterReadAt: new Date() },
    });
  }

  // ── Fault codes ──────────────────────────────────────────────────────────

  async listFaultCodes(companyId: string, includeInactive = false) {
    return this.prisma.maintenanceFaultCode.findMany({
      where: { companyId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { code: 'asc' },
    });
  }

  async createFaultCode(companyId: string, dto: CreateFaultCodeDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.maintenanceFaultCode.findFirst({
      where: { companyId, code },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`Fault code ${code} already exists.`);

    return this.prisma.maintenanceFaultCode.create({
      data: {
        companyId,
        code,
        label: dto.label.trim(),
        guidance: dto.guidance?.trim() || null,
      },
    });
  }

  // ── Job cards ────────────────────────────────────────────────────────────

  /**
   * Raise a card.
   *
   * The order of operations matters: the idempotency key is honoured before any
   * validation, because the caller repeating a request after a timeout must get
   * the original card back even if the asset has since changed.
   */
  async createJob(companyId: string, actor: MaintenanceActor, dto: CreateJobDto) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.maintenanceJob.findFirst({
        where: { companyId, idempotencyKey: dto.idempotencyKey },
        include: { asset: { select: { id: true, assetCode: true, name: true } } },
      });
      if (existing) return existing;
    }

    const asset = await this.prisma.maintenanceAsset.findFirst({
      where: { id: dto.assetId, companyId },
      select: { id: true, assetCode: true, name: true, meterReading: true, status: true, meterReadAt: true },
    });
    if (!asset) throw new NotFoundException('Asset not found.');
    if (asset.status === 'RETIRED') {
      throw new BadRequestException(
        `Unit ${asset.assetCode} is retired. Register the replacement unit and raise the card against that one, so the costs land on something still in service.`,
      );
    }

    const reportedAt = dto.reportedAt ? new Date(dto.reportedAt) : new Date();
    this.assertNotFuture(reportedAt, 'Reported at');

    if (dto.faultCodeId) {
      const code = await this.prisma.maintenanceFaultCode.findFirst({
        where: { id: dto.faultCodeId, companyId },
        select: { id: true },
      });
      if (!code) throw new NotFoundException('Fault code not found.');
    }

    const priorJob = await this.resolvePriorJob(companyId, {
      assetId: asset.id,
      faultCodeId: dto.faultCodeId ?? null,
      reportedAt,
      explicitPriorJobId: dto.priorJobId ?? null,
    });

    const job = await this.createWithNextNumber(companyId, (jobNumber) => ({
      companyId,
      assetId: asset.id,
      jobNumber,
      idempotencyKey: dto.idempotencyKey ?? null,
      type: dto.type,
      status: 'REPORTED' as MaintenanceJobStatus,
      reportedAt,
      reportedByName: dto.reportedByName?.trim() || actor.name || null,
      faultCodeId: dto.faultCodeId ?? null,
      faultDescription: dto.faultDescription.trim(),
      meterAtJob: typeof dto.meterAtJob === 'number' ? dto.meterAtJob : null,
      priorJobId: priorJob?.id ?? null,
    }));

    await this.appendEvent(companyId, job.id, {
      type: 'CREATED',
      toStatus: 'REPORTED',
      actor,
      description: `${dto.type === 'BREAKDOWN' ? 'Breakdown' : dto.type === 'PLANNED' ? 'Planned job' : dto.type === 'INSPECTION' ? 'Inspection' : 'Recall'} raised on ${asset.assetCode}.`,
    });

    if (priorJob) {
      const inWarranty = isWarrantyComeback(priorJob, reportedAt);
      await this.appendEvent(companyId, job.id, {
        type: 'COMEBACK_LINKED',
        actor,
        description: inWarranty
          ? `Same fault as ${priorJob.jobNumber}, which is still inside the warranty it carried.`
          : `Same fault as ${priorJob.jobNumber}. That job's warranty has expired or was never recorded.`,
        metadata: { priorJobId: priorJob.id, priorJobNumber: priorJob.jobNumber, inWarranty },
      });
    }

    // A card-reported reading may be older than the last accepted one — a card
    // written up days later is normal — so the card keeps its number and the
    // unit's meter only ever moves forward.
    if (typeof dto.meterAtJob === 'number' && dto.meterAtJob > asset.meterReading) {
      await this.advanceMeter(companyId, asset.id, dto.meterAtJob, 'JOB', job.id, actor);
    }

    return this.withAsset(job.id, companyId);
  }

  async listJobs(companyId: string, query: ListJobsQuery = {}) {
    const where: Prisma.MaintenanceJobWhereInput = { companyId };
    if (query.assetId) where.assetId = query.assetId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.since) where.reportedAt = { gte: new Date(query.since) };
    if (query.comebacksOnly) where.priorJobId = { not: null };

    return this.prisma.maintenanceJob.findMany({
      where,
      orderBy: { reportedAt: 'desc' },
      take: Math.min(Number(query.take) || 200, 500),
      include: {
        asset: { select: { id: true, assetCode: true, name: true, assetClass: true } },
        faultCode: { select: { id: true, code: true, label: true } },
        costs: { select: { amount: true, kind: true } },
      },
    });
  }

  async getJob(companyId: string, id: string) {
    const job = await this.prisma.maintenanceJob.findFirst({
      where: { id, companyId },
      include: {
        asset: { select: { id: true, assetCode: true, name: true, assetClass: true, custodian: true, status: true } },
        faultCode: { select: { id: true, code: true, label: true, guidance: true } },
        costs: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        priorJob: { select: { id: true, jobNumber: true, completedAt: true, warrantyExpiresAt: true, warrantyTermDays: true, status: true } },
        comebacks: { select: { id: true, jobNumber: true, reportedAt: true, status: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found.');

    const costSummary = summariseCosts(job.costs ?? []);

    return {
      ...job,
      warranty: {
        position: warrantyPosition(job),
        expiresAt: job.warrantyExpiresAt,
        termDays: job.warrantyTermDays,
      },
      /** Quoted, authorised, worked, invoiced, paid — and where it is stuck. */
      commercial: commercialChain(job, costSummary.total, new Date()),
      /**
       * Dates that arrived out of order. Derived from what is stored rather
       * than remembered from the save, so the card still explains a blank
       * wait weeks later, on a refetch, to someone who was not there.
       */
      anomalies: commercialAnomalies(job),
      costSummary,
      isComeback: Boolean(job.priorJobId),
      downtimeHours: toHours(downtimeMinutes(job, new Date())),
    };
  }

  async startJob(companyId: string, actor: MaintenanceActor, id: string, dto: StartJobDto) {
    const job = await this.requireJob(companyId, id);
    this.assertTransition(job.status as MaintenanceJobStatus, 'IN_PROGRESS');

    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    this.assertNotFuture(startedAt, 'Started at');

    const updated = await this.prisma.maintenanceJob.update({
      where: { id },
      data: { status: 'IN_PROGRESS', startedAt },
    });
    await this.appendEvent(companyId, id, {
      type: 'STATUS_CHANGED',
      fromStatus: job.status as MaintenanceJobStatus,
      toStatus: 'IN_PROGRESS',
      actor,
      description: `Work started${dto.startedByName ? ` by ${dto.startedByName}` : ''}.`,
    });
    return updated;
  }

  /**
   * Complete a job — the moment the warranty clock starts.
   *
   * `completedAt` is stamped here when the caller does not supply one, and a
   * supplied one may not be in the future. That stops a term being back-dated
   * to cover a failure that has already happened.
   */
  async completeJob(companyId: string, actor: MaintenanceActor, id: string, dto: CompleteJobDto) {
    const job = await this.requireJob(companyId, id);
    this.assertTransition(job.status as MaintenanceJobStatus, 'COMPLETED');

    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    this.assertNotFuture(completedAt, 'Completed at');
    if (completedAt.getTime() < new Date(job.reportedAt).getTime()) {
      throw new BadRequestException('A job cannot be completed before it was reported.');
    }

    const term = checkWarrantyTerm(dto.warrantyTermDays);
    if (!term.ok) throw new BadRequestException(term.reason);

    const workPerformed = dto.workPerformed.trim();
    if (workPerformed.length < 3) {
      throw new BadRequestException('Record what was actually done — it is the sentence the next technician reads.');
    }

    const downtime = downtimeMinutes(
      { type: job.type, status: 'COMPLETED', reportedAt: job.reportedAt, completedAt },
      new Date(),
    );

    const updated = await this.prisma.maintenanceJob.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt,
        workPerformed,
        labourHours: typeof dto.labourHours === 'number' ? dto.labourHours : null,
        meterAtJob: typeof dto.meterAtJob === 'number' ? dto.meterAtJob : job.meterAtJob,
        providerName: dto.providerName?.trim() || job.providerName || null,
        invoiceRef: dto.invoiceRef?.trim() || job.invoiceRef || null,
        warrantyTermDays: term.days,
        warrantyExpiresAt: warrantyExpiry(completedAt, term.days),
        downtimeMinutes: downtime,
      },
    });

    await this.appendEvent(companyId, id, {
      type: 'STATUS_CHANGED',
      fromStatus: job.status as MaintenanceJobStatus,
      toStatus: 'COMPLETED',
      actor,
      description: 'Work completed and recorded.',
      metadata: { downtimeMinutes: downtime },
    });

    if (term.days !== null) {
      await this.appendEvent(companyId, id, {
        type: 'WARRANTY_SET',
        actor,
        description: `Warranty of ${term.days} days recorded, running to ${updated.warrantyExpiresAt?.toISOString().slice(0, 10)}.`,
        metadata: { termDays: term.days },
      });
    }

    if (typeof dto.meterAtJob === 'number') {
      await this.advanceMeterIfHigher(companyId, job.assetId, dto.meterAtJob, id, actor);
    }

    return this.getJob(companyId, id);
  }

  async signOffJob(companyId: string, actor: MaintenanceActor, id: string, dto: SignOffJobDto) {
    const job = await this.requireJob(companyId, id);
    this.assertTransition(job.status as MaintenanceJobStatus, 'SIGNED_OFF');

    const signedOffAt = dto.signedOffAt ? new Date(dto.signedOffAt) : new Date();
    this.assertNotFuture(signedOffAt, 'Signed off at');

    const updated = await this.prisma.maintenanceJob.update({
      where: { id },
      data: { status: 'SIGNED_OFF', signedOffBy: dto.signedOffBy.trim(), signedOffAt },
    });

    await this.appendEvent(companyId, id, {
      type: 'STATUS_CHANGED',
      fromStatus: job.status as MaintenanceJobStatus,
      toStatus: 'SIGNED_OFF',
      actor,
      description: `Signed off by ${dto.signedOffBy.trim()}.`,
    });
    return updated;
  }

  /**
   * Cancel a card.
   *
   * Cancelling is the correction path — there is no delete — so the reason is
   * mandatory and the timestamps stay. A cancelled job contributes no downtime
   * and carries no warranty.
   */
  async cancelJob(companyId: string, actor: MaintenanceActor, id: string, dto: CancelJobDto) {
    const job = await this.requireJob(companyId, id);
    this.assertTransition(job.status as MaintenanceJobStatus, 'CANCELLED');

    const reason = dto.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException('Say why this card is being cancelled — the next person to open it needs to know.');
    }

    const updated = await this.prisma.maintenanceJob.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledReason: reason,
        // The unit is not down because of a job that did not happen.
        downtimeMinutes: null,
      },
    });

    await this.appendEvent(companyId, id, {
      type: 'STATUS_CHANGED',
      fromStatus: job.status as MaintenanceJobStatus,
      toStatus: 'CANCELLED',
      actor,
      description: `Cancelled: ${reason}`,
    });
    return updated;
  }

  /**
   * Record where the money and the authority have got to.
   *
   * Six steps, each with the date it actually happened: quoted, authorised,
   * worked, invoiced, paid. The dates are the point. A card that records "five
   * days" without recording which of those days were spent waiting for a
   * purchase order cannot tell a slow workshop from a slow procurement
   * department, and both parties will assume it was the other one.
   *
   * Partial by design: a contractor arriving at the depot with a written
   * quotation records one thing and carries on. Fields not supplied are left
   * alone, so this cannot blank a date by omission.
   *
   * Money does **not** move the work status. Invoicing a completed card and
   * signing it off are different acts by different people, and letting one
   * imply the other would let an accounting entry accept work on the
   * custodian's behalf.
   */
  async recordCommercial(companyId: string, actor: MaintenanceActor, id: string, dto: UpdateCommercialDto) {
    const job = await this.requireJob(companyId, id);
    if (job.status === 'CANCELLED') {
      throw new BadRequestException(
        'This job was cancelled. Money and authority belong to work that happened — raise a new card instead.',
      );
    }

    const supplied = (value: unknown) => value !== undefined;

    const patch = {
      quotationAmount: supplied(dto.quotationAmount) ? dto.quotationAmount ?? null : undefined,
      quotationAt: supplied(dto.quotationAt) ? this.parseDate(dto.quotationAt, 'Quotation date') : undefined,
      purchaseOrderNumber: supplied(dto.purchaseOrderNumber) ? dto.purchaseOrderNumber ?? null : undefined,
      purchaseOrderAt: supplied(dto.purchaseOrderAt)
        ? this.parseDate(dto.purchaseOrderAt, 'Purchase order date')
        : undefined,
      invoicedAt: supplied(dto.invoicedAt) ? this.parseDate(dto.invoicedAt, 'Invoice date') : undefined,
      paidAt: supplied(dto.paidAt) ? this.parseDate(dto.paidAt, 'Payment date') : undefined,
    };

    const check = checkCommercialUpdate(
      {
        quotationAmount: job.quotationAmount,
        quotationAt: job.quotationAt,
        purchaseOrderNumber: job.purchaseOrderNumber,
        purchaseOrderAt: job.purchaseOrderAt,
        invoicedAt: job.invoicedAt,
        paidAt: job.paidAt,
        completedAt: job.completedAt,
      },
      patch,
    );
    if (!check.ok) throw new BadRequestException(check.reason);

    const data: Prisma.MaintenanceJobUpdateInput = {};
    if (supplied(dto.quotationAmount)) data.quotationAmount = dto.quotationAmount ?? null;
    if (supplied(dto.quotationAt)) data.quotationAt = patch.quotationAt ?? null;
    if (supplied(dto.purchaseOrderNumber)) data.purchaseOrderNumber = patch.purchaseOrderNumber ?? null;
    if (supplied(dto.purchaseOrderAt)) data.purchaseOrderAt = patch.purchaseOrderAt ?? null;
    if (supplied(dto.invoicedAt)) data.invoicedAt = patch.invoicedAt ?? null;
    if (supplied(dto.paidAt)) data.paidAt = patch.paidAt ?? null;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to record — supply a quotation, purchase order, invoice or payment.');
    }

    const updated = await this.prisma.maintenanceJob.update({ where: { id }, data });

    // One event per change, in the words a person would use. The trail is the
    // only defence a correction has: a re-quoted price and a quietly edited one
    // look identical in the row and completely different here.
    const changes: string[] = [];
    if (supplied(dto.quotationAmount)) {
      changes.push(`quotation ${dto.quotationAmount === null ? 'withdrawn' : `${(dto.quotationAmount as number).toFixed(2)} ${job.currency ?? 'ZAR'}`}`);
    }
    if (supplied(dto.quotationAt)) changes.push(`quoted ${patch.quotationAt ? this.day(patch.quotationAt) : '—'}`);
    if (supplied(dto.purchaseOrderNumber) || supplied(dto.purchaseOrderAt)) {
      changes.push(
        `purchase order ${patch.purchaseOrderNumber ?? '—'}${patch.purchaseOrderAt ? ` arrived ${this.day(patch.purchaseOrderAt)}` : ''}`,
      );
    }
    if (supplied(dto.invoicedAt)) changes.push(`invoiced ${patch.invoicedAt ? this.day(patch.invoicedAt) : '—'}`);
    if (supplied(dto.paidAt)) changes.push(`paid ${patch.paidAt ? this.day(patch.paidAt) : '—'}`);

    const cost = await this.jobCostTotal(companyId, id);
    const chain = commercialChain(updated, cost, new Date());

    await this.appendEvent(companyId, id, {
      type: 'COMMERCIAL_CHANGED',
      actor,
      description: `${changes.join('; ')}.`,
      metadata: {
        quotationAmount: updated.quotationAmount,
        purchaseOrderNumber: updated.purchaseOrderNumber,
        quoteToOrderHours: chain.quoteToOrderHours,
        // Out-of-order dates are accepted, so the record has to carry them.
        // A refusal would have left nothing behind; this leaves the reason
        // the waits are blank sitting next to the blank waits.
        anomalies: check.anomalies,
      },
    });

    return { ...updated, commercial: chain, anomalies: check.anomalies };
  }

  async addCost(companyId: string, actor: MaintenanceActor, jobId: string, dto: AddJobCostDto) {
    const job = await this.requireJob(companyId, jobId);
    if (job.status === 'CANCELLED') {
      throw new BadRequestException('This job was cancelled. Costs belong to work that happened.');
    }

    const quantity = typeof dto.quantity === 'number' ? dto.quantity : 1;
    if (quantity <= 0) throw new BadRequestException('Quantity must be greater than zero.');
    if (!Number.isFinite(dto.unitCost) || dto.unitCost < 0) {
      throw new BadRequestException('Unit cost must be zero or more.');
    }

    const amount = costAmount(quantity, dto.unitCost);
    const cost = await this.prisma.maintenanceJobCost.create({
      data: {
        companyId,
        jobId,
        kind: dto.kind,
        description: dto.description.trim(),
        quantity,
        unitCost: dto.unitCost,
        amount,
        currency: job.currency ?? 'ZAR',
      },
    });

    await this.appendEvent(companyId, jobId, {
      type: 'COST_ADDED',
      actor,
      description: `${dto.kind.toLowerCase().replace(/_/g, ' ')}: ${dto.description.trim()} — ${amount.toFixed(2)}.`,
      metadata: { costId: cost.id, amount, kind: dto.kind },
    });

    return cost;
  }

  async addNote(companyId: string, actor: MaintenanceActor, jobId: string, dto: AddJobNoteDto) {
    await this.requireJob(companyId, jobId);
    const note = dto.note.trim();
    if (!note) throw new BadRequestException('A note cannot be empty.');

    await this.appendEvent(companyId, jobId, {
      type: 'NOTE_ADDED',
      actor,
      description: note,
    });

    return this.getJob(companyId, jobId);
  }

  // ── The unit's page ──────────────────────────────────────────────────────

  /**
   * Everything about one unit, over a stated window.
   *
   * This is the artefact a contractor hands to a contract holder: job cards,
   * cost per hour, availability, and the faults that keep coming back — with
   * each figure carrying the basis it was computed from.
   */
  async assetHistory(companyId: string, assetId: string, query: AssetHistoryQuery = {}) {
    const windowDays = Math.min(Math.max(Number(query.windowDays) || 90, 1), 730);
    const asset = await this.prisma.maintenanceAsset.findFirst({
      where: { id: assetId, companyId },
    });
    if (!asset) throw new NotFoundException('Asset not found.');

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const jobs = await this.prisma.maintenanceJob.findMany({
      where: { companyId, assetId },
      orderBy: { reportedAt: 'desc' },
      take: 500,
      include: {
        faultCode: { select: { id: true, code: true, label: true } },
        costs: { select: { amount: true, kind: true } },
      },
    });

    const inWindow = jobs.filter((job) => new Date(job.reportedAt).getTime() >= windowStart.getTime());
    const comparable = inWindow.filter((job) => job.status !== 'CANCELLED');

    // Planned work and inspections are excluded here for the same reason the
    // verdict excludes them: a unit scheduled out for a service was not lost to
    // a breakdown, and counting the two together is how an availability figure
    // gets flattered.
    let downtime = 0;
    for (const job of comparable) {
      if (isPlannedWork(job.type)) continue;
      const end = job.completedAt ?? now;
      downtime += overlapMinutes(job.reportedAt, end, windowStart, now);
    }

    const basisMinutes = windowDays * 24 * 60;
    const availabilityFigure = availability(downtime, basisMinutes);

    const allCosts = comparable.flatMap((job) => job.costs ?? []);
    const costs = summariseCosts(allCosts);

    const pattern = faultPattern(
      comparable.map((job) => ({
        id: job.id,
        assetId: job.assetId,
        faultCodeId: job.faultCodeId,
        status: job.status,
        reportedAt: job.reportedAt,
        completedAt: job.completedAt,
        priorJobId: job.priorJobId,
        downtimeMinutes: job.downtimeMinutes,
      })),
    );

    const codeById = new Map(
      comparable
        .filter((job) => job.faultCode)
        .map((job) => [job.faultCodeId as string, job.faultCode as { id: string; code: string; label: string }]),
    );

    const lastCompleted = jobs.find((job) => WORKED_JOB_STATUSES.includes(job.status)) ?? null;
    const lastService = jobs.find(
      (job) => WORKED_JOB_STATUSES.includes(job.status) && isPlannedWork(job.type),
    );
    const comebacks = comparable.filter((job) => Boolean(job.priorJobId));

    // Cost per operating unit needs two meter readings across the window. When
    // the meter has not moved, this is null rather than infinite.
    const readings = await this.prisma.maintenanceMeterReading.findMany({
      where: { companyId, assetId, readAt: { gte: windowStart } },
      orderBy: { readAt: 'asc' },
      take: 200,
    });
    const meterStart = readings.length ? readings[0].reading : null;
    const meterEnd = readings.length ? readings[readings.length - 1].reading : null;

    return {
      asset,
      windowDays,
      windowStart,
      windowEnd: now,
      jobs,
      availability: {
        ...availabilityFigure,
        hours: toHours(availabilityFigure.downtimeMinutes),
      },
      costs,
      warranty: assetWarrantyStanding(
        {
          warrantyStartAt: asset.warrantyStartAt,
          warrantyTermDays: asset.warrantyTermDays,
          warrantyServiceIntervalDays: asset.warrantyServiceIntervalDays,
          lastServiceAt: lastService?.completedAt ?? null,
        },
        now,
      ),
      faultPattern: pattern.map((row) => ({
        ...row,
        faultCode: codeById.get(row.faultCodeId) ?? null,
        downtimeHours: toHours(row.totalDowntimeMinutes),
      })),
      comebacks: {
        count: comebacks.length,
        sharePercent: comparable.length
          ? Math.round((comebacks.length / comparable.length) * 1000) / 10
          : null,
      },
      meter: {
        type: asset.meterType,
        reading: asset.meterReading,
        readAt: asset.meterReadAt,
        start: meterStart,
        end: meterEnd,
        advanced: meterStart !== null && meterEnd !== null ? meterEnd - meterStart : null,
        costPerUnit: this.costPerUnit(costs.total, meterStart, meterEnd),
      },
      lastJobWarranty: lastCompleted
        ? {
            jobId: lastCompleted.id,
            jobNumber: lastCompleted.jobNumber,
            position: warrantyPosition(lastCompleted, now),
            expiresAt: lastCompleted.warrantyExpiresAt,
            termDays: lastCompleted.warrantyTermDays,
          }
        : null,
      openJob:
        jobs.find((job) => job.status === 'REPORTED' || job.status === 'IN_PROGRESS') ?? null,
    };
  }

  /**
   * When each unit was last serviced.
   *
   * One query for the whole page rather than one per row: a fleet list that
   * asks the database a question per unit is the reason maintenance screens get
   * slow exactly when the fleet is big enough to need them.
   *
   * Deliberately restricted to completed planned work and inspections — see
   * `keepsWarrantyAlive`. A breakdown is the machine failing, and a cancelled
   * card is work that never happened; neither keeps a supplier's term standing.
   */
  private async lastServiceByAsset(companyId: string, assetIds: string[]): Promise<Map<string, Date>> {
    const serviced = new Map<string, Date>();
    if (assetIds.length === 0) return serviced;

    const rows = await this.prisma.maintenanceJob.findMany({
      where: {
        companyId,
        assetId: { in: assetIds },
        status: { in: WORKED_JOB_STATUSES },
        type: { in: ['PLANNED', 'INSPECTION'] },
        completedAt: { not: null },
      },
      select: { assetId: true, completedAt: true },
      orderBy: { completedAt: 'desc' },
      // The newest few hundred services per fleet are enough to answer "when
      // was this last serviced", and a bounded read cannot be made slow by a
      // tenant that has been running for a decade.
      take: 2000,
    });

    for (const row of rows) {
      if (!row.completedAt) continue;
      const seen = serviced.get(row.assetId);
      if (!seen || row.completedAt.getTime() > seen.getTime()) serviced.set(row.assetId, row.completedAt);
    }
    return serviced;
  }

  /** A supplied date, validated once so every caller gets the same refusal. */
  private parseDate(value: string | null | undefined, label: string): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is not a valid date.`);
    this.assertNotFuture(date, label);
    return date;
  }

  /** ISO day, for event sentences. A timestamp in a sentence is noise. */
  private day(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private async jobCostTotal(companyId: string, jobId: string): Promise<number> {
    const costs = await this.prisma.maintenanceJobCost.findMany({
      where: { companyId, jobId },
      select: { amount: true, kind: true },
    });
    return summariseCosts(costs).total;
  }

  private costPerUnit(total: number, start: number | null, end: number | null): number | null {
    if (start === null || end === null) return null;
    const delta = end - start;
    if (!Number.isFinite(delta) || delta <= 0) return null;
    return Money.round(total / delta);
  }

  // ── The fleet verdict ────────────────────────────────────────────────────

  /**
   * One page, for the whole fleet: is it working, is the work holding, and what
   * is being spent that cannot be invoiced.
   */
  async summary(companyId: string, query: MaintenanceSummaryQuery = {}) {
    const windowDays = Math.min(Math.max(Number(query.windowDays) || 30, 1), 365);
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const [assets, jobs] = await Promise.all([
      this.prisma.maintenanceAsset.findMany({
        where: { companyId },
        select: {
          id: true,
          assetCode: true,
          name: true,
          status: true,
          assetClass: true,
          meterType: true,
          warrantyStartAt: true,
          warrantyTermDays: true,
          warrantyServiceIntervalDays: true,
        },
        orderBy: { assetCode: 'asc' },
        take: 1000,
      }),
      this.prisma.maintenanceJob.findMany({
        where: {
          companyId,
          OR: [{ reportedAt: { gte: windowStart } }, { status: { in: ['REPORTED', 'IN_PROGRESS'] } }],
        },
        select: {
          id: true,
          jobNumber: true,
          assetId: true,
          type: true,
          status: true,
          reportedAt: true,
          startedAt: true,
          completedAt: true,
          priorJobId: true,
          quotationAmount: true,
          quotationAt: true,
          purchaseOrderNumber: true,
          purchaseOrderAt: true,
          invoicedAt: true,
          paidAt: true,
          priorJob: {
            select: {
              status: true,
              completedAt: true,
              warrantyExpiresAt: true,
              warrantyTermDays: true,
            },
          },
          costs: { select: { amount: true } },
        },
        orderBy: { reportedAt: 'desc' },
        take: 5000,
      }),
    ]);

    const serviced = await this.lastServiceByAsset(
      companyId,
      assets.map((asset) => asset.id),
    );

    const verdict = maintenanceVerdict({
      assets: assets.map((asset) => ({ ...asset, lastServiceAt: serviced.get(asset.id) ?? null })),
      jobs,
      windowDays,
      now,
      currency: 'ZAR',
    });

    const byStatus: Record<string, number> = {};
    for (const asset of assets) byStatus[asset.status] = (byStatus[asset.status] ?? 0) + 1;

    return {
      ...verdict,
      windowDays,
      windowStart,
      windowEnd: now,
      assetsByStatus: byStatus,
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private assertNotFuture(at: Date, label: string) {
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException(`${label} is not a valid date.`);
    }
    if (at.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException(`${label} cannot be in the future.`);
    }
  }

  private assertTransition(from: MaintenanceJobStatus, to: MaintenanceJobStatus) {
    if (!canTransition(from, to)) {
      throw new BadRequestException(transitionRefusal(from, to));
    }
  }

  private async requireJob(companyId: string, id: string) {
    const job = await this.prisma.maintenanceJob.findFirst({ where: { id, companyId } });
    if (!job) throw new NotFoundException('Job not found.');
    return job;
  }

  private async withAsset(jobId: string, companyId: string) {
    return this.prisma.maintenanceJob.findFirst({
      where: { id: jobId, companyId },
      include: { asset: { select: { id: true, assetCode: true, name: true } } },
    });
  }

  /**
   * Number allocation with retry.
   *
   * Derive-not-count, then retry on the unique violation: two cards raised at
   * the same second must not both get 0007. The retry re-reads the highest
   * number, which is the only thing that stays correct under concurrency.
   */
  private async createWithNextNumber(
    companyId: string,
    data: (jobNumber: string) => Prisma.MaintenanceJobUncheckedCreateInput,
  ) {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt += 1) {
      const year = new Date().getFullYear();
      const last = await this.prisma.maintenanceJob.findFirst({
        where: { companyId, jobNumber: { startsWith: `MJ-${year}-` } },
        orderBy: { jobNumber: 'desc' },
        select: { jobNumber: true },
      });
      const jobNumber = nextJobNumber(last?.jobNumber ?? null, year);
      try {
        return await this.prisma.maintenanceJob.create({ data: data(jobNumber) });
      } catch (err) {
        lastError = err;
        const code = (err as { code?: string })?.code;
        // P2002 = unique violation. Anything else is a real failure.
        if (code !== 'P2002') throw err;
        this.logger.warn(`job number ${jobNumber} collided for ${companyId}; retrying`);
      }
    }
    throw new ConflictException(
      `Could not allocate a job number after ${MAX_NUMBER_ATTEMPTS} attempts — raise the card again. (${String(lastError)})`,
    );
  }

  private async resolvePriorJob(
    companyId: string,
    input: { assetId: string; faultCodeId: string | null; reportedAt: Date; explicitPriorJobId: string | null },
  ) {
    if (input.explicitPriorJobId) {
      const prior = await this.prisma.maintenanceJob.findFirst({
        where: { id: input.explicitPriorJobId, companyId },
      });
      if (!prior) throw new NotFoundException('The job this one links to was not found.');
      if (prior.assetId !== input.assetId) {
        throw new BadRequestException('A comeback must be on the same unit.');
      }
      return prior;
    }
    if (!input.faultCodeId) return null;

    const candidates = await this.prisma.maintenanceJob.findMany({
      where: {
        companyId,
        assetId: input.assetId,
        faultCodeId: input.faultCodeId,
        status: { in: WORKED_JOB_STATUSES },
        completedAt: { not: null, lte: input.reportedAt },
      },
      orderBy: { completedAt: 'desc' },
      take: 10,
    });
    if (candidates.length === 0) return null;

    return findComeback(
      {
        id: 'pending',
        assetId: input.assetId,
        faultCodeId: input.faultCodeId,
        status: 'REPORTED',
        reportedAt: input.reportedAt,
      },
      candidates,
    );
  }

  private async advanceMeter(
    companyId: string,
    assetId: string,
    reading: number,
    source: string,
    jobId: string | null,
    actor: MaintenanceActor,
  ) {
    await this.prisma.maintenanceMeterReading.create({
      data: {
        companyId,
        assetId,
        reading,
        source,
        jobId,
        recordedByName: actor.name ?? null,
      },
    });
    await this.prisma.maintenanceAsset.update({
      where: { id: assetId },
      data: { meterReading: reading, meterReadAt: new Date() },
    });
  }

  private async advanceMeterIfHigher(
    companyId: string,
    assetId: string,
    reading: number,
    jobId: string,
    actor: MaintenanceActor,
  ) {
    const asset = await this.prisma.maintenanceAsset.findFirst({
      where: { id: assetId, companyId },
      select: { meterReading: true },
    });
    if (!asset) return;
    if (reading <= asset.meterReading) return;
    await this.advanceMeter(companyId, assetId, reading, 'JOB', jobId, actor);
  }

  private async appendEvent(
    companyId: string,
    jobId: string,
    input: {
      type:
        | 'CREATED'
        | 'STATUS_CHANGED'
        | 'METER_RECORDED'
        | 'COST_ADDED'
        | 'NOTE_ADDED'
        | 'COMEBACK_LINKED'
        | 'WARRANTY_SET'
        | 'COMMERCIAL_CHANGED';
      fromStatus?: MaintenanceJobStatus;
      toStatus?: MaintenanceJobStatus;
      actor: MaintenanceActor;
      description: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.prisma.maintenanceJobEvent.create({
      data: {
        companyId,
        jobId,
        type: input.type,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        actorId: input.actor.id ?? null,
        actorName: input.actor.name ?? null,
        description: input.description,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}
