import { PrismaClient } from '@prisma/client';
import { CORRIDOR_CATALOG } from './corridors.catalog';
import { YARD_CATALOG } from './yards.catalog';
import { ANNEXURE_20B_VERSION, CANCELLATION_CODE_CATALOG, validateCancellationCodeEntry } from './cancellation-codes.catalog';
import { ANCILLARY_SERVICE_CATALOG, ANNEXURE_40_VERSION, validateAncillaryServiceEntry } from './ancillary-services.catalog';
import { TARIFF_RATE_FIELDS, TARIFF_SCHEDULE_CATALOG, validateTariffScheduleEntry } from './tariff-schedules.catalog';
import { validateReferenceEntry } from '../rail-reference';

/**
 * Idempotent seeder for the platform-wide rail reference tables.
 *
 * - Source of truth is the typed catalogs in this folder (so every row is code-reviewed).
 * - Safe to re-run: rows are matched on `code`; an unchanged row is left alone.
 * - It NEVER downgrades a VERIFIED row: if the database holds a VERIFIED row and the catalog
 *   still says SOURCE_PENDING, the row is skipped and reported.
 * - Refuses to write anything if any catalog entry fails validation.
 * - `dryRun` reports exactly what would change and writes nothing.
 * - Annexure 20b cancellation codes (CNX-001..082) have no verification status, so their guard is
 *   different: `isActive` belongs to the operator — the seeder never writes it on update and never
 *   revives a row that was deactivated. A change of a code's responsible party (it drives who pays)
 *   is always listed in the summary so it cannot happen unnoticed.
 *
 * - Annexure 40 ancillary services (113 lines) are seeded WITHOUT prices: the annexure publishes none. `isActive` is
 *   operator-owned as above, a PUBLISHED rate in the database is never overwritten by a catalog line that does not
 *   carry one, and every change to a rate is listed so a price cannot change unnoticed.
 * - Tariff schedules come from `tariff-schedules.catalog.ts`, which is EMPTY: no c/GTK rate was supplied. A VERIFIED
 *   row is never downgraded and every change to a rate is listed.
 *
 * Run it from the operator script `prisma/seed-rail-reference.js` (--plan, then --apply).
 */

export interface SeedTableSummary {
  table: string;
  catalogRows: number;
  created: number;
  updated: number;
  unchanged: number;
  skippedVerified: number;
  /** Anything the operator should read before/after applying (e.g. a changed attribution). */
  notes?: string[];
}
export interface SeedSummary {
  dryRun: boolean;
  tables: SeedTableSummary[];
}

type Db = Pick<PrismaClient, 'railCorridorNode' | 'railYardSpec' | 'railCancellationCode' | 'railAncillaryServiceCatalog' | 'railTariffSchedule'>;

/**
 * The network code every catalog in this folder is transcribed from.
 *
 * These files are Transnet source documents -- Annexure 20b, Annexure 40, the
 * V4 corridor register -- so every row they seed belongs to Transnet's
 * network. A tenant on another network must not be offered them.
 */
const CATALOG_NETWORK_CODE = 'transnet';

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Network ids by code, resolved by the CALLER.
 *
 * The seeder does not read rail_networks itself. It is an operator job with
 * no tenant in scope, and rail_networks is a tenant table, so a read here
 * would be an unscoped one. Resolving in the caller keeps the seeder free of
 * tenant-table access and keeps the reference catalogs seedable in isolation.
 */
export interface SeedNetworkIds {
  /** code -> id. A catalog code absent from this map seeds as NULL. */
  byCode: Readonly<Record<string, string | null>>;
}

