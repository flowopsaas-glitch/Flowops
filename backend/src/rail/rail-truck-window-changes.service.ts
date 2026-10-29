import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import {
  Prisma, TruckAppointmentStatus, TruckWindowAckSource, TruckWindowChangeKind,
  TruckWindowChannel, TruckWindowDeliveryState, TruckWindowEscalation, TruckWindowRecipientType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EventsGateway } from '../gateway/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../webhooks/outbox.service';
import {
  RAIL_AUDIT_ACTION, RAIL_AUDIT_TARGET, RailActor, railAuditEntry, railSystemAuditEntry, recordRailAudit,
} from './rail-audit';
import {
  assessAcknowledgement, assessEscalation, assessWindowChange, bestDeliveryState,
  DELIVERY_UNAVAILABLE_REASON, formatDurationMinutes, nextVersion, resolveAckPolicy,
  summariseAckedBeforeArrival, summariseAckLatency, summariseAckRate,
} from './rail-truck-window-changes.rules';
import { assertWindowChangeAuthority } from './rail-roles';
import {
  assessShareToken, findGateConflicts, formatWindow, readGateCutoffHours,
} from './rail-truck-gate.shared';

/**
 * Terminal truck window changes — the closed loop.
 *
 * The operator rule this implements, validated in a private conversation with a
 * terminal operator (a governance principle, NOT a customer endorsement and NOT
 * a claim that any terminal uses this product):
 *
 *   "A window can be changed by the terminal operator, but hauliers must be
 *    informed quickly during the transportation flow. Terminal operators are
 *    the guide of the whole process."
 *
 * What was there before: `reschedule` and `replan-day` overwrote
 * windowStart/windowEnd in place and appended a text marker to `note`. The old
 * window was gone. Nobody could be told what had changed, nobody could confirm
 * they had seen it, and no change→acknowledgement time could be measured — so
 * "the haulier knows" was a phone call and a hope.
 *
 * What this service does:
 *
 *   AUTHORITY   Only an authenticated tenant user with a rail-write role can
 *               publish a window change (enforced by @Roles on the controller
 *               and re-checked here against the actor). Share-token holders and
 *               driver-portal sessions get READ + ACKNOWLEDGE and nothing else:
 *               an unauthenticated link may confirm a window, never move one.
 *
 *   EVENT       Every change is a versioned row: old window → new window, the
 *               reason, the actor, the timestamp, the version. A new version
 *               SUPERSEDES the previous one, and the database — not a service
 *               convention — guarantees at most one ACTIVE version per
 *               appointment (unique index on `activeAppointmentId`, nulled on
 *               supersede). The superseded window stays readable forever.
 *
 *   PROPAGATION Reuses the rails that already exist: the socket.io company room
 *               (with a transport receipt, so SENT and DELIVERED are different
 *               observed facts), driver web-push, the tenant notification bell,
 *               the transactional outbox, and the counterparty share link as a
 *               pull channel. No new transport is invented here.
 *
 *   HONESTY     A recipient with no channel is UNAVAILABLE with a machine-readable
 *               reason (DRIVER_NOT_ASSIGNED, NO_SHARE_TOKEN, PUSH_NOT_CONFIGURED).
 *               We never invent a recipient to make the fan-out look complete,
 *               and we never display a delivery state we did not observe.
 *
 *   MEASURE     change→ack median + P90 with n, % acknowledged before the truck
 *               arrived (with its denominator and exclusions), and the count of
 *               stale unacknowledged changes. An absent measurement is UNKNOWN,
 *               never zero.
 */

/** The window-change actor. `null` is the platform itself (a replan sweep). */
export type GateActor = RailActor | null;

export interface ChannelOutcome {
  channel: TruckWindowChannel;
  state: TruckWindowDeliveryState;
  at: string | null;
  reason?: string | null;
  detail?: Record<string, unknown>;
}

export interface RecipientView {
  id: string;
  recipientType: TruckWindowRecipientType;
  recipientLabel: string;
  driverId: string | null;
  delivery: {
    channels: TruckWindowChannel[];
    state: TruckWindowDeliveryState;
    reason: string | null;
    detail: ChannelOutcome[];
    dispatchedAt: string | null;
    deliveredAt: string | null;
  };
  ack: {
    state: 'UNACKED' | 'ACKNOWLEDGED';
    ackedAt: string | null;
    /** Client-reported; labelled device-reported wherever it is shown. */
    ackDeviceAt: string | null;
    source: TruckWindowAckSource | null;
    byLabel: string | null;
    latencyMinutes: number | null;
  };
  escalation: {
    stage: TruckWindowEscalation;
    ackDueMinutes: number;
    minutesSinceChange: number;
    minutesUntilDue: number;
    overdue: boolean;
    reminderDue: boolean;
    escalationDue: boolean;
    /** Human text, already rounded honestly (never "0 min" for a sub-minute gap). */
    sinceChange: string;
  };
}

export interface WindowChangeView {
  id: string;
  appointmentId: string;
  version: number;
  changeKind: TruckWindowChangeKind;
  status: 'ACTIVE' | 'SUPERSEDED';
  previousWindow: { start: string; end: string; text: string };
  newWindow: { start: string; end: string; text: string } | null;
  reason: string | null;
  forced: boolean;
  insideCutoff: boolean;
  cutoffHours: number;
  truckStatusAtChange: TruckAppointmentStatus;
  windowAlreadyClosed: boolean;
  changedAt: string;
  changedBy: { id: string | null; email: string | null; role: string | null } | null;
  supersededAt: string | null;
  appointment: {
    id: string;
    terminalName: string;
    haulierName: string;
    vehicleReg: string;
    driverName: string | null;
    driverId: string | null;
    status: TruckAppointmentStatus;
    windowStart: string;
    windowEnd: string;
    windowVersion: number;
    arrivedAt: string | null;
  };
  recipients: RecipientView[];
  /** True when a replayed idempotency key returned the original change. */
  idempotentReplay?: boolean;
}

@Injectable()
export class RailTruckWindowChangesService {
  private readonly logger = new Logger(RailTruckWindowChangesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gateway: EventsGateway,
    private readonly push: PushService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
  ) {}

  // ── Tenant-scoped reads ────────────────────────────────────────────────────

  private async ownedAppointment(companyId: string, appointmentId: string) {
    const appt = await this.prisma.terminalTruckAppointment.findFirst({
      where: { id: appointmentId, companyId },
      include: { driver: { select: { id: true, name: true, companyId: true } } },
    });
    // A missing appointment and another tenant's appointment are the same
    // answer: 404. Existence is not information a cross-tenant caller gets.
    if (!appt) throw new NotFoundException('Truck appointment not found');
    return appt;
  }

  private async ownedChange(companyId: string, changeId: string) {
    const change = await this.prisma.terminalTruckWindowChange.findFirst({
      where: { id: changeId, companyId },
      include: { recipients: true, appointment: true },
    });
    if (!change) throw new NotFoundException('Window change not found');
    return change;
  }

  // ── Publishing a window change ─────────────────────────────────────────────

