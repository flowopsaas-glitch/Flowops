import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RailGauge, RailTrainManifestStatus, RailVehicleProfile, WagonType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../webhooks/outbox.service';
import { RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, recordRailAudit } from './rail-audit';
import { assertSignatoryRole } from './rail-roles';
import {
  AmendTrainManifestDto, CancelTrainManifestDto, CreateTrainManifestDto, IssueTrainManifestDto,
  ManifestMoveDto, ManifestWagonLineDto, UpdateTrainManifestDto,
} from './dto/rail-manifest.dto';
import { canTransitionManifest, evaluateManifestForIssue, isManifestEditable, ManifestLine } from './rail-manifest.rules';

/**
 * Digital Train Manifest service — the departure document for a rail consignment.
 *
 * Creation snapshots the consignment's consist into manifest lines. Issue is a
 * signatory attestation gated by the shared dangerous-goods engine, and freezes
 * the document. Corrections go through AMEND: a new revision (revision+1) that
 * supersedes the old row. Depart / arrive / close / cancel record who, when,
 * and emit outbox events for integrators.
 */
@Injectable()
export class RailTrainManifestService {
  private readonly logger = new Logger(RailTrainManifestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException('Rail & Intermodal is an Enterprise feature. Upgrade your plan to manage train manifests.');
    }
  }

  private record(companyId: string, actor: RailActor, action: string, target: { type: string; id: string; name?: string | null }, metadata: Record<string, unknown> = {}) {
    return recordRailAudit(this.audit, this.logger, railAuditEntry(companyId, actor, action, target, metadata));
  }

  /** Verified signatory string: typed identity + the authenticated actor behind it. */
  private attestation(typedName: string, actor: RailActor): string {
    const typed = typedName.trim();
    if (!typed) throw new BadRequestException('A signatory name or role is required.');
    return `${typed.slice(0, 160)} [verified: ${(actor.name ?? '').slice(0, 120) || 'unknown'} <${actor.email ?? ''}> (${actor.role})]`;
  }

  private async nextManifestNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.railTrainManifest.count({ where: { companyId, createdAt: { gte: new Date(year, 0, 1) } } });
    return `TM-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private async getOrThrow(companyId: string, id: string) {
    const manifest = await this.prisma.railTrainManifest.findFirst({
      where: { id, companyId },
      include: { wagons: { orderBy: { position: 'asc' } } },
    });
    if (!manifest) throw new NotFoundException('Train manifest not found');
    return manifest;
  }

  private async consignmentOrThrow(companyId: string, consignmentId: string) {
    const consignment = await this.prisma.railConsignment.findFirst({
      where: { id: consignmentId, companyId },
      include: { wagons: true },
    });
    if (!consignment) throw new BadRequestException('consignmentId does not belong to this tenant.');
    return consignment;
  }

  private async getDgConsignment(companyId: string, consignmentId: string) {
    return this.prisma.railConsignment.findFirst({
      where: { id: consignmentId, companyId },
      select: {
        consignmentNumber: true, isDangerousGoods: true,
        unNumber: true, imdgClass: true, placardRef: true, emergencyContact24h: true, msdsDocumentUrl: true,
      },
    });
  }

  /** Wagon-line rows WITHOUT manifestId — nested createMany fills it in. */
  private lineRows(lines: ReadonlyArray<ManifestWagonLineDto>): Prisma.RailTrainManifestWagonCreateManyManifestInput[] {
    return lines.map((l, i) => ({
      position: l.position ?? i + 1,
      wagonNumber: l.wagonNumber.trim(),
      type: l.type ?? 'CONTAINER_CAR',
      tareTonnes: l.tareTonnes ?? null,
      loadedTonnes: l.loadedTonnes ?? null,
      commodity: l.commodity ?? null,
      sealNumbers: l.sealNumbers ?? null,
      axles: l.axles ?? null,
      gauge: l.gauge ?? null,
      vehicleProfile: l.vehicleProfile ?? null,
      isDangerousGoods: l.isDangerousGoods ?? false,
      unNumber: l.unNumber ?? null,
      imdgClass: l.imdgClass ?? null,
      placardRef: l.placardRef ?? null,
      emergencyContact24h: l.emergencyContact24h ?? null,
      msdsDocumentUrl: l.msdsDocumentUrl ?? null,
      note: l.note ?? null,
    }));
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Snapshot a consignment's consist into a new DRAFT manifest. */
  async create(companyId: string, dto: CreateTrainManifestDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const consignment = await this.consignmentOrThrow(companyId, dto.consignmentId);

    let created: { id: string; manifestNumber: string } | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const manifestNumber = await this.nextManifestNumber(companyId);
      try {
        created = await this.prisma.withTenant(companyId, async (tx) => {
          const row = await tx.railTrainManifest.create({
            data: {
              companyId, manifestNumber, revision: 1, status: 'DRAFT',
              consignmentId: consignment.id, consignmentNumber: consignment.consignmentNumber,
              slotApplicationId: dto.slotApplicationId ?? null,
              trainServiceRef: dto.trainServiceRef ?? consignment.serviceRef ?? null,
              corridor: dto.corridor ?? consignment.corridor ?? null,
              originSiding: dto.originSiding ?? consignment.originSiding ?? null,
              destinationSiding: dto.destinationSiding ?? consignment.destinationSiding ?? null,
              railOperator: dto.railOperator ?? consignment.railOperator ?? null,
              locoReference: dto.locoReference ?? null,
              plannedDeparture: dto.plannedDeparture ? new Date(dto.plannedDeparture) : consignment.plannedDeparture,
              plannedArrival: dto.plannedArrival ? new Date(dto.plannedArrival) : consignment.plannedArrival,
              notes: dto.notes ?? null,
              createdById: actor.id, createdByEmail: actor.email,
              wagons: {
                createMany: {
                  data: this.lineRows(consignment.wagons.map((w, i) => ({
                    position: i + 1,
                    wagonNumber: w.wagonNumber,
                    type: (w.type as WagonType) ?? 'CONTAINER_CAR',
                    tareTonnes: w.tareTonnes, loadedTonnes: w.loadedTonnes,
                    commodity: w.commodity ?? undefined, sealNumbers: w.sealNumbers ?? undefined,
                    axles: w.axles ?? undefined,
                    gauge: (w.gauge as RailGauge) ?? undefined,
                    vehicleProfile: (w.vehicleProfile as RailVehicleProfile) ?? undefined,
                    isDangerousGoods: w.isDangerousGoods,
                    unNumber: w.unNumber ?? undefined, imdgClass: w.imdgClass ?? undefined,
                    placardRef: w.placardRef ?? undefined, emergencyContact24h: w.emergencyContact24h ?? undefined,
                    msdsDocumentUrl: w.msdsDocumentUrl ?? undefined,
                  }))),
                },
              },
            },
            select: { id: true, manifestNumber: true },
          });
          await this.outbox.enqueue(tx, companyId, 'rail.manifest.created', {
            manifestId: row.id, manifestNumber, revision: 1,
            consignmentId: consignment.id, consignmentNumber: consignment.consignmentNumber,
            trainServiceRef: dto.trainServiceRef ?? consignment.serviceRef ?? null,
          });
          return row;
        });
      } catch (err: any) {
        if (err?.code !== 'P2002' || attempt === 2) throw err;
      }
    }
    const app = created as NonNullable<typeof created>;
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.MANIFEST_CREATED, { type: RAIL_AUDIT_TARGET.TRAIN_MANIFEST, id: app.id, name: app.manifestNumber },
      { consignmentNumber: consignment.consignmentNumber, wagons: consignment.wagons.length });
    return this.getOrThrow(companyId, app.id);
  }

  /** Edit a DRAFT manifest's header and (optionally) its wagon lines. */
  async update(companyId: string, id: string, dto: UpdateTrainManifestDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const manifest = await this.getOrThrow(companyId, id);
    if (!isManifestEditable(manifest.status)) {
      throw new BadRequestException(`An issued manifest is immutable (this one is ${manifest.status}). Amend it to create a new revision.`);
    }
    const { wagons, ...header } = dto;
    await this.prisma.withTenant(companyId, async (tx) => {
      await tx.railTrainManifest.update({
        where: { id },
        data: {
          ...Object.fromEntries(Object.entries(header).filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, (k === 'plannedDeparture' || k === 'plannedArrival') ? new Date(v as string) : v])),
        },
      });
      if (wagons) {
        await tx.railTrainManifestWagon.deleteMany({ where: { manifestId: id } });
        if (wagons.length) {
          await tx.railTrainManifestWagon.createMany({
            data: this.lineRows(wagons).map((r) => ({ ...r, manifestId: id })),
          });
        }
      }
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.MANIFEST_UPDATED, { type: RAIL_AUDIT_TARGET.TRAIN_MANIFEST, id, name: manifest.manifestNumber },
      { fields: Object.keys(dto), lines: wagons?.length ?? null });
    return this.getOrThrow(companyId, id);
  }

  /** Issue: signatory attestation + DG gate. Freezes the document. */
  async issue(companyId: string, id: string, dto: IssueTrainManifestDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    assertSignatoryRole(actor, 'Issuing a train manifest');
    const manifest = await this.getOrThrow(companyId, id);
    if (!canTransitionManifest(manifest.status, 'ISSUED')) {
      throw new BadRequestException(`A ${manifest.status} manifest cannot be issued.`);
    }
    const dgConsignment = await this.getDgConsignment(companyId, manifest.consignmentId);
    const lines: ManifestLine[] = manifest.wagons.map((w) => ({
      position: w.position, wagonNumber: w.wagonNumber,
      tareTonnes: w.tareTonnes, loadedTonnes: w.loadedTonnes,
      isDangerousGoods: w.isDangerousGoods,
      unNumber: w.unNumber, imdgClass: w.imdgClass, placardRef: w.placardRef,
      emergencyContact24h: w.emergencyContact24h, msdsDocumentUrl: w.msdsDocumentUrl,
    }));
    const check = evaluateManifestForIssue(lines, dgConsignment ?? { isDangerousGoods: false });
    if (!check.ok) throw new BadRequestException(`Cannot issue ${manifest.manifestNumber}: ${check.blockers.join(' ')}`);

    const issuedBy = this.attestation(dto.issuedBy, actor);
    return this.transition(companyId, manifest, 'ISSUED', actor, RAIL_AUDIT_ACTION.MANIFEST_ISSUED,
      { issuedAt: new Date(), issuedBy }, { issuedBy, dgSummary: check.dgSummary }, 'rail.manifest.issued', { issuedBy });
  }

  /**
   * Amend: the only way to correct an issued manifest. Creates a NEW draft
   * revision (revision+1, same document number) copying the frozen lines, and
   * marks the old revision SUPERSEDED. Allowed only before departure.
   */
  async amend(companyId: string, id: string, dto: AmendTrainManifestDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    assertSignatoryRole(actor, 'Amending an issued train manifest');
    const old = await this.getOrThrow(companyId, id);
    if (old.status !== 'ISSUED') {
      throw new BadRequestException(`Only an ISSUED manifest can be amended (this one is ${old.status}).`);
    }

    const next = await this.prisma.withTenant(companyId, async (tx) => {
      const row = await tx.railTrainManifest.create({
        data: {
          companyId, manifestNumber: old.manifestNumber, revision: old.revision + 1,
          status: 'DRAFT', supersedesId: old.id,
          consignmentId: old.consignmentId, consignmentNumber: old.consignmentNumber,
          slotApplicationId: old.slotApplicationId, trainServiceRef: old.trainServiceRef,
          corridor: old.corridor, originSiding: old.originSiding, destinationSiding: old.destinationSiding,
          railOperator: old.railOperator, locoReference: old.locoReference,
          plannedDeparture: old.plannedDeparture, plannedArrival: old.plannedArrival,
          notes: dto.note ?? old.notes,
          createdById: actor.id, createdByEmail: actor.email,
          wagons: {
            createMany: {
              data: this.lineRows(old.wagons.map((w) => ({
                position: w.position, wagonNumber: w.wagonNumber,
                type: w.type as WagonType, tareTonnes: w.tareTonnes, loadedTonnes: w.loadedTonnes,
                commodity: w.commodity ?? undefined, sealNumbers: w.sealNumbers ?? undefined,
                axles: w.axles ?? undefined, gauge: (w.gauge as RailGauge) ?? undefined,
                vehicleProfile: (w.vehicleProfile as RailVehicleProfile) ?? undefined,
                isDangerousGoods: w.isDangerousGoods, unNumber: w.unNumber ?? undefined,
                imdgClass: w.imdgClass ?? undefined, placardRef: w.placardRef ?? undefined,
                emergencyContact24h: w.emergencyContact24h ?? undefined, msdsDocumentUrl: w.msdsDocumentUrl ?? undefined,
                note: w.note ?? undefined,
              }))),
            },
          },
        },
      });
      await tx.railTrainManifest.update({
        where: { id: old.id },
        data: { status: 'SUPERSEDED', supersededAt: new Date(), supersededById: actor.id },
      });
      await this.outbox.enqueue(tx, companyId, 'rail.manifest.amended', {
        manifestNumber: old.manifestNumber, newRevision: row.revision, supersedesId: old.id,
        manifestId: row.id, note: dto.note ?? null,
      });
      return row;
    });
    await this.record(companyId, actor, RAIL_AUDIT_ACTION.MANIFEST_AMENDED, { type: RAIL_AUDIT_TARGET.TRAIN_MANIFEST, id: next.id, name: next.manifestNumber },
      { fromRevision: old.revision, toRevision: next.revision, supersedesId: old.id, note: dto.note ?? null });
    return this.getOrThrow(companyId, next.id);
  }

  depart(companyId: string, id: string, dto: ManifestMoveDto, actor: RailActor) {
    return this.move(companyId, id, 'DEPARTED', actor, RAIL_AUDIT_ACTION.MANIFEST_DEPARTED,
      dto, 'rail.manifest.departed', ['ISSUED']);
  }

  arrive(companyId: string, id: string, dto: ManifestMoveDto, actor: RailActor) {
    return this.move(companyId, id, 'ARRIVED', actor, RAIL_AUDIT_ACTION.MANIFEST_ARRIVED,
      dto, 'rail.manifest.arrived', ['DEPARTED']);
  }

  close(companyId: string, id: string, dto: ManifestMoveDto, actor: RailActor) {
    assertSignatoryRole(actor, 'Closing a train manifest');
    return this.move(companyId, id, 'CLOSED', actor, RAIL_AUDIT_ACTION.MANIFEST_CLOSED,
      dto, 'rail.manifest.closed', ['ARRIVED']);
  }

  async cancel(companyId: string, id: string, dto: CancelTrainManifestDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const manifest = await this.getOrThrow(companyId, id);
    if (!canTransitionManifest(manifest.status, 'CANCELLED')) {
      throw new BadRequestException(`A ${manifest.status} manifest cannot be cancelled.`);
    }
    return this.transition(companyId, manifest, 'CANCELLED', actor, RAIL_AUDIT_ACTION.MANIFEST_CANCELLED,
      { cancelledAt: new Date(), cancelledReason: dto.reason.trim() },
      { reason: dto.reason.trim().slice(0, 500) }, 'rail.manifest.cancelled', { reason: dto.reason.trim().slice(0, 500) });
  }

  private async move(
    companyId: string, id: string, to: RailTrainManifestStatus, actor: RailActor, action: string,
    dto: ManifestMoveDto, event: 'rail.manifest.departed' | 'rail.manifest.arrived' | 'rail.manifest.closed',
    allowedFrom: RailTrainManifestStatus[],
  ) {
    await this.assertEntitled(companyId);
    const manifest = await this.getOrThrow(companyId, id);
    if (!allowedFrom.includes(manifest.status)) {
      throw new BadRequestException(`A ${manifest.status} manifest cannot become ${to}.`);
    }
    const at = dto.at ? new Date(dto.at) : new Date();
    if (at.getTime() > Date.now() + 86_400_000) throw new BadRequestException('The event time cannot be in the future.');
    const by = this.attestation(dto.signedBy ?? actor.name ?? 'system', actor);
    const field = to === 'DEPARTED' ? 'departedAt' : to === 'ARRIVED' ? 'arrivedAt' : 'closedAt';
    const byField = to === 'DEPARTED' ? 'departedBy' : to === 'ARRIVED' ? 'arrivedBy' : 'closedBy';
    return this.transition(companyId, manifest, to, actor, action,
      { [field]: at, [byField]: by } as Prisma.RailTrainManifestUpdateInput,
      { at: at.toISOString(), by }, event, { at: at.toISOString(), by });
  }

  private async transition(
    companyId: string,
    manifest: { id: string; manifestNumber: string; status: RailTrainManifestStatus; consignmentId: string },
    to: RailTrainManifestStatus,
    actor: RailActor,
    action: string,
    patch: Prisma.RailTrainManifestUpdateInput,
    metadata: Record<string, unknown>,
    event: 'rail.manifest.created' | 'rail.manifest.issued' | 'rail.manifest.amended' | 'rail.manifest.departed' | 'rail.manifest.arrived' | 'rail.manifest.closed' | 'rail.manifest.cancelled',
    payload: Record<string, unknown>,
  ) {
    await this.prisma.withTenant(companyId, async (tx) => {
      await tx.railTrainManifest.update({ where: { id: manifest.id }, data: { ...patch, status: to } });
      await this.outbox.enqueue(tx, companyId, event, {
        manifestId: manifest.id, manifestNumber: manifest.manifestNumber,
        from: manifest.status, to, ...payload,
      });
    });
    await this.record(companyId, actor, action, { type: RAIL_AUDIT_TARGET.TRAIN_MANIFEST, id: manifest.id, name: manifest.manifestNumber },
      { from: manifest.status, to, ...metadata });
    return this.getOrThrow(companyId, manifest.id);
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  list(companyId: string, filters: { status?: string; consignmentId?: string } = {}) {
    return this.prisma.railTrainManifest.findMany({
      where: {
        companyId,
        ...(filters.status ? { status: filters.status as RailTrainManifestStatus } : {}),
        ...(filters.consignmentId ? { consignmentId: filters.consignmentId } : {}),
      },
      orderBy: [{ manifestNumber: 'desc' }, { revision: 'desc' }],
      include: { _count: { select: { wagons: true } } },
    });
  }

  get(companyId: string, id: string) {
    return this.getOrThrow(companyId, id);
  }
}
