import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DockService } from './dock.service';
import { ALLOWED_TRANSITIONS, AppointmentStatus } from './dto/dock.dto';

/**
 * Dock scheduling — the domain rules.
 *
 * Focused on the two things that make this a scheduling system rather than a
 * table: a dock cannot hold two vehicles at once, and the lifecycle cannot be
 * driven backwards. Everything else is plumbing that a type error would catch.
 */

const COMPANY = 'cmp-a';
const OTHER = 'cmp-b';
const SLOT = { id: 'slot-1', name: 'Dock 1', type: 'BOTH', isActive: true, warehouse: { id: 'wh-1', companyId: COMPANY } };

/**
 * A wall-clock time on 2026-11-20, in hours (9.5 -> 09:30).
 *
 * Hours rather than a hand-written time string: the fractional cases are the
 * interesting ones, and "T9.5:00:00" is not a date at all.
 */
const ISO = (hours: number) => new Date(Date.UTC(2026, 10, 20) + hours * 3_600_000).toISOString();

/** Prisma hands back Date objects for DateTime columns; the double must too, or `Date < string` compares against a non-ISO string and never matches. */
const asDates = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v]),
  );

function makePrisma(overrides: Record<string, unknown> = {}) {
  const state = {
    appointments: [] as any[],
    warehouse: { id: 'wh-1', companyId: COMPANY },
    slot: SLOT as any,
  };

  const api = {
    _state: state,
    warehouse: { findFirst: jest.fn(async ({ where }: any) => (where.id === state.warehouse.id && where.companyId === COMPANY ? state.warehouse : null)) },
    dockSlot: {
      findFirst: jest.fn(async ({ where }: any) => {
        // tenant scoping: slot belongs to a warehouse owned by the company
        const companyId = where?.warehouse?.companyId;
        if (where.id !== 'slot-1') return null;
        if (companyId && companyId !== COMPANY) return null;
        return state.slot;
      }),
      findMany: jest.fn(async () => [state.slot]),
      create: jest.fn(async ({ data }: any) => ({ id: 'slot-new', ...data })),
      update: jest.fn(async ({ data }: any) => ({ ...state.slot, ...data })),
    },
    dockAppointment: {
      findFirst: jest.fn(async ({ where }: any) => {
        const hit = state.appointments.find((a) => a.id === where.id && a.companyId === where.companyId);
        return hit ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return state.appointments.filter((a) => {
          if (where.companyId && a.companyId !== where.companyId) return false;
          if (where.dockSlotId && a.dockSlotId !== where.dockSlotId) return false;
          if (where.id?.not && a.id === where.id.not) return false;
          // `status` arrives either as a scalar (equality) or as a filter
          // object ({ notIn: [...] }). Treating the object as an equality
          // value silently rejects every row, so only compare when scalar.
          if (typeof where.status === 'string' && a.status !== where.status) return false;
          if (where.status?.notIn && where.status.notIn.includes(a.status)) return false;
          // overlap: existing.start < newEnd AND existing.end > newStart
          if (where.scheduledStart?.lt && !(a.scheduledStart < where.scheduledStart.lt)) return false;
          if (where.scheduledEnd?.gt && !(a.scheduledEnd > where.scheduledEnd.gt)) return false;
          if (where.scheduledStart?.gte && !(a.scheduledStart >= where.scheduledStart.gte)) return false;
          return true;
        });
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = asDates({ id: `apt-${state.appointments.length + 1}`, ...data });
        state.appointments.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = state.appointments.find(
          (a) => a.id === where.id && (where.companyId === undefined || a.companyId === where.companyId),
        );
        if (!row) throw new Error(`no appointment ${where.id} for ${where.companyId}`);
        Object.assign(row, data);
        return row;
      }),
    },
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      if (typeof companyId !== 'string' || companyId.trim() === '') throw new Error('withTenant requires a non-empty companyId');
      return fn(api);
    }),
    $transaction: jest.fn(async (fn: any) => fn(api)),
  };
  return Object.assign(api, overrides) as any;
}

const svc = (prisma: any = makePrisma()) => ({ prisma, docks: new DockService(prisma) });