  /**
   * Publish a new window version. The single entry point for every window
   * change in the system — reschedule, day replan and cancellation all come
   * through here, so there is exactly one place where a window can move.
   */
  async publishWindowChange(opts: {
    companyId: string;
    appointmentId: string;
    kind: TruckWindowChangeKind;
    newWindowStart?: Date | null;
    newWindowEnd?: Date | null;
    reason?: string | null;
    force?: boolean;
    actor?: GateActor;
    idempotencyKey?: string | null;
    now?: Date;
  }): Promise<WindowChangeView> {
    const now = opts.now ?? new Date();
    const companyId = opts.companyId;

    // 0. AUTHORITY — checked first, before the idempotency lookup and before
    //    the appointment is read, so a caller without the window-change
    //    permission learns nothing about whether the appointment exists. The
    //    refusal is audited: "who tried to move my window" is a question a
    //    terminal asks after the fact, and it deserves an answer.
    try {
      assertWindowChangeAuthority(opts.actor);
    } catch (err) {
      await this.recordAuthorityRefusal(companyId, opts, err, now);
      throw err;
    }

    // 1. Duplicate submit → the ORIGINAL change, not a second version.
    if (opts.idempotencyKey) {
      const existing = await this.prisma.terminalTruckWindowChange.findFirst({
        where: { companyId, idempotencyKey: opts.idempotencyKey },
      });
      if (existing) {
        const view = await this.getChange(companyId, existing.id, now);
        return { ...view, idempotentReplay: true };
      }
    }

    const appt = await this.ownedAppointment(companyId, opts.appointmentId);
    const cutoffHours = await readGateCutoffHours(this.prisma, companyId);

    // 2. Governance. A refusal is audited — an operator later needs to be able
    //    to prove the change was attempted and why it was not applied.
    const assessment = assessWindowChange({
      status: appt.status,
      windowStart: appt.windowStart,
      windowEnd: appt.windowEnd,
      now,
      cutoffHours,
      reason: opts.reason,
      force: opts.force,
      newWindowStart: opts.kind === 'CANCELLED' ? undefined : opts.newWindowStart,
      newWindowEnd: opts.kind === 'CANCELLED' ? undefined : opts.newWindowEnd,
    });
    // Explicit literal comparison: `!x.allowed` does not narrow a union whose
    // discriminant is a boolean literal, and an unnarrowed `assessment.code`
    // would compile only by accident.
    if (assessment.allowed === false) {
      await this.recordRefusal(companyId, appt, opts, assessment.code, assessment.message, now);
      // The code travels in the body as well as the prose: a client (the driver
      // portal's offline outbox in particular) must be able to tell SUPERSEDED
      // from a governance refusal without parsing a sentence.
      throw new ConflictException({ code: assessment.code, message: assessment.message });
    }

    const reason = opts.reason?.trim() || null;
    const newStart = opts.kind === 'CANCELLED' ? null : (opts.newWindowStart as Date);
    const newEnd = opts.kind === 'CANCELLED' ? null : (opts.newWindowEnd as Date);

    // 3. Recipients are resolved BEFORE the transaction so a driver from
    //    another tenant can never be addressed: the appointment's own tenant
    //    scope is what makes the driver link trustworthy.
    const driver = appt.driver && appt.driver.companyId === companyId ? appt.driver : null;
    const shareValidity = assessShareToken(appt, now);
    const gatePolicy = resolveAckPolicy(
      await this.prisma.terminalGatePolicy.findFirst({
        where: { companyId, terminalName: { equals: appt.terminalName, mode: 'insensitive' } },
      }),
    );

    // 4. One transaction: supersede the previous ACTIVE version, insert the new
    //    one, move the appointment's window, and create the recipient rows.
    //    withTenant sets the RLS context so the new tables' policies are live
    //    for these writes rather than stepped aside.
    const created = await this.prisma.withTenant(companyId, async (tx) => {
      const highest = await tx.terminalTruckWindowChange.aggregate({
        where: { companyId, appointmentId: appt.id },
        _max: { version: true },
      });
      const version = nextVersion(highest._max.version);

      const superseded = await tx.terminalTruckWindowChange.updateMany({
        where: { companyId, appointmentId: appt.id, status: 'ACTIVE' },
        data: {
          status: 'SUPERSEDED',
          activeAppointmentId: null,
          supersededAt: now,
          supersededById: opts.actor?.id ?? null,
        },
      });

      const change = await tx.terminalTruckWindowChange.create({
        data: {
          companyId,
          appointmentId: appt.id,
          version,
          changeKind: opts.kind,
          status: 'ACTIVE',
          activeAppointmentId: appt.id,
          previousWindowStart: appt.windowStart,
          previousWindowEnd: appt.windowEnd,
          newWindowStart: newStart,
          newWindowEnd: newEnd,
          reason,
          forced: assessment.forced,
          insideCutoff: assessment.insideCutoff,
          cutoffHours,
          truckStatusAtChange: appt.status,
          windowAlreadyClosed: assessment.windowAlreadyClosed,
          changedById: opts.actor?.id ?? null,
          changedByEmail: opts.actor?.email ?? null,
          changedByRole: opts.actor?.role ? String(opts.actor.role) : null,
          changedAt: now,
          idempotencyKey: opts.idempotencyKey ?? null,
        },
      });

      await tx.terminalTruckAppointment.update({
        where: { id: appt.id },
        data: {
          windowVersion: version + 1,
          ...(newStart && newEnd ? { windowStart: newStart, windowEnd: newEnd } : {}),
          ...(opts.kind === 'CANCELLED' ? { status: TruckAppointmentStatus.CANCELLED } : {}),
          note: appendChangeMarker(appt.note, opts.kind, version, appt.windowStart, appt.windowEnd, newStart, newEnd, reason, now),
        },
      });

      await tx.terminalTruckWindowRecipient.createMany({
        data: [
          {
            companyId,
            changeId: change.id,
            appointmentId: appt.id,
            recipientType: TruckWindowRecipientType.HAULIER,
            recipientKey: 'HAULIER',
            recipientLabel: appt.haulierName,
            driverId: null,
            deliveryState: TruckWindowDeliveryState.QUEUED,
            ackState: 'UNACKED',
            ackDueMinutes: gatePolicy.ackDueMinutes,
          },
          {
            companyId,
            changeId: change.id,
            appointmentId: appt.id,
            recipientType: TruckWindowRecipientType.DRIVER,
            recipientKey: driver ? `DRIVER:${driver.id}` : 'DRIVER:UNASSIGNED',
            recipientLabel: driver ? driver.name : 'DRIVER NOT ASSIGNED',
            driverId: driver?.id ?? null,
            deliveryState: TruckWindowDeliveryState.QUEUED,
            ackState: 'UNACKED',
            ackDueMinutes: gatePolicy.ackDueMinutes,
          },
        ],
      });

      // The outbox row is written in the SAME transaction as the change, so a
      // crash between commit and delivery cannot lose the event.
      await this.outbox.enqueue(tx as any, companyId, 'rail.truck_window.changed', {
        appointmentId: appt.id,
        changeId: change.id,
        version,
        changeKind: opts.kind,
        terminalName: appt.terminalName,
        haulierName: appt.haulierName,
        vehicleReg: appt.vehicleReg,
        previousWindow: { start: appt.windowStart, end: appt.windowEnd },
        newWindow: newStart && newEnd ? { start: newStart, end: newEnd } : null,
        reason,
        forced: assessment.forced,
        driverAssigned: Boolean(driver),
      });

      return { change, version, supersededCount: superseded.count };
    });

    // 5. Propagate. AFTER commit: a rolled-back change must never be announced.
    //    Best-effort by design — a notification failure is recorded on the
    //    recipient row, it does not undo a window the operator published.
    const recipients = await this.prisma.terminalTruckWindowRecipient.findMany({
      where: { changeId: created.change.id },
    });
    await this.propagate({
      companyId,
      appt,
      change: created.change,
      recipients,
      driver,
      shareValidity,
      now,
    });

    await this.recordChangeAudit(companyId, opts.actor ?? null, created.change, appt, created.version, created.supersededCount);

    return this.getChange(companyId, created.change.id, now);
  }

  /**
   * Record a cancellation of a BOOKED window as a versioned change.
   *
   * A cancelled window is the most important thing a haulier can be told, so
   * it goes through the same event + acknowledgement loop as a move. Cancels
   * from ARRIVED / LOADING are plain status transitions (the window already
   * happened — there is no future window to supersede) and are handled by the
   * appointments service without creating a change event.
   */
  async recordCancellation(opts: {
    companyId: string;
    appointmentId: string;
    reason?: string | null;
    force?: boolean;
    actor?: GateActor;
    idempotencyKey?: string | null;
    now?: Date;
  }): Promise<WindowChangeView> {
    return this.publishWindowChange({ ...opts, kind: TruckWindowChangeKind.CANCELLED });
  }

  // ── Propagation over the rails that already exist ──────────────────────────

