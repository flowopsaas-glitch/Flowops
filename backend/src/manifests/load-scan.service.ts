import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Route load and scan.
 *
 * The manifest says what a vehicle is SCHEDULED to carry. The scan says what
 * it was OBSERVED to carry. Keeping those two honest is the whole job of load
 * control, and the previous implementation did not: it set `IN_TRANSIT` on any
 * waybill it could find by tracking number, whatever the parcel's current
 * state, without checking the manifest belonged to the caller's company or
 * that the vehicle had not already left.
 *
 * So a stray scan put a DELIVERED parcel back in transit and resurrected a
 * CANCELLED one, and a parcel already on another truck was happily verified
 * onto a second. Both are invisible to the load plan: the manifest still lists
 * the parcel once, on the vehicle it was scheduled for.
 *
 * WHAT A SCAN MAY DO
 *
 * A parcel may only be loaded from a state in which it is physically at the
 * origin and awaiting a vehicle. Anything further along the journey, and
 * anything terminal, is refused — putting a delivered parcel back on a truck
 * is a data-integrity failure, not a convenience.
 *
 * Every refusal names itself, so an operator is told what happened rather than
 * given a generic failure they will work around:
 *
 *   VERIFIED                   loaded onto this vehicle
 *   ALREADY_SCANNED            re-scanned here; idempotent, not an error
 *   ALREADY_LOADED_ELSEWHERE   in transit and this manifest did not scan it
 *   NOT_LOADABLE               delivered / cancelled / returned / failed /
 *                              already out for delivery
 *   NOT_ON_MANIFEST            not scheduled on this vehicle
 *   NOT_FOUND                  no such tracking number in this company
 *   MANIFEST_DISPATCHED        the vehicle has already left
 *   MANIFEST_NOT_FOUND         no such manifest in this company
 *
 * ALREADY_SCANNED and ALREADY_LOADED_ELSEWHERE are only distinguishable
 * because the scan is stamped on the manifest link (`scannedAt`) rather than
 * inferred from the waybill's status. Both present as `IN_TRANSIT`; only the
 * link knows which manifest put them there. Re-scanning must stay idempotent,
 * because a missed beep is routine and an operator who is told "already
 * loaded" for a parcel they just scanned learns to ignore the message.
 *
 * THE WRITE IS COMPARE-AND-SET
 *
 * The transition is expressed as `updateMany` constrained on the current
 * status, not as read-then-write. Two operators scanning the same parcel at
 * the same instant both read PENDING; only one update matches. The loser
 * re-reads and reports what is actually true rather than reporting a second
 * success for one physical scan.
 */

/** States from which a parcel is physically at the origin and may be loaded. */
const LOADABLE = ['PENDING', 'COLLECTED', 'AT_ORIGIN_HUB'] as const;

export type ScanOutcome =
  | 'VERIFIED'
  | 'ALREADY_SCANNED'
  | 'ALREADY_LOADED_ELSEWHERE'
  | 'NOT_LOADABLE'
  | 'NOT_ON_MANIFEST'
  | 'NOT_FOUND'
  | 'MANIFEST_DISPATCHED'
  | 'MANIFEST_NOT_FOUND';

export interface ScanResult {
  status: ScanOutcome;
  trackingNumber: string;
  manifestId: string;
  waybillId?: string;
  recipientName?: string;
  /** Present on every refusal: what the parcel's state actually is. */
  currentStatus?: string;
  /** Why the scan was refused, in language an operator can act on. */
  reason?: string;
}

