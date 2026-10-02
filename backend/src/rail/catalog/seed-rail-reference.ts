import { PrismaClient } from '@prisma/client';
import { CORRIDOR_CATALOG } from './corridors.catalog';
import { YARD_CATALOG } from './yards.catalog';
import { ANNEXURE_20B_VERSION, CANCELLATION_CODE_CATALOG, validateCancellationCodeEntry } from './cancellation-codes.catalog';
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

type Db = Pick<PrismaClient, 'railCorridorNode' | 'railYardSpec' | 'railCancellationCode'>;

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function seedRailReference(prisma: Db, opts: { dryRun?: boolean } = {}): Promise<SeedSummary> {
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
  if (problems.length) throw new Error(`Reference catalog failed validation — nothing was written:\n  ${problems.join('\n  ')}`);

  const tables: SeedTableSummary[] = [];

  // 2) Corridors
  const corridors: SeedTableSummary = { table: 'rail_corridor_nodes', catalogRows: CORRIDOR_CATALOG.length, created: 0, updated: 0, unchanged: 0, skippedVerified: 0 };
  for (const c of CORRIDOR_CATALOG) {
    const data = {
      name: c.name, aliases: c.aliases, workbookRoutes: c.workbookRoutes, sortOrder: c.sortOrder,
      gauge: c.gauge, electrification: c.electrification, maxAxleLoadTonnes: c.maxAxleLoadTonnes,
      vehicleProfile: c.vehicleProfile, maxTrainLengthM: c.maxTrainLengthM, contacts: c.contacts as never,
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

  return { dryRun, tables };
}