  private async propagate(params: {
    companyId: string;
    appt: { id: string; terminalName: string; haulierName: string; vehicleReg: string; status: string };
    change: { id: string; version: number; changeKind: TruckWindowChangeKind; newWindowStart: Date | null; newWindowEnd: Date | null; previousWindowStart: Date; previousWindowEnd: Date; reason: string | null; changedAt: Date };
    recipients: any[];
    driver: { id: string; name: string } | null;
    shareValidity: ReturnType<typeof assessShareToken>;
    now: Date;
  }): Promise<void> {
    const { companyId, appt, change, recipients, driver, shareValidity, now } = params;
    const haulier = recipients.find((r) => r.recipientType === TruckWindowRecipientType.HAULIER);
    const driverRow = recipients.find((r) => r.recipientType === TruckWindowRecipientType.DRIVER);

    const headline = describeChange(change, appt);

    // ── HAULIER ──────────────────────────────────────────────────────────────
    if (haulier) {
      const outcomes: ChannelOutcome[] = [];

      // Share link: a PULL channel. Publishing to it is not sending to the
      // haulier, so the honest state is PUBLISHED — never SENT.
      if (shareValidity.state === 'VALID') {
        outcomes.push({ channel: TruckWindowChannel.SHARE_LINK, state: TruckWindowDeliveryState.PUBLISHED, at: now.toISOString() });
      } else if (shareValidity.state === 'LEGACY_NO_EXPIRY') {
        outcomes.push({
          channel: TruckWindowChannel.SHARE_LINK, state: TruckWindowDeliveryState.PUBLISHED, at: now.toISOString(),
          reason: 'SHARE_LINK_NO_EXPIRY',
          detail: { note: 'Link predates expiry enforcement: readable, but it cannot be used to acknowledge.' },
        });
      } else if (shareValidity.state === 'EXPIRED') {
        outcomes.push({
          channel: TruckWindowChannel.SHARE_LINK, state: TruckWindowDeliveryState.UNAVAILABLE, at: null,
          reason: DELIVERY_UNAVAILABLE_REASON.SHARE_TOKEN_EXPIRED,
        });
      } else {
        outcomes.push({
          channel: TruckWindowChannel.SHARE_LINK, state: TruckWindowDeliveryState.UNAVAILABLE, at: null,
          reason: DELIVERY_UNAVAILABLE_REASON.NO_SHARE_TOKEN,
        });
      }

      // Realtime to the tenant's own sessions, with a transport receipt.
      try {
        const receipt = await this.gateway.emitToCompanyWithReceipt(companyId, 'truck-window-changed', {
          appointmentId: appt.id,
          changeId: change.id,
          version: change.version,
          changeKind: change.changeKind,
          terminalName: appt.terminalName,
          haulierName: appt.haulierName,
          vehicleReg: appt.vehicleReg,
          previousWindow: { start: change.previousWindowStart, end: change.previousWindowEnd },
          newWindow: change.newWindowStart && change.newWindowEnd ? { start: change.newWindowStart, end: change.newWindowEnd } : null,
          reason: change.reason,
          changedAt: change.changedAt,
        });
        outcomes.push({
          channel: TruckWindowChannel.REALTIME,
          // A receipt is transport-level confirmation from a browser: DELIVERED.
          // Dispatched with no receipt is SENT and nothing more.
          state: receipt.receipts > 0 ? TruckWindowDeliveryState.DELIVERED : TruckWindowDeliveryState.SENT,
          at: now.toISOString(),
          reason: receipt.receipts > 0 ? null : DELIVERY_UNAVAILABLE_REASON.NO_SOCKET_RECEIPT,
          detail: { connectedClients: receipt.connectedClients, receipts: receipt.receipts },
        });
      } catch (err: any) {
        outcomes.push({
          channel: TruckWindowChannel.REALTIME, state: TruckWindowDeliveryState.FAILED, at: null,
          reason: 'REALTIME_EMIT_FAILED', detail: { message: err?.message ?? String(err) },
        });
      }

      // Tenant notification bell.
      try {
        await this.notifications.broadcast(
          companyId,
          change.changeKind === TruckWindowChangeKind.CANCELLED
            ? `Gate window cancelled · ${appt.vehicleReg}`
            : `Gate window changed (v${change.version}) · ${appt.vehicleReg}`,
          headline,
          'TRUCK_WINDOW_CHANGE',
          `/rail?tab=truck-appointments&change=${change.id}`,
        );
        outcomes.push({ channel: TruckWindowChannel.IN_APP, state: TruckWindowDeliveryState.SENT, at: now.toISOString() });
      } catch (err: any) {
        outcomes.push({
          channel: TruckWindowChannel.IN_APP, state: TruckWindowDeliveryState.FAILED, at: null,
          reason: 'IN_APP_WRITE_FAILED', detail: { message: err?.message ?? String(err) },
        });
      }

      // Webhook event (enqueued inside the change transaction).
      outcomes.push({ channel: TruckWindowChannel.WEBHOOK, state: TruckWindowDeliveryState.SENT, at: now.toISOString() });

      await this.applyDelivery(companyId, haulier.id, outcomes, now);
    }

    // ── DRIVER ───────────────────────────────────────────────────────────────
    if (driverRow) {
      const outcomes: ChannelOutcome[] = [];

      if (!driver) {
        // No assigned driver: state the absence. Never fabricate a recipient.
        outcomes.push({
          channel: TruckWindowChannel.NONE, state: TruckWindowDeliveryState.UNAVAILABLE, at: null,
          reason: DELIVERY_UNAVAILABLE_REASON.DRIVER_NOT_ASSIGNED,
        });
      } else {
        // The driver portal's own gate list is a pull channel the driver
        // controls (polled, and cached offline) — PUBLISHED, not SENT.
        outcomes.push({ channel: TruckWindowChannel.DRIVER_PORTAL, state: TruckWindowDeliveryState.PUBLISHED, at: now.toISOString() });

        try {
          const wake = await this.push.wakeDriver(driver.id);
          if (!wake.enabled) {
            outcomes.push({
              channel: TruckWindowChannel.PUSH, state: TruckWindowDeliveryState.UNAVAILABLE, at: null,
              reason: DELIVERY_UNAVAILABLE_REASON.PUSH_NOT_CONFIGURED,
            });
          } else if (wake.subscriptions === 0) {
            outcomes.push({
              channel: TruckWindowChannel.PUSH, state: TruckWindowDeliveryState.UNAVAILABLE, at: null,
              reason: DELIVERY_UNAVAILABLE_REASON.NO_PUSH_SUBSCRIPTION,
            });
          } else if (wake.accepted > 0) {
            // A payload-less tickle the push service accepted. That proves the
            // service took the wake-up — NOT that a device displayed anything.
            outcomes.push({
              channel: TruckWindowChannel.PUSH, state: TruckWindowDeliveryState.SENT, at: now.toISOString(),
              detail: { subscriptions: wake.subscriptions, accepted: wake.accepted, failed: wake.failed, payloadless: true },
            });
          } else {
            outcomes.push({
              channel: TruckWindowChannel.PUSH, state: TruckWindowDeliveryState.FAILED, at: null,
              reason: 'PUSH_SEND_FAILED', detail: { subscriptions: wake.subscriptions, failed: wake.failed },
            });
          }
        } catch (err: any) {
          outcomes.push({
            channel: TruckWindowChannel.PUSH, state: TruckWindowDeliveryState.FAILED, at: null,
            reason: 'PUSH_ERROR', detail: { message: err?.message ?? String(err) },
          });
        }
      }

      await this.applyDelivery(companyId, driverRow.id, outcomes, now);
    }
  }

  /**
   * Collapse per-channel outcomes into the recipient's headline state.
   *
   * This write happens AFTER the change transaction committed (delivery can
   * only be observed once it was attempted), so it opens its own tenant
   * context: `terminal_truck_window_recipients` has FORCE ROW LEVEL SECURITY,
   * and a write with no `app.company_id` would silently match zero rows the
   * moment the database's phase-2 strictness switch is flipped. The where
   * clause scopes the row explicitly as well, so this is double-guarded rather
   * than relying on the policy stepping aside.
   */
  private async applyDelivery(companyId: string, recipientId: string, outcomes: ChannelOutcome[], now: Date) {
    const states = outcomes.map((o) => o.state);
    const headline = bestDeliveryState(states) as TruckWindowDeliveryState;
    const dispatched = outcomes.find((o) => o.at && o.state !== TruckWindowDeliveryState.UNAVAILABLE);
    const delivered = outcomes.find((o) => o.state === TruckWindowDeliveryState.DELIVERED);
    const unavailable = outcomes.find((o) => o.state === TruckWindowDeliveryState.UNAVAILABLE);
    try {
      await this.prisma.withTenant(companyId, (tx) => tx.terminalTruckWindowRecipient.updateMany({
        where: { id: recipientId, companyId },
        data: {
          deliveryChannels: outcomes.map((o) => o.channel),
          deliveryState: headline,
          deliveryReason: headline === TruckWindowDeliveryState.UNAVAILABLE ? (unavailable?.reason ?? null) : null,
          deliveryDetail: JSON.parse(JSON.stringify(outcomes)) as any,
          dispatchedAt: dispatched ? now : null,
          deliveredAt: delivered ? now : null,
        },
      }));
    } catch (err: any) {
      // Delivery bookkeeping must never throw out of the publish path: the
      // window the operator published is the fact that matters.
      this.logger.warn(`Could not record delivery for recipient ${recipientId}: ${err?.message ?? err}`);
    }
  }