describe('DockService', () => {
  describe('booking a dock', () => {
    it('books an empty dock', async () => {
      const { docks } = svc();
      const appt = await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      expect(appt.status).toBe('SCHEDULED');
      expect(appt.scheduledStart.toISOString()).toBe(ISO(8));
    });

    it('refuses a second booking that overlaps the first', async () => {
      const { docks } = svc();
      await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(10),
      });
      // fully inside
      await expect(docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(9), scheduledEnd: ISO(9.5),
      })).rejects.toBeInstanceOf(ConflictException);
    });

    it('treats a partial overlap at either edge as a conflict', async () => {
      for (const [s, e] of [[7, 8.5], [9.5, 11]] as const) {
        const { docks } = svc();
        await docks.createAppointment(COMPANY, {
          dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(10),
        });
        await expect(docks.createAppointment(COMPANY, {
          dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(s), scheduledEnd: ISO(e),
        })).rejects.toBeInstanceOf(ConflictException);
      }
    });

    it('allows back-to-back bookings that only touch at the boundary', async () => {
      // Half-open intervals: [8,9) and [9,10) do not overlap. A warehouse
      // that can turn a vehicle in exactly an hour must not be blocked.
      const { docks } = svc();
      await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await expect(docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'OUTBOUND', scheduledStart: ISO(9), scheduledEnd: ISO(10),
      })).resolves.toBeTruthy();
    });

    it('releases the dock when an appointment is cancelled or a no-show', async () => {
      for (const status of ['CANCELLED', 'NO_SHOW']) {
        const { prisma, docks } = svc();
        await docks.createAppointment(COMPANY, {
          dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(10),
        });
        prisma._state.appointments[0].status = status;
        // A cancelled booking never occupied the dock, so it must not block it.
        await expect(docks.createAppointment(COMPANY, {
          dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(10),
        })).resolves.toBeTruthy();
      }
    });

    it('rejects an inverted or zero-length window', async () => {
      const { docks } = svc();
      await expect(docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(10), scheduledEnd: ISO(8),
      })).rejects.toBeInstanceOf(BadRequestException);

      const a = ISO(8), b = new Date(new Date(a).getTime() + 5_000).toISOString();
      await expect(docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: a, scheduledEnd: b,
      })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a dock that does not take that direction', async () => {
      const prisma = makePrisma();
      prisma._state.slot = { ...SLOT, type: 'OUTBOUND' };
      const docks = new DockService(prisma);
      await expect(docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('rescheduling', () => {
    it('does not collide with the appointment being moved', async () => {
      const { prisma, docks } = svc();
      const appt = await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      // Extending in place overlaps its own current window. The obvious bug is
      // matching the row being updated and reporting the dock as busy.
      await expect(docks.reschedule(COMPANY, appt.id, ISO(8), ISO(11))).resolves.toBeTruthy();
      expect(prisma.dockAppointment.update).toHaveBeenCalled();
    });

    it('still refuses a move onto another appointment', async () => {
      const { docks } = svc();
      const a = await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(10), scheduledEnd: ISO(11),
      });
      await expect(docks.reschedule(COMPANY, a.id, ISO(10.5), ISO(11.5))).rejects.toBeInstanceOf(ConflictException);
    });

    it('will not move an appointment that is already underway', async () => {
      const { docks } = svc();
      const a = await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await docks.transition(COMPANY, a.id, 'ARRIVED');
      await expect(docks.reschedule(COMPANY, a.id, ISO(12), ISO(13))).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('lifecycle', () => {
    it('walks SCHEDULED -> ARRIVED -> IN_PROGRESS -> COMPLETED', async () => {
      const { docks } = svc();
      const a = await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await docks.transition(COMPANY, a.id, 'ARRIVED');
      await docks.transition(COMPANY, a.id, 'IN_PROGRESS');
      const done = await docks.transition(COMPANY, a.id, 'COMPLETED');
      expect(done.status).toBe('COMPLETED');
      expect(done.actualArrival).toBeInstanceOf(Date);
      expect(done.actualDepart).toBeInstanceOf(Date);
    });

    it('refuses to complete a vehicle that never arrived', async () => {
      const { docks } = svc();
      const a = await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await expect(docks.transition(COMPANY, a.id, 'COMPLETED')).rejects.toBeInstanceOf(ConflictException);
    });

    it('treats COMPLETED, CANCELLED and NO_SHOW as terminal', async () => {
      for (const terminal of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as AppointmentStatus[]) {
        expect(ALLOWED_TRANSITIONS[terminal]).toEqual([]);
      }
    });

    it('will not resurrect a cancelled appointment', async () => {
      const { docks } = svc();
      const a = await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await docks.transition(COMPANY, a.id, 'CANCELLED');
      await expect(docks.transition(COMPANY, a.id, 'ARRIVED')).rejects.toBeInstanceOf(ConflictException);
    });

    it('is idempotent when a scanner double-reads the same status', async () => {
      const { prisma, docks } = svc();
      const a = await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await docks.transition(COMPANY, a.id, 'ARRIVED');
      const before = prisma.dockAppointment.update.mock.calls.length;
      await docks.transition(COMPANY, a.id, 'ARRIVED');
      expect(prisma.dockAppointment.update.mock.calls.length).toBe(before);
    });

    it('names the legal moves in the error, so the client can recover', async () => {
      const { docks } = svc();
      const a = await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await expect(docks.transition(COMPANY, a.id, 'COMPLETED')).rejects.toThrow(/Allowed: ARRIVED, CANCELLED, NO_SHOW/);
    });
  });

  describe('tenant scoping', () => {
    it('404s a dock slot belonging to another tenant', async () => {
      const { docks } = svc();
      await expect(docks.createAppointment(OTHER, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s an appointment id from another tenant', async () => {
      const { docks } = svc();
      await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await expect(docks.getAppointment(OTHER, 'apt-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('never leaks another tenant rows in a list', async () => {
      const { prisma, docks } = svc();
      await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      prisma._state.appointments.push({ id: 'apt-other', companyId: OTHER, dockSlotId: 'slot-1', status: 'SCHEDULED', scheduledStart: new Date(ISO(8)), scheduledEnd: new Date(ISO(9)) });
      const rows = await docks.listAppointments(COMPANY);
      expect(rows.every((r: any) => r.companyId === COMPANY)).toBe(true);
    });
  });

  describe('taking a dock out of service', () => {
    it('refuses while vehicles are still booked to it', async () => {
      // The failure this prevents is silent: the dock goes dark, and a carrier
      // turns up at a closed door with nothing anywhere telling them so.
      const { docks } = svc();
      await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9), reference: 'PO-9',
      });
      await expect(docks.updateSlot(COMPANY, 'slot-1', { isActive: false }))
        .rejects.toThrow(/1 upcoming booking.*PO-9/s);
    });

    it('allows it once the bookings are finished or cancelled', async () => {
      for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW']) {
        const { prisma, docks } = svc();
        await docks.createAppointment(COMPANY, {
          dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
        });
        prisma._state.appointments[0].status = status;
        await expect(docks.updateSlot(COMPANY, 'slot-1', { isActive: false })).resolves.toBeTruthy();
      }
    });

    it('still allows renaming an active dock with bookings on it', async () => {
      const { docks } = svc();
      await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9),
      });
      await expect(docks.updateSlot(COMPANY, 'slot-1', { name: 'Dock 1A' })).resolves.toBeTruthy();
    });
  });

  describe('tenant context on writes', () => {
    /**
     * withTenant() sets app.company_id, so row-level security backs the WHERE
     * clause instead of relying on it alone. A write that drops out of that
     * wrapper still works today (RLS is inert as deployed) and would leak the
     * moment the policy is switched on — so pin the wrapper, not the filter.
     */
    it.each([
      ['create', (d: DockService) => d.createAppointment(COMPANY, { dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9) })],
      ['transition', async (d: DockService) => {
        const a = await d.createAppointment(COMPANY, { dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9) });
        return d.transition(COMPANY, a.id, 'ARRIVED');
      }],
      ['reschedule', async (d: DockService) => {
        const a = await d.createAppointment(COMPANY, { dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(8), scheduledEnd: ISO(9) });
        return d.reschedule(COMPANY, a.id, ISO(12), ISO(13));
      }],
    ])('runs %s inside withTenant', async (_name, act) => {
      const { prisma, docks } = svc();
      await act(docks);
      expect(prisma.withTenant).toHaveBeenCalledWith(COMPANY, expect.any(Function));
    });
  });

  describe('availability', () => {
    it('reports the gaps rather than the bookings', async () => {
      const { docks } = svc();
      await docks.createAppointment(COMPANY, {
        dockSlotId: 'slot-1', type: 'INBOUND', scheduledStart: ISO(10), scheduledEnd: ISO(12),
      });
      const av = await docks.availability(COMPANY, 'slot-1', '2026-11-20');
      expect(av.free).toEqual([
        { start: '2026-11-20T00:00:00.000Z', end: ISO(10) },
        { start: ISO(12), end: '2026-11-21T00:00:00.000Z' },
      ]);
    });

    it('reports a fully free day as one gap', async () => {
      const { docks } = svc();
      const av = await docks.availability(COMPANY, 'slot-1', '2026-11-20');
      expect(av.free).toHaveLength(1);
      expect(av.booked).toHaveLength(0);
    });
  });
});