@Injectable()
export class LoadScanService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Confirm one parcel onto one vehicle.
   *
   * Never throws for an expected operational refusal — a missed beep is not an
   * exception. Unexpected failures still surface as errors.
   */
  async verifyScan(companyId: string, manifestId: string, trackingNumber: string): Promise<ScanResult> {
    const base = { trackingNumber, manifestId };

    return this.prisma.withTenant(companyId, async (tx) => {
      const manifest = await tx.manifest.findFirst({
        where: { id: manifestId, companyId },
        select: { id: true, dispatched: true, dispatchedAt: true },
    });
    if (!manifest) {
      return { ...base, status: 'MANIFEST_NOT_FOUND', reason: 'No manifest with that id belongs to this company.' };
    }
    // Loading a vehicle that has already left produces a load plan nobody can
    // act on: the parcel is marked in transit but is still on the floor.
    if (manifest.dispatched) {
      return {
        ...base,
        status: 'MANIFEST_DISPATCHED',
        reason: `This manifest was dispatched${manifest.dispatchedAt ? ` at ${manifest.dispatchedAt.toISOString()}` : ''}. It can no longer be loaded.`,
      };
    }

    const waybill = await tx.waybill.findFirst({
      where: { trackingNumber, companyId },
      select: { id: true, status: true, recipientName: true },
    });
    if (!waybill) {
      return { ...base, status: 'NOT_FOUND', reason: 'No waybill with that tracking number belongs to this company.' };
    }

    const link = await tx.manifestWaybill.findUnique({
      where: { manifestId_waybillId: { manifestId, waybillId: waybill.id } },
      select: { scannedAt: true },
    });
    if (!link) {
      return {
        ...base,
        status: 'NOT_ON_MANIFEST',
        waybillId: waybill.id,
        currentStatus: waybill.status,
        reason: 'This waybill is not scheduled on this manifest.',
      };
    }

    const identity = { ...base, waybillId: waybill.id, recipientName: waybill.recipientName ?? undefined };

    // Already confirmed onto THIS vehicle. Idempotent by design.
    if (link.scannedAt) {
      return { ...identity, status: 'ALREADY_SCANNED', reason: 'Already scanned onto this manifest.' };
    }

    if (waybill.status === 'IN_TRANSIT') {
      // In transit, but this manifest never scanned it — so some other
      // manifest did, or it was moved by another flow. Either way it is not
      // here to be loaded, and loading it would put one parcel on two trucks.
      return {
        ...identity,
        status: 'ALREADY_LOADED_ELSEWHERE',
        currentStatus: waybill.status,
        reason: 'This waybill is already in transit and was not scanned onto this manifest. Loading it would place one parcel on two vehicles.',
      };
    }

    if (!LOADABLE.includes(waybill.status as (typeof LOADABLE)[number])) {
      return {
        ...identity,
        status: 'NOT_LOADABLE',
        currentStatus: waybill.status,
        reason: `A waybill in ${waybill.status} cannot be loaded onto a vehicle.`,
      };
    }

    // Compare-and-set: the expected current state is part of the write, so a
    // concurrent scan cannot also succeed.
    const { count } = await tx.waybill.updateMany({
      where: { id: waybill.id, companyId, status: { in: [...LOADABLE] } },
      data: { status: 'IN_TRANSIT' },
    });

    if (count === 0) {
      // Someone else moved it between our read and our write. Report what is
      // true now rather than claiming a scan that did not happen.
      const now = await tx.waybill.findUnique({
        where: { id: waybill.id },
        select: { status: true },
      });
      return {
        ...identity,
        status: 'ALREADY_LOADED_ELSEWHERE',
        currentStatus: now?.status ?? waybill.status,
        reason: 'The waybill was loaded by another scan at the same moment.',
      };
    }

    // Stamp the link only after the transition lands, so the scan record
    // cannot exist without the parcel actually being in transit.
    await tx.manifestWaybill.update({
      where: { manifestId_waybillId: { manifestId, waybillId: waybill.id } },
      data: { scannedAt: new Date() },
    });

    return { ...identity, status: 'VERIFIED' };
    });
  }

  /**
   * Close out loading: dispatch the vehicle and list what was never scanned.
   *
   * Dispatching is a transition too, so it is compare-and-set on
   * `dispatched: false` — calling this twice must not restamp the departure
   * time on a vehicle that left minutes ago.
   */
  async completeLoad(companyId: string, manifestId: string) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const manifest = await tx.manifest.findFirst({
        where: { id: manifestId, companyId },
        select: {
          id: true,
          dispatched: true,
          dispatchedAt: true,
          waybills: {
            select: {
              scannedAt: true,
              waybill: { select: { id: true, trackingNumber: true, recipientName: true, status: true } },
            },
          },
        },
    });
    if (!manifest) {
      return { status: 'MANIFEST_NOT_FOUND' as const, reason: 'No manifest with that id belongs to this company.' };
    }

    // Counted from the scan record, not from `status === IN_TRANSIT`. A parcel
    // that happens to be in transit for some other reason was not loaded here,
    // and counting it would let a short load be signed off as complete.
    const loaded = manifest.waybills.filter((mw) => mw.scannedAt !== null);
    const unscanned = manifest.waybills.filter((mw) => mw.scannedAt === null);

    if (manifest.dispatched) {
      return {
        status: 'ALREADY_DISPATCHED' as const,
        manifestId,
        dispatchedAt: manifest.dispatchedAt,
        totalExpected: manifest.waybills.length,
        loaded: loaded.length,
        unscanned: unscanned.map((mw) => ({
          trackingNumber: mw.waybill.trackingNumber,
          recipientName: mw.waybill.recipientName,
          status: mw.waybill.status,
        })),
        reason: 'This manifest was already dispatched; the departure time was not changed.',
      };
    }

    const { count } = await tx.manifest.updateMany({
      where: { id: manifestId, companyId, dispatched: false },
      data: { dispatched: true, dispatchedAt: new Date() },
    });
    if (count === 0) {
      return {
        status: 'ALREADY_DISPATCHED' as const,
        manifestId,
        reason: 'Dispatched concurrently by another request.',
      };
    }

    return {
      status: 'DISPATCHED' as const,
      manifestId,
      dispatchedAt: new Date(),
      totalExpected: manifest.waybills.length,
      loaded: loaded.length,
      unscanned: unscanned.map((mw) => ({
        trackingNumber: mw.waybill.trackingNumber,
        recipientName: mw.waybill.recipientName,
        status: mw.waybill.status,
      })),
    };
    });
  }
}