  /**
   * Day replan: shift every BOOKED window at one terminal on one day.
   *
   * The late-train case. Each affected appointment gets its own versioned
   * change event with the SAME reason, so every haulier and driver on that day
   * is individually notified and individually trackable — a bulk edit that
   * produced one audit line for forty trucks would tell the terminal nothing
   * about which of the forty actually knew.
   *
   * `reason` is mandatory on the DTO, which satisfies the cut-off rule (a
   * forced change is a change with a recorded reason). Windows that have
   * already closed are SKIPPED and reported as such: publishing a new window
   * into the past would tell a haulier something false, and a silent skip
   * would hide that the day was only partly replanned.
   */
  async replanDay(companyId: string, dto: {
    terminalName: string; date: string; shiftMinutes: number; reason: string;
  }, actor?: GateActor, opts: { now?: Date; idempotencyKey?: string | null } = {}) {
    const now = opts.now ?? new Date();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    if (!dto.shiftMinutes || dto.shiftMinutes === 0) {
      throw new BadRequestException('shiftMinutes must be a non-zero number of minutes');
    }
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('a replan reason is required');

    // Authority for the WHOLE day is decided before a single row is read: an
    // unauthorised caller gets a 403, not a 200 whose `skipped` list happens to
    // contain every truck on the terminal's day. The per-window refusals below
    // stay governance refusals (cut-off, closed window) — that is a different
    // question from "may this person move windows at all".
    try {
      assertWindowChangeAuthority(actor, 'A day replan');
    } catch (err) {
      await this.recordDayReplanAuthorityRefusal(companyId, dto, actor, err, now);
      throw err;
    }

    const dayStart = new Date(`${dto.date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
    const rows = await this.prisma.terminalTruckAppointment.findMany({
      where: {
        companyId,
        terminalName: { equals: dto.terminalName, mode: 'insensitive' },
        status: TruckAppointmentStatus.BOOKED,
        windowStart: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { windowStart: 'asc' },
    });

    const deltaMs = dto.shiftMinutes * 60_000;
    const changes: { appointmentId: string; version: number; changeId: string }[] = [];
    const skipped: { appointmentId: string; vehicleReg: string; reason: string }[] = [];
    let withConflicts = 0;

    for (const r of rows) {
      const windowStart = new Date(new Date(r.windowStart).getTime() + deltaMs);
      const windowEnd = new Date(new Date(r.windowEnd).getTime() + deltaMs);
      try {
        const view = await this.publishWindowChange({
          companyId,
          appointmentId: r.id,
          kind: TruckWindowChangeKind.REPLANNED,
          newWindowStart: windowStart,
          newWindowEnd: windowEnd,
          reason,
          // A replan is by definition a forced, reasoned change: the reason is
          // mandatory on the DTO and is recorded on every event it produces.
          force: true,
          actor: actor ?? null,
          // One key per appointment per replan, so a double-submitted replan
          // cannot publish two versions for the same truck.
          idempotencyKey: opts.idempotencyKey
            ? `${opts.idempotencyKey}:${r.id}`
            : `replan:${dto.date}:${dto.shiftMinutes}:${r.id}`,
          now,
        });
        changes.push({ appointmentId: r.id, version: view.version, changeId: view.id });
        const conflicts = await findGateConflicts(this.prisma, companyId, r.terminalName, windowStart, windowEnd, r.id);
        if (conflicts.length) withConflicts += 1;
      } catch (err: any) {
        // A refusal on one row (window already closed, state moved on) must not
        // abort the rest of the day — but it must be visible, not swallowed.
        skipped.push({
          appointmentId: r.id,
          vehicleReg: r.vehicleReg,
          reason: err?.message ?? String(err),
        });
      }
    }

    if (changes.length || skipped.length) {
      await recordRailAudit(
        this.audit, this.logger,
        actor
          ? railAuditEntry(companyId, actor, RAIL_AUDIT_ACTION.TRUCK_APPOINTMENT_DAY_REPLANNED,
            { type: RAIL_AUDIT_TARGET.TRUCK_APPOINTMENT, id: dto.terminalName, name: dto.terminalName },
            { date: dto.date, shiftMinutes: dto.shiftMinutes, reason, replanned: changes.length, skipped: skipped.length })
          : railSystemAuditEntry(companyId, RAIL_AUDIT_ACTION.TRUCK_APPOINTMENT_DAY_REPLANNED,
            { type: RAIL_AUDIT_TARGET.TRUCK_APPOINTMENT, id: dto.terminalName, name: dto.terminalName },
            { date: dto.date, shiftMinutes: dto.shiftMinutes, reason, replanned: changes.length, skipped: skipped.length }),
      );
    }

    return {
      terminalName: dto.terminalName,
      date: dto.date,
      shiftMinutes: dto.shiftMinutes,
      reason,
      shifted: changes.length,
      withConflicts,
      appointmentIds: changes.map((c) => c.appointmentId),
      changes,
      skipped,
      requestedBy: actor?.id ?? actor?.email ?? null,
    };
  }

  // ── Acknowledgement ────────────────────────────────────────────────────────

  /**
   * Acknowledge a window change.
   *
   * Three credential kinds reach this, and each may only acknowledge its own
   * recipient row:
   *   TENANT_USER   an authenticated tenant user (dispatcher / terminal ops)
   *                 → the HAULIER recipient
   *   DRIVER_PORTAL the assigned driver's own session → the DRIVER recipient
   *   SHARE_TOKEN   a valid, unexpired share token   → the HAULIER recipient
   *
   * A dispatcher confirming is NOT the driver confirming: they are separate rows
   * with separate states, and the board shows both.
   */
  async acknowledge(opts: {
    companyId: string;
    changeId: string;
    source: TruckWindowAckSource;
    /** Required for DRIVER_PORTAL: the driver identity from the token, never from the body. */
    driverId?: string | null;
    actorLabel?: string | null;
    deviceAckedAt?: Date | null;
    idempotencyKey?: string | null;
    now?: Date;
  }): Promise<{ recipient: RecipientView; change: WindowChangeView; idempotentReplay: boolean }> {
    const now = opts.now ?? new Date();
    const change = await this.ownedChange(opts.companyId, opts.changeId);

    const recipientKey =
      opts.source === TruckWindowAckSource.DRIVER_PORTAL
        ? (opts.driverId ? `DRIVER:${opts.driverId}` : null)
        : 'HAULIER';

    if (!recipientKey) {
      // A driver session with no driver identity is a broken token, not a
      // "haulier ack". Refuse rather than attribute it to the wrong recipient.
      throw new BadRequestException('Driver identity is required to acknowledge as a driver');
    }

    const recipient = change.recipients.find((r) => r.recipientKey === recipientKey);
    if (!recipient) {
      // Wrong tenant / wrong driver / a recipient that does not exist on this
      // version: one answer, no existence leak.
      await recordRailAudit(
        this.audit, this.logger,
        railSystemAuditEntry(opts.companyId, RAIL_AUDIT_ACTION.TRUCK_WINDOW_ACK_REJECTED,
          { type: RAIL_AUDIT_TARGET.TRUCK_WINDOW_CHANGE, id: change.id, name: `v${change.version}` },
          { reason: 'NOT_A_RECIPIENT', source: opts.source, requestedRecipientKey: recipientKey }),
      );
      throw new NotFoundException('You are not a recipient of this window change');
    }

    const activeVersion = change.status === 'ACTIVE'
      ? change.version
      : (await this.prisma.terminalTruckWindowChange.findFirst({
        where: { companyId: opts.companyId, appointmentId: change.appointmentId, status: 'ACTIVE' },
        select: { version: true },
      }))?.version ?? null;

    const ack = assessAcknowledgement({
      changeStatus: change.status as 'ACTIVE' | 'SUPERSEDED',
      ackState: recipient.ackState as 'UNACKED' | 'ACKNOWLEDGED',
      activeVersion,
    });

    if (ack.allowed === false) {
      await recordRailAudit(
        this.audit, this.logger,
        railSystemAuditEntry(opts.companyId, RAIL_AUDIT_ACTION.TRUCK_WINDOW_ACK_REJECTED,
          { type: RAIL_AUDIT_TARGET.TRUCK_WINDOW_CHANGE, id: change.id, name: `v${change.version}` },
          { reason: ack.code, source: opts.source, recipientKey, activeVersion }),
      );
      throw new ConflictException({ code: ack.code, message: ack.message, activeVersion });
    }

    if (ack.idempotentReplay) {
      // A replayed offline flush or a double tap: return the original
      // acknowledgement. `ackedAt` is NOT moved — the first confirmation is the
      // fact, and re-stamping it would corrupt the latency measurement.
      const view = await this.getChange(opts.companyId, change.id, now);
      return {
        recipient: view.recipients.find((r) => r.id === recipient.id)!,
        change: view,
        idempotentReplay: true,
      };
    }

    await this.prisma.withTenant(opts.companyId, async (tx) => {
      // Compare-and-set: two concurrent acks (office + driver, or two devices)
      // must produce exactly one acknowledgement.
      const claimed = await tx.terminalTruckWindowRecipient.updateMany({
        where: { id: recipient.id, ackState: 'UNACKED' },
        data: {
          ackState: 'ACKNOWLEDGED',
          ackedAt: now,
          ackDeviceAt: opts.deviceAckedAt ?? null,
          ackSource: opts.source,
          ackedByLabel: opts.actorLabel ?? null,
          ackIdempotencyKey: opts.idempotencyKey ?? null,
          escalation: TruckWindowEscalation.NONE,
        },
      });
      if (claimed.count === 0) return; // the other writer won; their stamp stands
      await this.outbox.enqueue(tx as any, opts.companyId, 'rail.truck_window.acknowledged', {
        changeId: change.id,
        appointmentId: change.appointmentId,
        version: change.version,
        recipientType: recipient.recipientType,
        source: opts.source,
        ackedAt: now,
        deviceAckedAt: opts.deviceAckedAt ?? null,
      });
    });

    await recordRailAudit(
      this.audit, this.logger,
      opts.source === TruckWindowAckSource.SHARE_TOKEN
        // A share-token ack has no tenant user to attribute: record it as the
        // system, naming the credential kind. Attributing it to a person we
        // did not authenticate would be a fabricated audit entry.
        ? railSystemAuditEntry(opts.companyId, RAIL_AUDIT_ACTION.TRUCK_WINDOW_ACKNOWLEDGED,
          { type: RAIL_AUDIT_TARGET.TRUCK_WINDOW_RECIPIENT, id: recipient.id, name: recipient.recipientLabel },
          { changeId: change.id, version: change.version, source: opts.source, recipientKey,
            deviceAckedAt: opts.deviceAckedAt?.toISOString() ?? null })
        : railAuditEntry(opts.companyId, { id: opts.driverId ?? 'system', email: null, name: opts.actorLabel ?? null, role: 'USER' } as RailActor,
          RAIL_AUDIT_ACTION.TRUCK_WINDOW_ACKNOWLEDGED,
          { type: RAIL_AUDIT_TARGET.TRUCK_WINDOW_RECIPIENT, id: recipient.id, name: recipient.recipientLabel },
          { changeId: change.id, version: change.version, source: opts.source, recipientKey,
            deviceAckedAt: opts.deviceAckedAt?.toISOString() ?? null }),
    );

    // Tell the tenant's sessions the loop closed, so the board updates without
    // a manual refresh. Best-effort.
    try {
      this.gateway.emitToCompany(opts.companyId, 'truck-window-acknowledged', {
        changeId: change.id,
        appointmentId: change.appointmentId,
        version: change.version,
        recipientType: recipient.recipientType,
        source: opts.source,
        ackedAt: now,
      });
    } catch (err: any) {
      this.logger.debug(`ack realtime notify failed: ${err?.message ?? err}`);
    }

    const view = await this.getChange(opts.companyId, change.id, now);
    return {
      recipient: view.recipients.find((r) => r.id === recipient.id)!,
      change: view,
      idempotentReplay: false,
    };
  }

  /**
   * Acknowledge behind a share token.
   *
   * The token is the credential, so the token's own rules apply: revoked → 404,
   * expired → 409, and a LEGACY token with no recorded expiry is REFUSED for
   * this mutation (it may still be read). An immortal, unauthenticated link
   * that can write is exactly what the closed loop must not have.
   */
  async acknowledgeByShareToken(token: string, opts: { deviceAckedAt?: Date | null; idempotencyKey?: string | null; now?: Date } = {}) {
    const now = opts.now ?? new Date();
    if (!token || token.length < 16) throw new NotFoundException('Shared appointment not found');
    const appt = await this.prisma.terminalTruckAppointment.findFirst({ where: { shareToken: token } });
    if (!appt) throw new NotFoundException('Shared appointment not found or the link was revoked');

    const validity = assessShareToken(appt, now);
    if (validity.state === 'EXPIRED') {
      throw new ConflictException('This share link has expired. Ask the operator to re-issue it.');
    }
    if (validity.state === 'LEGACY_NO_EXPIRY') {
      throw new ConflictException(
        'This share link was issued before expiry enforcement, so it can be read but not used to confirm a change. ' +
        'Ask the operator to re-issue the link.',
      );
    }

    const active = await this.prisma.terminalTruckWindowChange.findFirst({
      where: { companyId: appt.companyId, appointmentId: appt.id, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (!active) throw new NotFoundException('There is no current window change to confirm on this appointment');

    return this.acknowledge({
      companyId: appt.companyId,
      changeId: active.id,
      source: TruckWindowAckSource.SHARE_TOKEN,
      actorLabel: `Share link (${appt.haulierName})`,
      deviceAckedAt: opts.deviceAckedAt ?? null,
      idempotencyKey: opts.idempotencyKey ?? null,
      now,
    });
  }

  // ── Reads: change detail, history, board ───────────────────────────────────

  async getChange(companyId: string, changeId: string, now: Date = new Date()): Promise<WindowChangeView> {
    const change = await this.prisma.terminalTruckWindowChange.findFirst({
      where: { id: changeId, companyId },
      include: { recipients: true, appointment: true },
    });
    if (!change) throw new NotFoundException('Window change not found');
    await this.refreshEscalation([change], now);
    return this.toView(change, now);
  }

  /** Full version history for one appointment, newest first. */
  async listForAppointment(companyId: string, appointmentId: string, now: Date = new Date()) {
    await this.ownedAppointment(companyId, appointmentId);
    const rows = await this.prisma.terminalTruckWindowChange.findMany({
      where: { companyId, appointmentId },
      include: { recipients: true, appointment: true },
      orderBy: { version: 'desc' },
      take: 100,
    });
    await this.refreshEscalation(rows, now);
    return rows.map((r) => this.toView(r, now));
  }

  async listChanges(companyId: string, filters: {
    status?: string; terminalName?: string; ackState?: string; from?: string; to?: string;
  } = {}, now: Date = new Date()) {
    const where: Prisma.TerminalTruckWindowChangeWhereInput = { companyId };
    if (filters.status) where.status = filters.status as any;
    if (filters.terminalName) where.appointment = { terminalName: { equals: filters.terminalName, mode: 'insensitive' } };
    if (filters.from || filters.to) {
      where.changedAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    if (filters.ackState) where.recipients = { some: { ackState: filters.ackState as any } };

    const rows = await this.prisma.terminalTruckWindowChange.findMany({
      where,
      include: { recipients: true, appointment: true },
      orderBy: { changedAt: 'desc' },
      take: 200,
    });
    await this.refreshEscalation(rows, now);
    return rows.map((r) => this.toView(r, now));
  }

  /**
   * The terminal's acknowledgement board: "does that truck know?" at a glance.
   *
   * Every row is an ACTIVE change with one line per recipient — who confirmed,
   * who has not, how long it has been, and where each sits on the escalation
   * ladder. Counts are computed from the same rows the board displays, so the
   * summary can never disagree with the list underneath it.
   */
  async ackBoard(companyId: string, filters: { terminalName?: string } = {}, now: Date = new Date()) {
    const where: Prisma.TerminalTruckWindowChangeWhereInput = { companyId, status: 'ACTIVE' };
    if (filters.terminalName) where.appointment = { terminalName: { equals: filters.terminalName, mode: 'insensitive' } };

    const rows = await this.prisma.terminalTruckWindowChange.findMany({
      where,
      include: { recipients: true, appointment: true },
      orderBy: { changedAt: 'asc' },
      take: 200,
    });
    await this.refreshEscalation(rows, now);
    const views = rows.map((r) => this.toView(r, now));

    let acknowledged = 0;
    let unacknowledged = 0;
    let stale = 0;
    let escalated = 0;
    let reminderDue = 0;
    let driverNotAssigned = 0;
    let unreachable = 0;
    for (const v of views) {
      for (const r of v.recipients) {
        if (r.recipientType === 'DRIVER' && r.delivery.reason === DELIVERY_UNAVAILABLE_REASON.DRIVER_NOT_ASSIGNED) {
          driverNotAssigned += 1;
        }
        // A recipient with no deliverable channel cannot confirm anything. It is
        // counted on its own line (`unreachable`) and kept OUT of
        // unacknowledged / stale / the escalation counts: an overdue reminder
        // addressed to nobody is noise that trains the terminal to ignore the
        // board, and it would blame a haulier for a missing driver assignment.
        if (r.delivery.state === TruckWindowDeliveryState.UNAVAILABLE) {
          unreachable += 1;
          continue;
        }
        if (r.ack.state === 'ACKNOWLEDGED') acknowledged += 1;
        else {
          unacknowledged += 1;
          if (r.escalation.overdue) stale += 1;
          if (r.escalation.stage === 'ESCALATED') escalated += 1;
          else if (r.escalation.stage === 'REMINDER') reminderDue += 1;
        }
      }
    }

    return {
      terminalName: filters.terminalName ?? null,
      computedAt: now.toISOString(),
      source: 'terminal_truck_window_changes + terminal_truck_window_recipients (this tenant)',
      changes: views.length,
      counts: {
        acknowledged, unacknowledged, stale, escalated, reminderDue, driverNotAssigned,
        /** Recipients with no channel: excluded from every count above. */
        unreachable,
      },
      /** How the counts are built, so the board is auditable from the payload. */
      method: 'A recipient with no deliverable channel (no driver assigned, no share link, push not configured) is counted in `unreachable` and excluded from acknowledged / unacknowledged / stale / escalated. Arrival-free changes are not measured.',
      rows: views,
    };
  }

  /**
   * Recompute the escalation ladder from the clock and persist any movement.
   *
   * On read, not on a schedule — the rail-handshake pattern. A board that only
   * escalates when a cron remembers to run will happily show "all fine" for a
   * change that went quiet an hour ago. Movement is attributed to the system
   * and audited, because the ladder moves with the clock, not with a person.
   */
  private async refreshEscalation(
    changes: { id: string; companyId: string; changedAt: Date; status: string; recipients: any[]; appointment?: { terminalName?: string } | null }[],
    now: Date,
  ): Promise<void> {
    if (!changes.length) return;

    // One policy read for the whole batch, keyed by lowercased terminal name.
    // Per-change lookups here would be an N+1 on a 200-row board.
    const companyIds = [...new Set(changes.map((c) => c.companyId))];
    const policies = await this.prisma.terminalGatePolicy.findMany({
      where: { companyId: { in: companyIds } },
      take: 500,
    });
    const policyByTerminal = new Map(
      policies.map((p) => [`${p.companyId}::${p.terminalName.toLowerCase()}`, p]),
    );

    type Move = {
      companyId: string; id: string; stage: TruckWindowEscalation;
      reminderSentAt?: Date; escalatedAt?: Date;
    };
    const moves: Move[] = [];
    const audits: Promise<unknown>[] = [];
    for (const change of changes) {
      if (change.status !== 'ACTIVE') continue;
      const terminalName = change.appointment?.terminalName ?? '';
      const policy = resolveAckPolicy(policyByTerminal.get(`${change.companyId}::${terminalName.toLowerCase()}`) ?? null);
      for (const r of change.recipients) {
        // A recipient with no channel cannot acknowledge; escalating it would
        // be noise pointing at nobody. It is reported as UNAVAILABLE instead.
        if (r.deliveryState === TruckWindowDeliveryState.UNAVAILABLE) continue;
        const assessed = assessEscalation({
          changedAt: change.changedAt,
          now,
          ackState: r.ackState,
          // ackDueMinutes is frozen on the row at change time.
          ackDueMinutes: r.ackDueMinutes ?? policy.ackDueMinutes,
          reminderAfterMinutes: policy.reminderAfterMinutes,
          escalateAfterMinutes: policy.escalateAfterMinutes,
        });
        const stage = assessed.stage as TruckWindowEscalation;
        if (stage === r.escalation) continue;
        moves.push({
          companyId: change.companyId,
          id: r.id,
          stage,
          ...(stage === 'REMINDER' && !r.reminderSentAt ? { reminderSentAt: now } : {}),
          ...(stage === 'ESCALATED' && !r.escalatedAt ? { escalatedAt: now } : {}),
        });
        audits.push(
          recordRailAudit(
            this.audit, this.logger,
            railSystemAuditEntry(change.companyId, RAIL_AUDIT_ACTION.TRUCK_WINDOW_ESCALATED,
              { type: RAIL_AUDIT_TARGET.TRUCK_WINDOW_RECIPIENT, id: r.id, name: r.recipientLabel },
              { changeId: change.id, from: r.escalation, to: stage, minutesSinceChange: assessed.minutesSinceChange,
                ackDueMinutes: r.ackDueMinutes ?? policy.ackDueMinutes }),
          ),
        );
        r.escalation = stage;
      }
    }
    if (!moves.length) return;

    // One tenant transaction per company, not one per recipient: this runs on
    // read paths (board, KPIs, change detail) and must not open 200
    // transactions on a busy board. `withTenant` sets the RLS context so the
    // write still lands under phase-2 strictness, and `updateMany` scoped by
    // companyId means a vanished recipient row is a no-op rather than a P2025
    // that would 500 the board.
    const byCompany = new Map<string, Move[]>();
    for (const m of moves) {
      const list = byCompany.get(m.companyId);
      if (list) list.push(m); else byCompany.set(m.companyId, [m]);
    }
    await Promise.all(
      [...byCompany.entries()].map(([companyId, list]) => this.prisma.withTenant(companyId, (tx) => Promise.all(
        list.map((m) => tx.terminalTruckWindowRecipient.updateMany({
          where: { id: m.id, companyId },
          data: {
            escalation: m.stage,
            ...(m.reminderSentAt ? { reminderSentAt: m.reminderSentAt } : {}),
            ...(m.escalatedAt ? { escalatedAt: m.escalatedAt } : {}),
          },
        })),
      ))),
    );
    await Promise.all(audits);
  }

  // ── Measurement ────────────────────────────────────────────────────────────

  /**
   * The numbers this feature exists to earn.
   *
   * Every figure carries its numerator, denominator, n, source and freshness.
   * An absent measurement is `null` (rendered UNKNOWN), never 0 — a 0-minute
   * median over n=0 would read as perfection.
   */
  async kpis(companyId: string, filters: { from?: string; to?: string } = {}, now: Date = new Date()) {
    const where: Prisma.TerminalTruckWindowChangeWhereInput = { companyId };
    if (filters.from || filters.to) {
      where.changedAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    const changes = await this.prisma.terminalTruckWindowChange.findMany({
      where,
      include: { recipients: true, appointment: { select: { arrivedAt: true } } },
      orderBy: { changedAt: 'asc' },
      take: 1000,
    });

    // change → ack latency, per recipient, from SERVER-OBSERVED timestamps only.
    // `ackDeviceAt` is deliberately excluded: a device clock is a claim, not a
    // measurement, and mixing the two would make the number indefensible.
    const allSamples: { minutes: number }[] = [];
    const byType: Record<string, { minutes: number }[]> = { HAULIER: [], DRIVER: [] };
    const earliestAckPerChange: { ackedAt: Date | null; arrivedAt: Date | null; reachable: boolean }[] = [];
    // Ack-rate inputs, split by recipient type: a dispatcher confirming for the
    // haulier organisation is not the driver confirming, and merging them would
    // produce one number that describes neither.
    const ackRateInputs: Record<string, { recipientType: string; acknowledged: boolean; reachable: boolean; notAssigned: boolean }[]> = {
      HAULIER: [], DRIVER: [],
    };
    let driverNotAssignedChanges = 0;

    for (const c of changes) {
      let earliest: Date | null = null;
      let anyReachable = false;
      let notAssignedHere = false;
      for (const r of c.recipients) {
        const reachable = r.deliveryState !== TruckWindowDeliveryState.UNAVAILABLE;
        const notAssigned = r.recipientType === TruckWindowRecipientType.DRIVER
          && r.deliveryReason === DELIVERY_UNAVAILABLE_REASON.DRIVER_NOT_ASSIGNED;
        if (notAssigned) notAssignedHere = true;
        if (reachable) anyReachable = true;
        (ackRateInputs[r.recipientType] ??= []).push({
          recipientType: r.recipientType,
          acknowledged: r.ackState === 'ACKNOWLEDGED',
          reachable,
          notAssigned,
        });
        if (r.ackState !== 'ACKNOWLEDGED' || !r.ackedAt) continue;
        const minutes = (new Date(r.ackedAt).getTime() - new Date(c.changedAt).getTime()) / 60_000;
        if (!Number.isFinite(minutes)) continue;
        allSamples.push({ minutes });
        (byType[r.recipientType] ??= []).push({ minutes });
        if (!earliest || new Date(r.ackedAt) < earliest) earliest = new Date(r.ackedAt);
      }
      if (notAssignedHere) driverNotAssignedChanges += 1;
      earliestAckPerChange.push({
        ackedAt: earliest,
        arrivedAt: c.appointment?.arrivedAt ?? null,
        reachable: anyReachable,
      });
    }

    const latency = summariseAckLatency(allSamples);
    const haulierLatency = summariseAckLatency(byType.HAULIER ?? []);
    const driverLatency = summariseAckLatency(byType.DRIVER ?? []);
    const beforeArrival = summariseAckedBeforeArrival(earliestAckPerChange);

    // Stale = an ACTIVE change with at least one reachable recipient past its
    // frozen ack-due time and still UNACKED. Recipients with no channel are
    // counted separately: nobody can acknowledge a notification that was never
    // deliverable, and counting them as "stale" would blame the wrong party.
    let staleUnacked = 0;
    let unreachableRecipients = 0;
    for (const c of changes) {
      if (c.status !== 'ACTIVE') continue;
      for (const r of c.recipients) {
        if (r.deliveryState === TruckWindowDeliveryState.UNAVAILABLE) { unreachableRecipients += 1; continue; }
        if (r.ackState === 'ACKNOWLEDGED') continue;
        const minutes = (now.getTime() - new Date(c.changedAt).getTime()) / 60_000;
        if (minutes >= (r.ackDueMinutes ?? 30)) staleUnacked += 1;
      }
    }

    const window = { from: filters.from ?? null, to: filters.to ?? null };
    const haulierRate = summariseAckRate(ackRateInputs.HAULIER ?? []);
    const driverRate = summariseAckRate(ackRateInputs.DRIVER ?? []);
    return {
      computedAt: now.toISOString(),
      window,
      changesExamined: changes.length,
      /** Changes where no driver was attached — their own count, never a failure. */
      driverNotAssignedChanges,
      source: 'terminal_truck_window_changes + terminal_truck_window_recipients (this tenant only)',
      method: 'change→ack latency uses server-observed ackedAt minus changedAt; device-reported times are excluded from measurement. '
        + 'Acknowledgement rates count only recipients that had a deliverable channel; unreachable recipients (including DRIVER NOT ASSIGNED) are excluded from the denominator and reported separately.',
      ackRate: {
        HAULIER: haulierRate,
        DRIVER: driverRate,
        definition: 'acknowledged / reachable recipients of this type. A recipient with no channel is excluded, not failed.',
      },
      ackLatency: {
        ...latency,
        medianText: formatDurationMinutes(latency.medianMinutes),
        p90Text: formatDurationMinutes(latency.p90Minutes),
        byRecipientType: {
          HAULIER: { ...haulierLatency, medianText: formatDurationMinutes(haulierLatency.medianMinutes), p90Text: formatDurationMinutes(haulierLatency.p90Minutes) },
          DRIVER: { ...driverLatency, medianText: formatDurationMinutes(driverLatency.medianMinutes), p90Text: formatDurationMinutes(driverLatency.p90Minutes) },
        },
      },
      ackedBeforeArrival: {
        ...beforeArrival,
        definition: 'A change counts as acknowledged before arrival when its EARLIEST recipient acknowledgement is at or before the TERMINAL-RECORDED arrival time.',
        arrivalSource: 'terminal_truck_appointments.arrivedAt — a TERMINAL-RECORDED arrival, logged by the terminal operator when the truck is checked in at the gate; not GPS and not a geofence. If nobody recorded an arrival, the change is excluded from the denominator and counted as excluded, never as late.',
        percentText: beforeArrival.percent === null ? 'UNKNOWN' : `${beforeArrival.percent}%`,
      },
      staleUnackedChanges: staleUnacked,
      unreachableRecipients,
    };
  }

  // ── Counterparty + driver views ────────────────────────────────────────────

  /**
   * The haulier's share-link view of the current window change.
   *
   * Deliberately narrow: no tenant id, no booker, no internal note, no driver
   * identity. A counterparty sees what changed, why, what it was before, and
   * whether they have confirmed it — nothing about the operator's business.
   */
  async sharedChangeView(token: string, now: Date = new Date()) {
    if (!token || token.length < 16) throw new NotFoundException('Shared appointment not found');
    const appt = await this.prisma.terminalTruckAppointment.findFirst({ where: { shareToken: token } });
    if (!appt) throw new NotFoundException('Shared appointment not found or the link was revoked');

    const validity = assessShareToken(appt, now);
    const active = await this.prisma.terminalTruckWindowChange.findFirst({
      where: { companyId: appt.companyId, appointmentId: appt.id, status: 'ACTIVE' },
      include: { recipients: true },
      orderBy: { version: 'desc' },
    });
    const history = await this.prisma.terminalTruckWindowChange.findMany({
      where: { companyId: appt.companyId, appointmentId: appt.id, status: 'SUPERSEDED' },
      orderBy: { version: 'desc' },
      take: 10,
      select: {
        version: true, changeKind: true, previousWindowStart: true, previousWindowEnd: true,
        newWindowStart: true, newWindowEnd: true, reason: true, changedAt: true,
      },
    });

    const haulier = active?.recipients.find((r) => r.recipientType === TruckWindowRecipientType.HAULIER) ?? null;

    return {
      link: {
        expiresAt: validity.state === 'VALID' ? (validity.expiresAt as Date).toISOString() : null,
        expired: validity.state === 'EXPIRED',
        // A legacy link can be read but cannot confirm. The UI must say so
        // rather than showing a confirm button that will always fail.
        canAcknowledge: validity.state === 'VALID',
        reason: validity.state === 'LEGACY_NO_EXPIRY'
          ? 'This link was issued before expiry enforcement. It can be read but not used to confirm a change — ask the operator to re-issue it.'
          : null,
      },
      change: active
        ? {
          id: active.id,
          version: active.version,
          changeKind: active.changeKind,
          changedAt: active.changedAt.toISOString(),
          reason: active.reason,
          forced: active.forced,
          previousWindow: { start: active.previousWindowStart, end: active.previousWindowEnd, text: formatWindow(active.previousWindowStart, active.previousWindowEnd) },
          newWindow: active.newWindowStart && active.newWindowEnd
            ? { start: active.newWindowStart, end: active.newWindowEnd, text: formatWindow(active.newWindowStart, active.newWindowEnd) }
            : null,
          acknowledged: haulier?.ackState === 'ACKNOWLEDGED',
          acknowledgedAt: haulier?.ackedAt ? new Date(haulier.ackedAt).toISOString() : null,
        }
        : null,
      superseded: history.map((h) => ({
        version: h.version,
        changeKind: h.changeKind,
        changedAt: new Date(h.changedAt).toISOString(),
        reason: h.reason,
        previousWindowText: formatWindow(h.previousWindowStart, h.previousWindowEnd),
        newWindowText: h.newWindowStart && h.newWindowEnd ? formatWindow(h.newWindowStart, h.newWindowEnd) : null,
      })),
    };
  }

  /**
   * The assigned driver's gate windows, for the driver portal.
   *
   * Scoped by the driver identity taken from the token — never a client-supplied
   * id — and by the driver's own tenant. Returns the ACTIVE change per
   * appointment so the driver sees one current window, with the superseded
   * values alongside so "they moved it twice" is visible rather than confusing.
   */
  async driverGateWindows(driverId: string, companyId: string, now: Date = new Date()) {
    const appointments = await this.prisma.terminalTruckAppointment.findMany({
      where: { driverId, companyId, status: { in: ['BOOKED', 'ARRIVED', 'LOADING'] as any } },
      orderBy: { windowStart: 'asc' },
      take: 50,
    });
    if (!appointments.length) return { computedAt: now.toISOString(), items: [] };

    const changes = await this.prisma.terminalTruckWindowChange.findMany({
      where: { companyId, appointmentId: { in: appointments.map((a) => a.id) } },
      include: { recipients: true },
      orderBy: { version: 'desc' },
      take: 200,
    });

    return {
      computedAt: now.toISOString(),
      source: 'gate windows assigned to this driver in this tenant',
      items: appointments.map((a) => {
        const rows = changes.filter((c) => c.appointmentId === a.id);
        const active = rows.find((c) => c.status === 'ACTIVE') ?? null;
        const recipient = active?.recipients.find(
          (r) => r.recipientType === TruckWindowRecipientType.DRIVER && r.driverId === driverId,
        ) ?? null;
        return {
          appointmentId: a.id,
          terminalName: a.terminalName,
          haulierName: a.haulierName,
          vehicleReg: a.vehicleReg,
          purpose: a.purpose,
          status: a.status,
          windowVersion: a.windowVersion,
          currentWindow: { start: a.windowStart, end: a.windowEnd, text: formatWindow(a.windowStart, a.windowEnd) },
          change: active
            ? {
              id: active.id,
              version: active.version,
              changeKind: active.changeKind,
              changedAt: new Date(active.changedAt).toISOString(),
              reason: active.reason,
              previousWindow: { start: active.previousWindowStart, end: active.previousWindowEnd, text: formatWindow(active.previousWindowStart, active.previousWindowEnd) },
              newWindow: active.newWindowStart && active.newWindowEnd
                ? { start: active.newWindowStart, end: active.newWindowEnd, text: formatWindow(active.newWindowStart, active.newWindowEnd) }
                : null,
              acknowledged: recipient?.ackState === 'ACKNOWLEDGED',
              acknowledgedAt: recipient?.ackedAt ? new Date(recipient.ackedAt).toISOString() : null,
              /** Device-reported time, when this ack came from an offline flush. */
              acknowledgedDeviceAt: recipient?.ackDeviceAt ? new Date(recipient.ackDeviceAt).toISOString() : null,
            }
            : null,
          supersededCount: rows.filter((c) => c.status === 'SUPERSEDED').length,
        };
      }),
    };
  }

  // ── Per-terminal acknowledgement policy ────────────────────────────────────

  async listGatePolicies(companyId: string) {
    const rows = await this.prisma.terminalGatePolicy.findMany({
      where: { companyId },
      orderBy: { terminalName: 'asc' },
      take: 200,
    });
    return {
      defaults: { ...resolveAckPolicy(null), source: 'DEFAULT' as const },
      policies: rows.map((r) => ({
        terminalName: r.terminalName,
        ackDueMinutes: r.ackDueMinutes,
        reminderAfterMinutes: r.reminderAfterMinutes,
        escalateAfterMinutes: r.escalateAfterMinutes,
        updatedAt: r.updatedAt,
      })),
    };
  }

  async upsertGatePolicy(companyId: string, terminalName: string, dto: {
    ackDueMinutes: number; reminderAfterMinutes: number; escalateAfterMinutes: number;
  }, actor?: GateActor) {
    // The thresholds decide when a terminal is told that a truck does not know.
    // Loosening them silently hides overdue changes, so this needs the same
    // authority as moving a window — not mere rail-write.
    assertWindowChangeAuthority(actor, 'Changing the acknowledgement thresholds');
    const name = terminalName.trim();
    if (!name) throw new BadRequestException('terminalName is required');
    if (dto.reminderAfterMinutes > dto.ackDueMinutes) {
      throw new BadRequestException('reminderAfterMinutes must not be later than ackDueMinutes');
    }
    if (dto.ackDueMinutes > dto.escalateAfterMinutes) {
      throw new BadRequestException('escalateAfterMinutes must not be earlier than ackDueMinutes');
    }
    // Inside a tenant context: `terminal_gate_policies` is RLS-forced, and an
    // upsert with no context would both miss the existing row and fail the
    // policy's WITH CHECK on insert once phase-2 strictness is on.
    const row = await this.prisma.withTenant(companyId, (tx) => tx.terminalGatePolicy.upsert({
      where: { companyId_terminalName: { companyId, terminalName: name } },
      update: { ...dto, updatedById: actor?.id ?? null },
      create: { companyId, terminalName: name, ...dto, updatedById: actor?.id ?? null },
    }));
    await recordRailAudit(
      this.audit, this.logger,
      actor
        ? railAuditEntry(companyId, actor, RAIL_AUDIT_ACTION.TRUCK_GATE_POLICY_UPDATED,
          { type: RAIL_AUDIT_TARGET.TRUCK_GATE_POLICY, id: row.id, name }, { ...dto })
        : railSystemAuditEntry(companyId, RAIL_AUDIT_ACTION.TRUCK_GATE_POLICY_UPDATED,
          { type: RAIL_AUDIT_TARGET.TRUCK_GATE_POLICY, id: row.id, name }, { ...dto }),
    );
    return row;
  }

  // ── Audit + view mapping ───────────────────────────────────────────────────

  /**
   * Audit a refused day replan. The target is the terminal-day rather than one
   * appointment, because that is what the caller asked to move; `id` is a
   * constant marker and `name` carries the specifics.
   */
  private async recordDayReplanAuthorityRefusal(
    companyId: string,
    dto: { terminalName: string; date: string; shiftMinutes: number; reason?: string | null },
    actor: GateActor,
    err: unknown,
    now: Date,
  ) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = {
      code: 'AUTHORITY_DENIED',
      message,
      kind: TruckWindowChangeKind.REPLANNED,
      attemptedRole: actor?.role ? String(actor.role) : null,
      terminalName: dto.terminalName,
      date: dto.date,
      shiftMinutes: dto.shiftMinutes,
      requestedReason: dto.reason ?? null,
      at: now.toISOString(),
    };
    const target = {
      type: RAIL_AUDIT_TARGET.TRUCK_APPOINTMENT,
      id: 'day-replan',
      name: `${dto.terminalName} ${dto.date}`,
    };
    await recordRailAudit(
      this.audit, this.logger,
      actor
        ? railAuditEntry(companyId, actor, RAIL_AUDIT_ACTION.TRUCK_WINDOW_CHANGE_REJECTED, target, detail)
        : railSystemAuditEntry(companyId, RAIL_AUDIT_ACTION.TRUCK_WINDOW_CHANGE_REJECTED, target, detail),
    );
  }

  /**
   * Audit an authority refusal. The attempt itself is the fact worth keeping:
   * who tried to move a published gate window without holding the permission,
   * with which role, against which appointment, and when.
   */
  private async recordAuthorityRefusal(
    companyId: string,
    opts: { appointmentId: string; kind: TruckWindowChangeKind; actor?: GateActor; reason?: string | null },
    err: unknown,
    now: Date,
  ) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = {
      code: 'AUTHORITY_DENIED',
      message,
      kind: opts.kind,
      attemptedRole: opts.actor?.role ? String(opts.actor.role) : null,
      requestedReason: opts.reason ?? null,
      at: now.toISOString(),
    };
    const target = { type: RAIL_AUDIT_TARGET.TRUCK_APPOINTMENT, id: opts.appointmentId, name: null };
    await recordRailAudit(
      this.audit, this.logger,
      opts.actor
        ? railAuditEntry(companyId, opts.actor, RAIL_AUDIT_ACTION.TRUCK_WINDOW_CHANGE_REJECTED, target, detail)
        : railSystemAuditEntry(companyId, RAIL_AUDIT_ACTION.TRUCK_WINDOW_CHANGE_REJECTED, target, detail),
    );
  }

  private async recordRefusal(
    companyId: string,
    appt: { id: string; terminalName: string; vehicleReg: string; status: string },
    opts: { kind: TruckWindowChangeKind; actor?: GateActor; reason?: string | null },
    code: string,
    message: string,
    now: Date,
  ) {
    await recordRailAudit(
      this.audit, this.logger,
      opts.actor
        ? railAuditEntry(companyId, opts.actor, RAIL_AUDIT_ACTION.TRUCK_WINDOW_CHANGE_REJECTED,
          { type: RAIL_AUDIT_TARGET.TRUCK_APPOINTMENT, id: appt.id, name: appt.vehicleReg },
          { code, message, kind: opts.kind, terminalName: appt.terminalName, truckStatus: appt.status, at: now.toISOString() })
        : railSystemAuditEntry(companyId, RAIL_AUDIT_ACTION.TRUCK_WINDOW_CHANGE_REJECTED,
          { type: RAIL_AUDIT_TARGET.TRUCK_APPOINTMENT, id: appt.id, name: appt.vehicleReg },
          { code, message, kind: opts.kind, terminalName: appt.terminalName, truckStatus: appt.status, at: now.toISOString() }),
    );
  }

  private async recordChangeAudit(
    companyId: string,
    actor: GateActor,
    change: { id: string; version: number; changeKind: TruckWindowChangeKind; previousWindowStart: Date; previousWindowEnd: Date; newWindowStart: Date | null; newWindowEnd: Date | null; reason: string | null; forced: boolean; insideCutoff: boolean },
    appt: { id: string; vehicleReg: string; terminalName: string },
    version: number,
    supersededCount: number,
  ) {
    const metadata = {
      version,
      kind: change.changeKind,
      supersededCount,
      from: formatWindow(change.previousWindowStart, change.previousWindowEnd),
      to: change.newWindowStart && change.newWindowEnd ? formatWindow(change.newWindowStart, change.newWindowEnd) : null,
      reason: change.reason,
      forced: change.forced,
      insideCutoff: change.insideCutoff,
      terminalName: appt.terminalName,
    };
    await recordRailAudit(
      this.audit, this.logger,
      actor
        ? railAuditEntry(companyId, actor, RAIL_AUDIT_ACTION.TRUCK_WINDOW_CHANGED,
          { type: RAIL_AUDIT_TARGET.TRUCK_WINDOW_CHANGE, id: change.id, name: `v${version}` }, metadata)
        : railSystemAuditEntry(companyId, RAIL_AUDIT_ACTION.TRUCK_WINDOW_CHANGED,
          { type: RAIL_AUDIT_TARGET.TRUCK_WINDOW_CHANGE, id: change.id, name: `v${version}` }, metadata),
    );
  }

  private toView(change: any, now: Date): WindowChangeView {
    const isActive = change.status === 'ACTIVE';
    const recipients: RecipientView[] = (change.recipients ?? []).map((r: any) => {
      const ackedAt = r.ackedAt ? new Date(r.ackedAt) : null;
      const latencyMinutes = ackedAt
        ? Math.round(((ackedAt.getTime() - new Date(change.changedAt).getTime()) / 60_000) * 10) / 10
        : null;
      // Minutes since the change, floored at 0: a client clock ahead of the
      // server must not produce a negative "time since change".
      const minutesSinceChange = Math.max(
        0,
        Math.floor((now.getTime() - new Date(change.changedAt).getTime()) / 60_000),
      );
      const ackDueMinutes = typeof r.ackDueMinutes === 'number' ? r.ackDueMinutes : 30;
      const reachable = r.deliveryState !== TruckWindowDeliveryState.UNAVAILABLE;
      const stillOwed = isActive && r.ackState !== 'ACKNOWLEDGED' && reachable;
      const detail = Array.isArray(r.deliveryDetail) ? (r.deliveryDetail as ChannelOutcome[]) : [];
      return {
        id: r.id,
        recipientType: r.recipientType,
        recipientLabel: r.recipientLabel,
        driverId: r.driverId ?? null,
        delivery: {
          channels: r.deliveryChannels ?? [],
          state: r.deliveryState,
          reason: r.deliveryReason ?? null,
          detail,
          dispatchedAt: r.dispatchedAt ? new Date(r.dispatchedAt).toISOString() : null,
          deliveredAt: r.deliveredAt ? new Date(r.deliveredAt).toISOString() : null,
        },
        ack: {
          state: r.ackState,
          ackedAt: ackedAt ? ackedAt.toISOString() : null,
          ackDeviceAt: r.ackDeviceAt ? new Date(r.ackDeviceAt).toISOString() : null,
          source: r.ackSource ?? null,
          byLabel: r.ackedByLabel ?? null,
          latencyMinutes,
        },
        escalation: {
          // The PERSISTED stage is the truth. `refreshEscalation` runs before
          // this mapping and moves it against the terminal's own policy, so the
          // view never invents a rung the ladder has not actually recorded —
          // and a superseded version's recipients stay NONE, because an
          // obligation on a window that no longer exists is not an open item.
          stage: r.escalation,
          ackDueMinutes,
          minutesSinceChange,
          minutesUntilDue: ackDueMinutes - minutesSinceChange,
          overdue: stillOwed && minutesSinceChange >= ackDueMinutes,
          reminderDue: stillOwed && r.escalation !== TruckWindowEscalation.NONE,
          escalationDue: stillOwed && r.escalation === TruckWindowEscalation.ESCALATED,
          sinceChange: formatDurationMinutes(minutesSinceChange),
        },
      };
    });

    const appt = change.appointment;
    return {
      id: change.id,
      appointmentId: change.appointmentId,
      version: change.version,
      changeKind: change.changeKind,
      status: change.status,
      previousWindow: {
        start: new Date(change.previousWindowStart).toISOString(),
        end: new Date(change.previousWindowEnd).toISOString(),
        text: formatWindow(change.previousWindowStart, change.previousWindowEnd),
      },
      newWindow: change.newWindowStart && change.newWindowEnd
        ? {
          start: new Date(change.newWindowStart).toISOString(),
          end: new Date(change.newWindowEnd).toISOString(),
          text: formatWindow(change.newWindowStart, change.newWindowEnd),
        }
        : null,
      reason: change.reason ?? null,
      forced: change.forced,
      insideCutoff: change.insideCutoff,
      cutoffHours: change.cutoffHours,
      truckStatusAtChange: change.truckStatusAtChange,
      windowAlreadyClosed: change.windowAlreadyClosed,
      changedAt: new Date(change.changedAt).toISOString(),
      changedBy: change.changedById || change.changedByEmail
        ? { id: change.changedById ?? null, email: change.changedByEmail ?? null, role: change.changedByRole ?? null }
        : null,
      supersededAt: change.supersededAt ? new Date(change.supersededAt).toISOString() : null,
      appointment: appt
        ? {
          id: appt.id,
          terminalName: appt.terminalName,
          haulierName: appt.haulierName,
          vehicleReg: appt.vehicleReg,
          driverName: appt.driverName ?? null,
          driverId: appt.driverId ?? null,
          status: appt.status,
          windowStart: new Date(appt.windowStart).toISOString(),
          windowEnd: new Date(appt.windowEnd).toISOString(),
          windowVersion: appt.windowVersion ?? 1,
          arrivedAt: appt.arrivedAt ? new Date(appt.arrivedAt).toISOString() : null,
        }
        : ({} as WindowChangeView['appointment']),
      recipients,
    };
  }
}

/** One line of human text, so the note trail stays readable next to the events. */
function appendChangeMarker(
  existing: string | null,
  kind: TruckWindowChangeKind,
  version: number,
  fromStart: Date,
  fromEnd: Date,
  toStart: Date | null,
  toEnd: Date | null,
  reason: string | null,
  now: Date,
): string {
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const body = kind === TruckWindowChangeKind.CANCELLED
    ? `[window v${version} CANCELLED ${stamp} UTC] ${formatWindow(fromStart, fromEnd)}`
    : `[window v${version} ${stamp} UTC] ${formatWindow(fromStart, fromEnd)} → ${formatWindow(toStart, toEnd)}`;
  return `${existing ? `${existing}\n` : ''}${body}${reason ? ` — ${reason}` : ''}`;
}

/** One line describing the change, used for the notification bell and audit. */
function describeChange(
  change: { version: number; changeKind: TruckWindowChangeKind; previousWindowStart: Date; previousWindowEnd: Date; newWindowStart: Date | null; newWindowEnd: Date | null; reason: string | null },
  appt: { terminalName: string; vehicleReg: string },
): string {
  if (change.changeKind === TruckWindowChangeKind.CANCELLED) {
    return `${appt.terminalName} · ${appt.vehicleReg}: the gate window ${formatWindow(change.previousWindowStart, change.previousWindowEnd)} was CANCELLED (v${change.version}).` +
      (change.reason ? ` Reason: ${change.reason}` : '');
  }
  return `${appt.terminalName} · ${appt.vehicleReg}: gate window moved from ${formatWindow(change.previousWindowStart, change.previousWindowEnd)} ` +
    `to ${formatWindow(change.newWindowStart, change.newWindowEnd)} (v${change.version}).` +
    (change.reason ? ` Reason: ${change.reason}` : '');
}