export async function seedRailReference(
  prisma: Db,
  opts: { dryRun?: boolean; networks?: SeedNetworkIds } = {},
): Promise<SeedSummary> {
  const dryRun = opts.dryRun ?? false;

  // 1) Validate everything first — all or nothing.
  const problems: string[] = [];
  for (const c of CORRIDOR_CATALOG) validateReferenceEntry(c).forEach((p) => problems.push(`corridor ${c.code}: ${p}`));
  for (const y of YARD_CATALOG) validateReferenceEntry(y).forEach((p) => problems.push(`yard ${y.code}: ${p}`));
  const dup = (codes: string[]) => codes.filter((c, i) => codes.indexOf(c) !== i);
  for (const c of CANCELLATION_CODE_CATALOG) validateCancellationCodeEntry(c).forEach((p) => problems.push(`cancellation code ${c.code}: ${p}`));
  dup(CORRIDOR_CATALOG.map((c) => c.code)).forEach((c) => problems.push(`duplicate corridor code ${c}`));
  dup(YARD_CATALOG.map((c) => c.code)).forEach((c) => problems.push(`duplicate yard code ${c}`));
  dup(CANCELLATION_CODE_CATALOG.map((c) => c.code)).forEach((c) => problems.push(`duplicate cancellation code ${c}`));
  dup(CANCELLATION_CODE_CATALOG.map((c) => String(c.sourceRow))).forEach((r) => problems.push(`duplicate cancellation sourceRow ${r}`));
  for (const a of ANCILLARY_SERVICE_CATALOG) validateAncillaryServiceEntry(a).forEach((x) => problems.push(`ancillary service ${a.code}: ${x}`));
  dup(ANCILLARY_SERVICE_CATALOG.map((a) => a.code)).forEach((c) => problems.push(`duplicate ancillary service code ${c}`));
  const corridorCodes = CORRIDOR_CATALOG.map((c) => c.code);
  for (const t of TARIFF_SCHEDULE_CATALOG) validateTariffScheduleEntry(t, corridorCodes).forEach((x) => problems.push(`tariff schedule ${t.corridorCode} ${t.financialYear}: ${x}`));
  dup(TARIFF_SCHEDULE_CATALOG.map((t) => `${t.corridorCode} ${t.financialYear}`)).forEach((k) => problems.push(`duplicate tariff schedule ${k}`));
  if (problems.length) throw new Error(`Reference catalog failed validation — nothing was written:\n  ${problems.join('\n  ')}`);

  const tables: SeedTableSummary[] = [];

  // 2) Corridors
  // Resolve each corridor's network code once. A code with no matching network
  // is seeded with NULL deliberately: an unseeded catalogue must not block a
  // seed, and a NULL corridor is offered to every tenant rather than to none.
  const networkIdByCode = new Map<string, string | null>(Object.entries(opts.networks?.byCode ?? {}));

  /** One lookup per code, cached: the whole catalog is transcribed from one network. */
  const networkIdFor = (code: string): string | null => networkIdByCode.get(code) ?? null;

  const corridors: SeedTableSummary = { table: 'rail_corridor_nodes', catalogRows: CORRIDOR_CATALOG.length, created: 0, updated: 0, unchanged: 0, skippedVerified: 0 };
  for (const c of CORRIDOR_CATALOG) {
    const data = {
      name: c.name, aliases: c.aliases, workbookRoutes: c.workbookRoutes, sortOrder: c.sortOrder,
      networkId: networkIdByCode.get(c.networkCode) ?? null,
      gauge: c.gauge, electrification: c.electrification, maxAxleLoadTonnes: c.maxAxleLoadTonnes,
      vehicleProfile: c.vehicleProfile, maxTrainLengthM: c.maxTrainLengthM, contacts: c.contacts as never,
      envelopeExceptions: (c.envelopeExceptions ?? null) as never,
      dataStatus: c.dataStatus, sourceRef: c.sourceRef ?? null, verifiedBy: c.verifiedBy ?? null, notes: c.notes || null,
    };
    const existing = await prisma.railCorridorNode.findUnique({ where: { code: c.code } });
    if (!existing) {
      if (!dryRun) await prisma.railCorridorNode.create({ data: { code: c.code, ...data } });
      corridors.created += 1;
    } else if (existing.dataStatus === 'VERIFIED' && c.dataStatus !== 'VERIFIED') {
      corridors.skippedVerified += 1;
    } else if (
      existing.name === data.name && sameJson(existing.aliases, data.aliases) && sameJson(existing.workbookRoutes, data.workbookRoutes)
      && existing.sortOrder === data.sortOrder && existing.gauge === data.gauge && sameJson(existing.electrification, data.electrification)
      && existing.maxAxleLoadTonnes === data.maxAxleLoadTonnes && existing.vehicleProfile === data.vehicleProfile
      && existing.maxTrainLengthM === data.maxTrainLengthM && sameJson(existing.contacts, data.contacts) && existing.dataStatus === data.dataStatus
      && existing.sourceRef === data.sourceRef && (existing.notes ?? null) === data.notes
      && (existing.networkId ?? null) === data.networkId
      // The section exceptions are limits, not decoration — a re-seed has to notice when one moves.
      && sameJson(existing.envelopeExceptions as never, data.envelopeExceptions)
    ) {
      corridors.unchanged += 1;
    } else {
      if (!dryRun) await prisma.railCorridorNode.update({ where: { code: c.code }, data });
      corridors.updated += 1;
    }
  }
  tables.push(corridors);

  // 3) Yards (the catalog is empty until a cited source is supplied)
  const yards: SeedTableSummary = { table: 'rail_yard_specs', catalogRows: YARD_CATALOG.length, created: 0, updated: 0, unchanged: 0, skippedVerified: 0 };
  for (const y of YARD_CATALOG) {
    const data = {
      name: y.name, corridorCode: y.corridorCode, isTransferYard: y.isTransferYard, gauge: y.gauge, electrification: y.electrification,
      maxAxleLoadTonnes: y.maxAxleLoadTonnes, vehicleProfile: y.vehicleProfile, maxTrainLengthM: y.maxTrainLengthM,
      sidingCapacityWagons: y.sidingCapacityWagons, contacts: y.contacts as never, dataStatus: y.dataStatus,
      sourceRef: y.sourceRef ?? null, verifiedBy: y.verifiedBy ?? null, notes: y.notes || null,
    };
    const existing = await prisma.railYardSpec.findUnique({ where: { code: y.code } });
    if (!existing) {
      if (!dryRun) await prisma.railYardSpec.create({ data: { code: y.code, ...data } });
      yards.created += 1;
    } else if (existing.dataStatus === 'VERIFIED' && y.dataStatus !== 'VERIFIED') {
      yards.skippedVerified += 1;
    } else {
      if (!dryRun) await prisma.railYardSpec.update({ where: { code: y.code }, data });
      yards.updated += 1;
    }
  }
  tables.push(yards);

  // 4) Annexure 20b cancellation codes
  const codes: SeedTableSummary = { table: 'rail_cancellation_codes', catalogRows: CANCELLATION_CODE_CATALOG.length, created: 0, updated: 0, unchanged: 0, skippedVerified: 0, notes: [] };
  for (const c of CANCELLATION_CODE_CATALOG) {
    const data = {
      sourceRow: c.sourceRow, reason: c.reason, responsibleParty: c.responsibleParty, possibleParties: [...c.possibleParties],
      sourceText: c.sourceText, annexureVersion: ANNEXURE_20B_VERSION,
      networkId: networkIdFor(CATALOG_NETWORK_CODE),
    };
    const existing = await prisma.railCancellationCode.findUnique({ where: { code: c.code } });
    if (!existing) {
      if (!dryRun) await prisma.railCancellationCode.create({ data: { code: c.code, ...data } });
      codes.created += 1;
      continue;
    }
    if (existing.isActive === false) codes.notes!.push(`${c.code} is deactivated in the database — its status was left alone.`);
    if (
      existing.sourceRow === data.sourceRow && existing.reason === data.reason && existing.responsibleParty === data.responsibleParty
      && sameJson(existing.possibleParties, data.possibleParties) && existing.sourceText === data.sourceText && existing.annexureVersion === data.annexureVersion
    ) {
      codes.unchanged += 1;
      continue;
    }
    if (existing.responsibleParty !== data.responsibleParty) {
      codes.notes!.push(`${c.code} responsible party ${dryRun ? 'WOULD change' : 'changed'}: ${existing.responsibleParty} -> ${data.responsibleParty} (this decides who bears the cost of a cancellation).`);
    }
    if (!dryRun) await prisma.railCancellationCode.update({ where: { code: c.code }, data });
    codes.updated += 1;
  }
  tables.push(codes);

  // 5) Annexure 40 ancillary services — no prices (the annexure publishes none)
  const ancillary: SeedTableSummary = { table: 'rail_ancillary_services', catalogRows: ANCILLARY_SERVICE_CATALOG.length, created: 0, updated: 0, unchanged: 0, skippedVerified: 0, notes: [] };
  for (const a of ANCILLARY_SERVICE_CATALOG) {
    const data = {
      serviceNumber: a.serviceNumber, serviceName: a.serviceName, name: a.name, sourceLabel: a.sourceLabel ?? null, section: a.section ?? null, description: a.description ?? null,
      unitOfMeasure: a.unitOfMeasure, tier: a.tier, tierName: a.tierName, serviceGroup: a.group, isCompulsory: a.isCompulsory, priceStatus: a.priceStatus,
      unitRateZar: a.unitRateZar ?? null, rateSourceRef: a.rateSourceRef ?? null, annexureVersion: ANNEXURE_40_VERSION,
      networkId: networkIdFor(CATALOG_NETWORK_CODE),
    };
    const existing = await prisma.railAncillaryServiceCatalog.findUnique({ where: { code: a.code } });
    if (!existing) {
      if (!dryRun) await prisma.railAncillaryServiceCatalog.create({ data: { code: a.code, ...data } });
      ancillary.created += 1;
      continue;
    }
    if (existing.isActive === false) ancillary.notes!.push(`${a.code} is deactivated in the database — its status was left alone.`);
    if (existing.priceStatus === 'PUBLISHED' && a.priceStatus !== 'PUBLISHED') {
      ancillary.skippedVerified += 1;
      ancillary.notes!.push(`${a.code} has a PUBLISHED rate in the database (R${existing.unitRateZar}) and the catalog carries none — the row was left alone.`);
      continue;
    }
    if (
      existing.serviceNumber === data.serviceNumber && existing.serviceName === data.serviceName && existing.name === data.name && (existing.sourceLabel ?? null) === data.sourceLabel
      && (existing.section ?? null) === data.section && (existing.description ?? null) === data.description && existing.unitOfMeasure === data.unitOfMeasure
      && existing.tier === data.tier && existing.tierName === data.tierName && existing.serviceGroup === data.serviceGroup && existing.isCompulsory === data.isCompulsory
      && existing.priceStatus === data.priceStatus && (existing.unitRateZar ?? null) === data.unitRateZar && (existing.rateSourceRef ?? null) === data.rateSourceRef
      && existing.annexureVersion === data.annexureVersion
    ) {
      ancillary.unchanged += 1;
      continue;
    }
    if ((existing.unitRateZar ?? null) !== data.unitRateZar) {
      ancillary.notes!.push(`${a.code} rate ${dryRun ? 'WOULD change' : 'changed'}: ${existing.unitRateZar ?? 'none'} -> ${data.unitRateZar ?? 'none'} (this is the price billed for the service).`);
    }
    if (!dryRun) await prisma.railAncillaryServiceCatalog.update({ where: { code: a.code }, data });
    ancillary.updated += 1;
  }
  tables.push(ancillary);

  // 6) Tariff schedules — the catalog is EMPTY until a published tariff is supplied
  const schedules: SeedTableSummary = { table: 'rail_tariff_schedules', catalogRows: TARIFF_SCHEDULE_CATALOG.length, created: 0, updated: 0, unchanged: 0, skippedVerified: 0, notes: [] };
  for (const t of TARIFF_SCHEDULE_CATALOG) {
    const data = {
      loadedCentsPerGtk: t.loadedCentsPerGtk ?? null, emptyCentsPerGtk: t.emptyCentsPerGtk ?? null, dieselLitresPer1000Gtk: t.dieselLitresPer1000Gtk ?? null,
      electricKwhPer1000Gtk: t.electricKwhPer1000Gtk ?? null, dieselPricePerLitreZar: t.dieselPricePerLitreZar ?? null,
      electricityPricePerKwhZar: t.electricityPricePerKwhZar ?? null, overloadPenaltyPerTonneZar: t.overloadPenaltyPerTonneZar ?? null,
      dataStatus: t.dataStatus, sourceRef: t.sourceRef ?? null, notes: t.notes ?? null,
      networkId: networkIdFor(CATALOG_NETWORK_CODE),
    };
    const existing = await prisma.railTariffSchedule.findFirst({ where: { corridorCode: t.corridorCode, financialYear: t.financialYear } });
    if (!existing) {
      if (!dryRun) await prisma.railTariffSchedule.create({ data: { corridorCode: t.corridorCode, financialYear: t.financialYear, ...data } });
      schedules.created += 1;
      continue;
    }
    if (existing.dataStatus === 'VERIFIED' && t.dataStatus !== 'VERIFIED') {
      schedules.skippedVerified += 1;
      schedules.notes!.push(`${t.corridorCode} ${t.financialYear} is VERIFIED in the database and the catalog says SOURCE_PENDING — the row was left alone.`);
      continue;
    }
    if (existing.isActive === false) schedules.notes!.push(`${t.corridorCode} ${t.financialYear} is deactivated in the database — its status was left alone.`);
    const same = TARIFF_RATE_FIELDS.every((f) => (existing[f] ?? null) === data[f])
      && existing.dataStatus === data.dataStatus && (existing.sourceRef ?? null) === data.sourceRef && (existing.notes ?? null) === data.notes;
    if (same) {
      schedules.unchanged += 1;
      continue;
    }
    for (const f of TARIFF_RATE_FIELDS) {
      if ((existing[f] ?? null) !== data[f]) schedules.notes!.push(`${t.corridorCode} ${t.financialYear} ${f} ${dryRun ? 'WOULD change' : 'changed'}: ${existing[f] ?? 'none'} -> ${data[f] ?? 'none'} (this is a billed rate).`);
    }
    if (!dryRun) await prisma.railTariffSchedule.update({ where: { id: existing.id }, data });
    schedules.updated += 1;
  }
  tables.push(schedules);

  return { dryRun, tables };
}
