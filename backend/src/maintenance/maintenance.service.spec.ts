import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';

/**
 * Behavioural tests for asset maintenance.
 *
 * The happy path is not the interesting part. A maintenance record is used to
 * decide who pays for a failure, so every test below is asking one of three
 * questions:
 *
 *  1. **Can this API be made to attribute work to the wrong unit or tenant?**
 *  2. **Can it manufacture a warranty — a term nobody chose, or a clock that
 *     started at the wrong moment?**
 *  3. **Can a number that governs a contract (downtime, availability, cost per
 *     hour) be produced from data that does not support it?**
 *
 * The Prisma fake covers exactly the queries the service issues. It is
 * deliberately dumb: if the service stops asking a question, the fake does not
 * quietly answer it.
 */

const COMPANY = 'tenant-a';
const OTHER = 'tenant-b';
const ACTOR = { id: 'u1', name: 'Sipho Dlamini' };
const NOW = new Date('2026-11-04T10:00:00.000Z');

function makePrisma(seed: {
  assets?: any[];
  jobs?: any[];
  faultCodes?: any[];
  costs?: any[];
  events?: any[];
  readings?: any[];
} = {}) {
  const state = {
    assets: seed.assets ?? [],
    jobs: seed.jobs ?? [],
    faultCodes: seed.faultCodes ?? [],
    costs: seed.costs ?? [],
    events: seed.events ?? [],
    readings: seed.readings ?? [],
  };
  let seq = 0;
  const nextId = (prefix: string) => {
    seq += 1;
    return `${prefix}-${seq}`;
  };

  const asTime = (value: any): number | null => {
    if (value === null || value === undefined) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  };

  const matchValue = (value: any, cond: any): boolean => {
    if (cond === null) return value === null || value === undefined;
    if (cond instanceof Date) return asTime(value) === cond.getTime();
    if (typeof cond !== 'object') return value === cond;
    if (Array.isArray(cond)) return cond.includes(value);
    if ('in' in cond) return (cond.in as any[]).includes(value);
    if ('notIn' in cond) return !(cond.notIn as any[]).includes(value);
    if ('not' in cond) {
      const inner = (cond as any).not;
      if (inner === null) return value !== null && value !== undefined;
      if (typeof inner === 'object') return !matchValue(value, inner);
      return value !== inner;
    }
    if ('equals' in cond) return value === (cond as any).equals;
    if ('gte' in cond) {
      const a = asTime(value);
      const b = asTime((cond as any).gte);
      return a !== null && b !== null && a >= b;
    }
    if ('lte' in cond) {
      const a = asTime(value);
      const b = asTime((cond as any).lte);
      return a !== null && b !== null && a <= b;
    }
    if ('gt' in cond) {
      const a = asTime(value);
      const b = asTime((cond as any).gt);
      return a !== null && b !== null && a > b;
    }
    if ('startsWith' in cond) {
      return typeof value === 'string' && value.startsWith((cond as any).startsWith);
    }
    if ('contains' in cond) {
      return String(value ?? '').toLowerCase().includes(String((cond as any).contains).toLowerCase());
    }
    throw new Error(`fake prisma: unsupported condition ${JSON.stringify(cond)}`);
  };

  const match = (row: any, where: any): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, cond]: [string, any]) => {
      if (key === 'OR') return (cond as any[]).some((c) => match(row, c));
      if (key === 'AND') return (cond as any[]).every((c) => match(row, c));
      return matchValue(row[key], cond);
    });
  };

  const sortRows = (rows: any[], orderBy: any) => {
    if (!orderBy) return rows;
    const spec = Array.isArray(orderBy) ? orderBy[0] : orderBy;
    const [[field, dir]] = Object.entries(spec) as [string, 'asc' | 'desc'][];
    return [...rows].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      const cmp =
        av instanceof Date && bv instanceof Date
          ? av.getTime() - bv.getTime()
          : String(av ?? '').localeCompare(String(bv ?? ''));
      return dir === 'desc' ? -cmp : cmp;
    });
  };

  /** Resolve the handful of relations the service actually includes. */
  const decorate = (row: any, args: any, model: string): any => {
    if (!row) return row;
    // The service asks for relations through `include` on some paths and
    // `select` on others. Both must resolve, or a test can pass while the
    // production query returns nothing.
    const include = args?.include ?? args?.select;
    if (!include) return { ...row };
    const out = { ...row };
    if (include.asset) out.asset = state.assets.find((a) => a.id === row.assetId) ?? null;
    if (include.faultCode) {
      out.faultCode = row.faultCodeId
        ? state.faultCodes.find((f) => f.id === row.faultCodeId) ?? null
        : null;
    }
    if (include.priorJob) out.priorJob = state.jobs.find((j) => j.id === row.priorJobId) ?? null;
    if (include.costs) {
      out.costs = state.costs
        .filter((c) => c.jobId === row.id)
        .map((c) => ({ amount: c.amount, kind: c.kind }));
    }
    if (include.events) {
      out.events = sortRows(
        state.events.filter((e) => e.jobId === row.id),
        { createdAt: 'asc' },
      );
    }
    if (include.jobs && model === 'asset') {
      out.jobs = sortRows(
        state.jobs.filter((j) => j.assetId === row.id),
        { reportedAt: 'desc' },
      );
    }
    if (include.meterReadings && model === 'asset') {
      out.meterReadings = sortRows(
        state.readings.filter((r) => r.assetId === row.id),
        { readAt: 'desc' },
      );
    }
    return out;
  };

  const prisma: any = {
    maintenanceAsset: {
      findFirst: async ({ where, include }: any = {}) => {
        const row = state.assets.find((a) => match(a, where));
        return row ? decorate(row, { include }, 'asset') : null;
      },
      findMany: async ({ where, orderBy, take, include }: any = {}) =>
        sortRows(state.assets.filter((a) => match(a, where)), orderBy)
          .slice(0, take ?? 1000)
          .map((row) => {
            const out = decorate(row, { include }, 'asset');
            // `include.jobs` with a where clause: the service asks for the open
            // card only.
            if (include?.jobs) {
              const openJobs = state.jobs
                .filter((j) => j.assetId === row.id && match(j, include.jobs.where))
                .sort((a, b) => asTime(b.reportedAt)! - asTime(a.reportedAt)!)
                .slice(0, include.jobs.take ?? 10);
              out.jobs = openJobs.map((j) => ({ ...j }));
            }
            return out;
          }),
      create: async ({ data }: any) => {
        const row = {
          id: nextId('asset'),
          status: 'IN_SERVICE',
          meterType: 'HOURS',
          meterReading: 0,
          meterReadAt: null,
          retiredAt: null,
          createdAt: NOW,
          updatedAt: NOW,
          ...data,
        };
        state.assets.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const index = state.assets.findIndex((a) => a.id === where.id);
        if (index === -1) throw new Error('record not found');
        state.assets[index] = { ...state.assets[index], ...data, updatedAt: NOW };
        return { ...state.assets[index] };
      },
    },

    maintenanceMeterReading: {
      create: async ({ data }: any) => {
        const row = { id: nextId('mr'), readAt: NOW, createdAt: NOW, ...data };
        state.readings.push(row);
        return row;
      },
      findMany: async ({ where, orderBy, take }: any = {}) =>
        sortRows(state.readings.filter((r) => match(r, where)), orderBy).slice(0, take ?? 100),
    },

    maintenanceFaultCode: {
      findFirst: async ({ where }: any = {}) => state.faultCodes.find((f) => match(f, where)) ?? null,
      findMany: async ({ where, orderBy }: any = {}) =>
        sortRows(state.faultCodes.filter((f) => match(f, where)), orderBy),
      create: async ({ data }: any) => {
        const row = { id: nextId('fault'), active: true, createdAt: NOW, updatedAt: NOW, ...data };
        state.faultCodes.push(row);
        return row;
      },
    },

    maintenanceJob: {
      findFirst: async ({ where, include }: any = {}) => {
        const row = sortRows(state.jobs.filter((j) => match(j, where)), { createdAt: 'desc' })[0];
        return row ? decorate(row, { include }, 'job') : null;
      },
      findMany: async (args: any = {}) =>
        sortRows(state.jobs.filter((j) => match(j, args.where)), args.orderBy)
          .slice(0, args.take ?? 100)
          .map((row) => decorate(row, args, 'job')),
      create: async ({ data }: any) => {
        // No helpful defaults beyond what the column declares: if the service
        // forgets to set a status, the fake must not invent one.
        const row = {
          id: nextId('job'),
          status: 'REPORTED',
          reportedAt: NOW,
          currency: 'ZAR',
          createdAt: NOW,
          updatedAt: NOW,
          priorJobId: null,
          warrantyTermDays: null,
          warrantyExpiresAt: null,
          completedAt: null,
          downtimeMinutes: null,
          ...data,
        };
        state.jobs.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const index = state.jobs.findIndex((j) => j.id === where.id);
        if (index === -1) throw new Error('record not found');
        state.jobs[index] = { ...state.jobs[index], ...data, updatedAt: NOW };
        return { ...state.jobs[index] };
      },
      count: async ({ where }: any = {}) => state.jobs.filter((j) => match(j, where)).length,
    },

    maintenanceJobCost: {
      create: async ({ data }: any) => {
        const row = { id: nextId('cost'), createdAt: NOW, ...data };
        state.costs.push(row);
        return row;
      },
      findMany: async ({ where }: any = {}) => state.costs.filter((c) => match(c, where)),
    },

    maintenanceJobEvent: {
      create: async ({ data }: any) => {
        const row = { id: nextId('ev'), createdAt: NOW, ...data };
        state.events.push(row);
        return row;
      },
      findMany: async ({ where, orderBy }: any = {}) =>
        sortRows(state.events.filter((e) => match(e, where)), orderBy),
    },
  };

  return { prisma, state };
}

function asset(overrides: Record<string, any> = {}) {
  return {
    id: 'asset-1',
    companyId: COMPANY,
    assetCode: 'RS-014',
    name: 'Stacker 14',
    assetClass: 'REACH_STACKER',
    status: 'IN_SERVICE',
    meterType: 'HOURS',
    meterReading: 1000,
    meterReadAt: NOW,
    retiredAt: null,
    custodian: 'TTT Logistics',
    site: 'Pier 1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function job(overrides: Record<string, any> = {}) {
  return {
    id: 'job-1',
    companyId: COMPANY,
    assetId: 'asset-1',
    jobNumber: 'MJ-2026-0001',
    type: 'BREAKDOWN',
    status: 'REPORTED',
    reportedAt: new Date('2026-10-01T06:00:00.000Z'),
    completedAt: null,
    startedAt: null,
    faultCodeId: null,
    faultDescription: 'Boom cylinder leaking',
    workPerformed: null,
    downtimeMinutes: null,
    warrantyTermDays: null,
    warrantyExpiresAt: null,
    priorJobId: null,
    currency: 'ZAR',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('asset register', () => {
  it('stores the unit number in one canonical form so RS-014 and rs-014 cannot both exist', async () => {
    const { prisma, state } = makePrisma();
    const service = new MaintenanceService(prisma);

    const created = await service.createAsset(COMPANY, ACTOR, {
      assetCode: '  rs-014 ',
      assetClass: 'REACH_STACKER',
    });

    expect(created.assetCode).toBe('RS-014');
    expect(state.assets).toHaveLength(1);
  });

  it('refuses a second row for the same unit', async () => {
    const { prisma } = makePrisma({ assets: [asset()] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.createAsset(COMPANY, ACTOR, { assetCode: 'rs-014', assetClass: 'REACH_STACKER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records an opening meter reading as the first entry on the meter spine', async () => {
    const { prisma, state } = makePrisma();
    const service = new MaintenanceService(prisma);

    await service.createAsset(COMPANY, ACTOR, {
      assetCode: 'RS-020',
      assetClass: 'REACH_STACKER',
      meterReading: 4210.5,
    });

    expect(state.readings).toHaveLength(1);
    expect(state.readings[0]).toMatchObject({ reading: 4210.5, source: 'MANUAL' });
  });

  it('refuses to renumber a unit that already has job cards', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [job()] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.updateAsset(COMPANY, ACTOR, 'asset-1', { assetCode: 'RS-999' }),
    ).rejects.toThrow(/cannot change without breaking that history/i);
  });

  it('stamps the retirement date, and clears it if the unit comes back', async () => {
    const { prisma, state } = makePrisma({ assets: [asset()] });
    const service = new MaintenanceService(prisma);

    await service.updateAsset(COMPANY, ACTOR, 'asset-1', { status: 'RETIRED' });
    expect(state.assets[0].status).toBe('RETIRED');
    expect(state.assets[0].retiredAt).toBeInstanceOf(Date);

    await service.updateAsset(COMPANY, ACTOR, 'asset-1', { status: 'IN_SERVICE' });
    expect(state.assets[0].retiredAt).toBeNull();
  });

  it('refuses a meter reading that runs backwards', async () => {
    const { prisma } = makePrisma({ assets: [asset()] });
    const service = new MaintenanceService(prisma);

    await expect(service.recordMeter(COMPANY, ACTOR, 'asset-1', { reading: 900 })).rejects.toThrow(
      /lower than the last accepted one/i,
    );
  });
});

describe('raising a job card', () => {
  it('answers 404 — not an empty result — for a unit in another tenant', async () => {
    const { prisma } = makePrisma({ assets: [asset({ companyId: OTHER })] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.createJob(COMPANY, ACTOR, { assetId: 'asset-1', type: 'BREAKDOWN', faultDescription: 'Leak' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('honours the idempotency key: the same key twice produces one card', async () => {
    const { prisma, state } = makePrisma({ assets: [asset()] });
    const service = new MaintenanceService(prisma);

    const first = await service.createJob(COMPANY, ACTOR, {
      assetId: 'asset-1',
      type: 'BREAKDOWN',
      faultDescription: 'Boom cylinder leaking',
      idempotencyKey: 'capture-77',
    });
    const second = await service.createJob(COMPANY, ACTOR, {
      assetId: 'asset-1',
      type: 'BREAKDOWN',
      faultDescription: 'Boom cylinder leaking',
      idempotencyKey: 'capture-77',
    });

    expect(second.id).toBe(first.id);
    expect(state.jobs).toHaveLength(1);
  });

  it('numbers cards sequentially per tenant', async () => {
    const { prisma, state } = makePrisma({ assets: [asset()] });
    const service = new MaintenanceService(prisma);

    await service.createJob(COMPANY, ACTOR, { assetId: 'asset-1', type: 'BREAKDOWN', faultDescription: 'One' });
    await service.createJob(COMPANY, ACTOR, { assetId: 'asset-1', type: 'INSPECTION', faultDescription: 'Two' });

    expect(state.jobs.map((j) => j.jobNumber)).toEqual(['MJ-2026-0001', 'MJ-2026-0002']);
  });

  it('links a repeat of the same fault to the earlier card and says whether it is still in warranty', async () => {
    const prior = job({
      id: 'job-0',
      jobNumber: 'MJ-2026-0001',
      status: 'COMPLETED',
      faultCodeId: 'fault-hyd',
      completedAt: new Date('2026-10-01T12:00:00.000Z'),
      warrantyTermDays: 30,
    });
    const { prisma, state } = makePrisma({
      assets: [asset()],
      jobs: [prior],
      faultCodes: [{ id: 'fault-hyd', companyId: COMPANY, code: 'HYD-LEAK', label: 'Hydraulic leak', active: true }],
    });
    const service = new MaintenanceService(prisma);

    const created = await service.createJob(COMPANY, ACTOR, {
      assetId: 'asset-1',
      type: 'BREAKDOWN',
      faultDescription: 'Same leak at the boom cylinder',
      faultCodeId: 'fault-hyd',
      // Pinned: the assertion is about the *rule*, not about what today is.
      reportedAt: '2026-10-20T08:00:00.000Z',
    });

    expect(created.priorJobId).toBe('job-0');
    const linkEvent = state.events.find((e) => e.type === 'COMEBACK_LINKED');
    expect(linkEvent?.description).toMatch(/still inside the warranty/i);
  });

  it('does not link a different fault on the same unit', async () => {
    const prior = job({
      id: 'job-0',
      status: 'COMPLETED',
      faultCodeId: 'fault-hyd',
      completedAt: new Date('2026-10-01T12:00:00.000Z'),
      warrantyTermDays: 30,
    });
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [prior],
      faultCodes: [
        { id: 'fault-hyd', companyId: COMPANY, code: 'HYD-LEAK', label: 'Hydraulic leak', active: true },
        { id: 'fault-elec', companyId: COMPANY, code: 'ELEC-ALT', label: 'Alternator', active: true },
      ],
    });
    const service = new MaintenanceService(prisma);

    const created = await service.createJob(COMPANY, ACTOR, {
      assetId: 'asset-1',
      type: 'BREAKDOWN',
      faultDescription: 'Alternator not charging',
      faultCodeId: 'fault-elec',
    });

    expect(created.priorJobId).toBeNull();
  });

  it('refuses to raise a card against a retired unit, and says what to do instead', async () => {
    const { prisma } = makePrisma({ assets: [asset({ status: 'RETIRED' })] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.createJob(COMPANY, ACTOR, { assetId: 'asset-1', type: 'BREAKDOWN', faultDescription: 'Leak' }),
    ).rejects.toThrow(/retired/i);
  });

  it('refuses a card reported in the future', async () => {
    const { prisma } = makePrisma({ assets: [asset()] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.createJob(COMPANY, ACTOR, {
        assetId: 'asset-1',
        type: 'BREAKDOWN',
        faultDescription: 'Leak',
        reportedAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).rejects.toThrow(/future/i);
  });

  it('keeps a back-dated meter reading on the card without moving the unit’s meter backwards', async () => {
    const { prisma, state } = makePrisma({ assets: [asset({ meterReading: 1200 })] });
    const service = new MaintenanceService(prisma);

    const created = await service.createJob(COMPANY, ACTOR, {
      assetId: 'asset-1',
      type: 'BREAKDOWN',
      faultDescription: 'Card written up two days after the event',
      meterAtJob: 1150,
    });

    expect(created.meterAtJob).toBe(1150);
    expect(state.assets[0].meterReading).toBe(1200);
  });

  it('advances the meter when the card reports a higher reading', async () => {
    const { prisma, state } = makePrisma({ assets: [asset({ meterReading: 1200 })] });
    const service = new MaintenanceService(prisma);

    await service.createJob(COMPANY, ACTOR, {
      assetId: 'asset-1',
      type: 'BREAKDOWN',
      faultDescription: 'Leak',
      meterAtJob: 1240,
    });

    expect(state.assets[0].meterReading).toBe(1240);
    expect(state.readings).toHaveLength(1);
    expect(state.readings[0]).toMatchObject({ source: 'JOB' });
  });
});

describe('completing a job', () => {
  it('sets the warranty clock from completion and computes downtime for a breakdown', async () => {
    const { prisma, state } = makePrisma({
      assets: [asset()],
      jobs: [job({ status: 'IN_PROGRESS', startedAt: new Date('2026-11-01T07:00:00.000Z'), reportedAt: new Date('2026-11-01T06:00:00.000Z') })],
    });
    const service = new MaintenanceService(prisma);

    await service.completeJob(COMPANY, ACTOR, 'job-1', {
      workPerformed: 'Replaced seal kit',
      completedAt: new Date('2026-11-01T09:30:00.000Z').toISOString(),
      warrantyTermDays: 30,
    });

    const stored = state.jobs[0];
    expect(stored.status).toBe('COMPLETED');
    expect(stored.downtimeMinutes).toBe(210);
    expect(stored.warrantyExpiresAt.toISOString()).toBe('2026-12-01T09:30:00.000Z');
    expect(state.events.some((e) => e.type === 'WARRANTY_SET')).toBe(true);
  });

  it('leaves downtime null for a planned job — scheduled is not lost', async () => {
    const { prisma, state } = makePrisma({
      assets: [asset()],
      jobs: [job({ status: 'IN_PROGRESS', type: 'PLANNED' })],
    });
    const service = new MaintenanceService(prisma);

    await service.completeJob(COMPANY, ACTOR, 'job-1', {
      workPerformed: '500-hour service',
      completedAt: new Date('2026-11-01T09:00:00.000Z').toISOString(),
    });

    expect(state.jobs[0].downtimeMinutes).toBeNull();
  });

  it('refuses "lifetime" even if it reached the service, and leaves the job open', async () => {
    const { prisma, state } = makePrisma({ assets: [asset()], jobs: [job({ status: 'IN_PROGRESS' })] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.completeJob(COMPANY, ACTOR, 'job-1', {
        workPerformed: 'Replaced injection pump',
        warrantyTermDays: 'lifetime' as unknown as number,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(state.jobs[0].status).toBe('IN_PROGRESS');
    expect(state.jobs[0].warrantyTermDays).toBeNull();
  });

  it('refuses a completion that predates the report', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [job({ status: 'IN_PROGRESS' })] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.completeJob(COMPANY, ACTOR, 'job-1', {
        workPerformed: 'Fixed',
        completedAt: new Date('2026-09-01T00:00:00.000Z').toISOString(),
      }),
    ).rejects.toThrow(/before it was reported/i);
  });

  it('cannot complete a card that was already cancelled', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [job({ status: 'CANCELLED' })] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.completeJob(COMPANY, ACTOR, 'job-1', { workPerformed: 'Fixed' }),
    ).rejects.toThrow(/cancelled/i);
  });
});

describe('sign-off and cancellation', () => {
  it('makes sign-off terminal, and refuses to reopen with an explanation', async () => {
    const { prisma, state } = makePrisma({ assets: [asset()], jobs: [job({ status: 'COMPLETED' })] });
    const service = new MaintenanceService(prisma);

    await service.signOffJob(COMPANY, ACTOR, 'job-1', { signedOffBy: 'A. Naidoo (TTT)' });
    expect(state.jobs[0].signedOffBy).toBe('A. Naidoo (TTT)');

    await expect(service.startJob(COMPANY, ACTOR, 'job-1', {})).rejects.toThrow(/raise a new job/i);
  });

  it('requires a reason to cancel, and clears the downtime the card had accrued', async () => {
    const { prisma, state } = makePrisma({
      assets: [asset()],
      jobs: [job({ status: 'COMPLETED', downtimeMinutes: 240, completedAt: NOW })],
    });
    const service = new MaintenanceService(prisma);

    await expect(service.cancelJob(COMPANY, ACTOR, 'job-1', { reason: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await service.cancelJob(COMPANY, ACTOR, 'job-1', { reason: 'Raised against the wrong unit' });
    expect(state.jobs[0].status).toBe('CANCELLED');
    expect(state.jobs[0].cancelledReason).toBe('Raised against the wrong unit');
    expect(state.jobs[0].downtimeMinutes).toBeNull();
  });

  it('still has no delete path: the card remains after cancellation', async () => {
    const { prisma, state } = makePrisma({ assets: [asset()], jobs: [job({ status: 'COMPLETED' })] });
    const service = new MaintenanceService(prisma);

    await service.cancelJob(COMPANY, ACTOR, 'job-1', { reason: 'Duplicate of MJ-2026-0001' });
    expect(state.jobs).toHaveLength(1);
  });
});

describe('costs', () => {
  it('computes the line amount from quantity and unit cost', async () => {
    const { prisma, state } = makePrisma({ assets: [asset()], jobs: [job({ status: 'IN_PROGRESS' })] });
    const service = new MaintenanceService(prisma);

    const cost = await service.addCost(COMPANY, ACTOR, 'job-1', {
      kind: 'PART',
      description: 'Seal kit',
      quantity: 2,
      unitCost: 412.35,
    });

    expect(cost.amount).toBe(824.7);
    expect(state.events.some((e) => e.type === 'COST_ADDED')).toBe(true);
  });

  it('refuses a cost against a cancelled card', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [job({ status: 'CANCELLED' })] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.addCost(COMPANY, ACTOR, 'job-1', { kind: 'PART', description: 'Seal kit', unitCost: 100 }),
    ).rejects.toThrow(/cancelled/i);
  });

  it('refuses a quantity of zero — a zero-cost line is not a cost', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [job({ status: 'IN_PROGRESS' })] });
    const service = new MaintenanceService(prisma);

    await expect(
      service.addCost(COMPANY, ACTOR, 'job-1', { kind: 'PART', description: 'Seal kit', quantity: 0, unitCost: 100 }),
    ).rejects.toThrow(/greater than zero/i);
  });
});

describe('reading a card', () => {
  it('answers 404 for another tenant’s card', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [job({ companyId: OTHER })] });
    const service = new MaintenanceService(prisma);

    await expect(service.getJob(COMPANY, 'job-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('states the warranty position as a fact, not a default', async () => {
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [job({ status: 'COMPLETED', completedAt: new Date('2026-10-01T12:00:00.000Z'), warrantyTermDays: 30 })],
    });
    const service = new MaintenanceService(prisma);

    const read = await service.getJob(COMPANY, 'job-1');
    expect(read.warranty.position).toBe('OUT_OF_WARRANTY');
  });

  it('says UNKNOWN when no term was ever recorded', async () => {
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [job({ status: 'COMPLETED', completedAt: new Date('2026-10-01T12:00:00.000Z') })],
    });
    const service = new MaintenanceService(prisma);

    const read = await service.getJob(COMPANY, 'job-1');
    expect(read.warranty.position).toBe('UNKNOWN');
  });

  it('derives out-of-order dates from what is stored, so a refetch still explains them', async () => {
    // Invoiced on the 22nd against an order the client dated the 24th.
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [
        job({
          status: 'COMPLETED',
          completedAt: new Date('2026-10-01T12:00:00.000Z'),
          quotationAt: new Date('2026-09-20T09:00:00.000Z'),
          purchaseOrderNumber: 'PO-2026-118423',
          purchaseOrderAt: new Date('2026-09-24T09:00:00.000Z'),
          invoicedAt: new Date('2026-09-22T09:00:00.000Z'),
        }),
      ],
    });
    const service = new MaintenanceService(prisma);

    const read = await service.getJob(COMPANY, 'job-1');
    expect(read.anomalies.join(' ')).toMatch(/before the purchase order/i);
  });

  it('reports no anomalies when every date arrived in order', async () => {
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [
        job({
          status: 'COMPLETED',
          // Quoted, ordered, completed, then invoiced — nothing out of order.
          completedAt: new Date('2026-09-24T12:00:00.000Z'),
          quotationAt: new Date('2026-09-20T09:00:00.000Z'),
          purchaseOrderNumber: 'PO-2026-118423',
          purchaseOrderAt: new Date('2026-09-22T09:00:00.000Z'),
          invoicedAt: new Date('2026-09-26T09:00:00.000Z'),
        }),
      ],
    });
    const service = new MaintenanceService(prisma);

    const read = await service.getJob(COMPANY, 'job-1');
    expect(read.anomalies).toEqual([]);
  });
});

describe('the unit page', () => {
  it('computes availability, cost per hour and the fault pattern from the cards themselves', async () => {
    const now = new Date();
    const reported = new Date(now.getTime() - 2 * 86400000);

    const { prisma } = makePrisma({
      assets: [asset({ meterReading: 1100 })],
      jobs: [
        job({
          id: 'job-1',
          jobNumber: 'MJ-2026-0001',
          status: 'COMPLETED',
          faultCodeId: 'fault-hyd',
          reportedAt: reported,
          completedAt: new Date(reported.getTime() + 4 * 3600000),
          downtimeMinutes: 240,
        }),
      ],
      faultCodes: [{ id: 'fault-hyd', companyId: COMPANY, code: 'HYD-LEAK', label: 'Hydraulic leak' }],
      costs: [{ id: 'c1', companyId: COMPANY, jobId: 'job-1', kind: 'PART', amount: 2400 }],
      readings: [
        { id: 'r1', companyId: COMPANY, assetId: 'asset-1', reading: 1000, readAt: new Date(now.getTime() - 10 * 86400000) },
        { id: 'r2', companyId: COMPANY, assetId: 'asset-1', reading: 1100, readAt: now },
      ],
    });
    const service = new MaintenanceService(prisma);

    const history = await service.assetHistory(COMPANY, 'asset-1', { windowDays: 30 });

    expect(history.availability.downtimeMinutes).toBe(240);
    expect(history.costs.total).toBe(2400);
    // 2 400 over 100 hours of running.
    expect(history.meter.costPerUnit).toBe(24);
    expect(history.faultPattern[0]).toMatchObject({ faultCodeId: 'fault-hyd', occurrences: 1 });
    expect(history.faultPattern[0].faultCode?.code).toBe('HYD-LEAK');
  });

  it('does not count a planned service as lost availability', async () => {
    const now = new Date();
    const reported = new Date(now.getTime() - 86400000);

    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [
        job({
          id: 'job-1',
          jobNumber: 'MJ-2026-0001',
          type: 'PLANNED',
          status: 'COMPLETED',
          reportedAt: reported,
          completedAt: new Date(reported.getTime() + 8 * 3600000),
          downtimeMinutes: null,
        }),
      ],
    });
    const service = new MaintenanceService(prisma);

    const history = await service.assetHistory(COMPANY, 'asset-1', { windowDays: 30 });
    // The unit was out of service for eight hours — on purpose. Availability
    // must stay at 100%, otherwise a well-maintained fleet looks broken.
    expect(history.availability.downtimeMinutes).toBe(0);
    expect(history.availability.percent).toBe(100);
  });

  it('does not invent a cost per hour when the meter has not moved', async () => {
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [job({ status: 'COMPLETED', completedAt: NOW })],
      costs: [{ id: 'c1', companyId: COMPANY, jobId: 'job-1', kind: 'PART', amount: 500 }],
      readings: [
        { id: 'r1', companyId: COMPANY, assetId: 'asset-1', reading: 1000, readAt: new Date(NOW.getTime() - 5 * 86400000) },
        { id: 'r2', companyId: COMPANY, assetId: 'asset-1', reading: 1000, readAt: NOW },
      ],
    });
    const service = new MaintenanceService(prisma);

    const history = await service.assetHistory(COMPANY, 'asset-1', {});
    expect(history.meter.costPerUnit).toBeNull();
  });
});

describe('the fleet verdict', () => {
  it('is quiet when the fleet is fine, and states the numbers it used', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [] });
    const service = new MaintenanceService(prisma);

    const summary = await service.summary(COMPANY, { windowDays: 30 });
    expect(summary.status).toBe('ok');
    expect(summary.metrics.assets).toBe(1);
    expect(summary.metrics.availabilityPercent).toBe(100);
    expect(summary.windowDays).toBe(30);
  });

  it('raises attention when rework is inside a warranty the business gave', async () => {
    const priorCompleted = new Date(Date.now() - 10 * 86400000);
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [
        job({
          id: 'job-1',
          jobNumber: 'MJ-2026-0001',
          status: 'COMPLETED',
          faultCodeId: 'fault-hyd',
          completedAt: priorCompleted,
          warrantyTermDays: 30,
          reportedAt: new Date(priorCompleted.getTime() - 3600000),
        }),
        job({
          id: 'job-2',
          jobNumber: 'MJ-2026-0002',
          status: 'COMPLETED',
          faultCodeId: 'fault-hyd',
          priorJobId: 'job-1',
          reportedAt: new Date(Date.now() - 2 * 86400000),
          completedAt: new Date(Date.now() - 86400000),
        }),
      ],
      costs: [{ id: 'c1', companyId: COMPANY, jobId: 'job-2', kind: 'PART', amount: 3400 }],
    });
    const service = new MaintenanceService(prisma);

    const summary = await service.summary(COMPANY, { windowDays: 30 });
    expect(summary.metrics.warrantyExposure).toBe(3400);
    expect(summary.status).toBe('attention');
    expect(summary.findings.some((f) => f.code === 'warranty')).toBe(true);
  });
});

/**
 * The supplier's warranty is not a clock you can leave running.
 *
 * The operator who described his fleet keeps 30 months of cover alive with one
 * labour-only service a year. The service either finds that service and says
 * so, or it reports cover that has quietly stopped standing — and the second is
 * the failure this whole module exists to prevent.
 */
describe('a warranty kept alive by a service', () => {
  const thirtyMonths = 913;

  const covered = (overrides: Record<string, any> = {}) =>
    asset({
      assetClass: 'RTG',
      warrantySupplier: 'Kalmar',
      warrantyStartAt: new Date('2026-01-01T00:00:00.000Z'),
      warrantyTermDays: thirtyMonths,
      warrantyServiceIntervalDays: 365,
      ...overrides,
    });

  it('reports cover as unproven when the annual service is missing', async () => {
    const { prisma } = makePrisma({
      assets: [covered()],
      jobs: [
        job({
          id: 'job-1',
          type: 'PLANNED',
          status: 'COMPLETED',
          reportedAt: new Date('2026-09-29T06:00:00.000Z'),
          completedAt: new Date('2026-09-29T09:00:00.000Z'),
        }),
      ],
    });
    const service = new MaintenanceService(prisma);

    // 2028-01-15: term runs to 2028-07-02, last service 2026-09-29, so the
    // service that would have kept the cover was due 2027-09-29 + 30 days.
    jest.useFakeTimers().setSystemTime(new Date('2028-01-15T00:00:00.000Z'));
    try {
      const detail = await service.getAsset(COMPANY, 'asset-1');
      expect(detail.warranty.state).toBe('SERVICE_OVERDUE');
      expect(detail.warranty.daysOverdue).toBeGreaterThan(0);
      expect(detail.warranty.expiresAt?.toISOString()).toBe('2028-07-02T00:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not let a breakdown reset the service clock', async () => {
    const { prisma } = makePrisma({
      assets: [covered()],
      jobs: [
        job({
          id: 'job-1',
          type: 'PLANNED',
          status: 'COMPLETED',
          reportedAt: new Date('2026-09-29T06:00:00.000Z'),
          completedAt: new Date('2026-09-29T09:00:00.000Z'),
        }),
        // A repair six months later is the machine failing, not the operator
        // attending to it — and it must not be read as compliance.
        job({
          id: 'job-2',
          type: 'BREAKDOWN',
          status: 'SIGNED_OFF',
          reportedAt: new Date('2027-03-01T06:00:00.000Z'),
          completedAt: new Date('2027-03-02T06:00:00.000Z'),
        }),
      ],
    });
    const service = new MaintenanceService(prisma);

    jest.useFakeTimers().setSystemTime(new Date('2028-01-15T00:00:00.000Z'));
    try {
      const detail = await service.getAsset(COMPANY, 'asset-1');
      expect(detail.warranty.state).toBe('SERVICE_OVERDUE');
    } finally {
      jest.useRealTimers();
    }
  });

  it('carries the standing onto the fleet list, so cover is visible without opening a unit', async () => {
    const { prisma } = makePrisma({ assets: [covered()], jobs: [] });
    const service = new MaintenanceService(prisma);

    jest.useFakeTimers().setSystemTime(new Date('2027-06-01T00:00:00.000Z'));
    try {
      const list = await service.listAssets(COMPANY, {});
      expect(list).toHaveLength(1);
      expect(list[0].warranty.state).toBe('SERVICE_OVERDUE');
      expect(list[0].warranty.neverServiced).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('raises the condition in the fleet verdict, naming the unit', async () => {
    const { prisma } = makePrisma({ assets: [covered()], jobs: [] });
    const service = new MaintenanceService(prisma);

    jest.useFakeTimers().setSystemTime(new Date('2028-01-15T00:00:00.000Z'));
    try {
      const summary = await service.summary(COMPANY, { windowDays: 30 });
      expect(summary.metrics.unitsInTerm).toBe(1);
      expect(summary.metrics.unitsServiceOverdue).toBe(1);
      const finding = summary.findings.find((f) => f.code === 'warranty_condition');
      expect(finding?.message).toContain('RS-014');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not raise the condition for a unit whose term has ended', async () => {
    const { prisma } = makePrisma({ assets: [covered()], jobs: [] });
    const service = new MaintenanceService(prisma);

    jest.useFakeTimers().setSystemTime(new Date('2029-01-01T00:00:00.000Z'));
    try {
      const summary = await service.summary(COMPANY, { windowDays: 30 });
      expect(summary.metrics.unitsInTerm).toBe(0);
      expect(summary.metrics.unitsServiceOverdue).toBe(0);
      expect(summary.findings.find((f) => f.code === 'warranty_condition')).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the class rollup', () => {
  it('separates the classes a terminal actually runs', async () => {
    const { prisma } = makePrisma({
      assets: [
        asset({ id: 'asset-r', assetCode: 'RTG-01', assetClass: 'RTG' }),
        asset({ id: 'asset-s', assetCode: 'SC-01', assetClass: 'STRADDLE_CARRIER', status: 'DOWN' }),
        asset({ id: 'asset-h', assetCode: 'HL-01', assetClass: 'HAULER' }),
      ],
      jobs: [job({ id: 'job-1', assetId: 'asset-s', status: 'IN_PROGRESS', reportedAt: new Date(Date.now() - 86400000) })],
    });
    const service = new MaintenanceService(prisma);

    const summary = await service.summary(COMPANY, { windowDays: 30 });
    expect(summary.byClass).toHaveLength(3);
    expect(summary.byClass[0].assetClass).toBe('STRADDLE_CARRIER');
    expect(summary.byClass[0].unitsDown).toBe(1);
    expect(summary.byClass.find((row) => row.assetClass === 'RTG')?.longDownLimitHours).toBe(180);
  });

  it('leaves retired units out of the classes as well as the headline', async () => {
    const { prisma } = makePrisma({
      assets: [
        asset({ id: 'asset-r', assetCode: 'RTG-01', assetClass: 'RTG' }),
        asset({ id: 'asset-x', assetCode: 'RTG-99', assetClass: 'RTG', status: 'RETIRED' }),
      ],
      jobs: [],
    });
    const service = new MaintenanceService(prisma);

    const summary = await service.summary(COMPANY, { windowDays: 30 });
    expect(summary.byClass).toHaveLength(1);
    expect(summary.byClass[0].units).toBe(1);
  });
});

/**
 * Recording the commercial chain.
 *
 * The tests below are about the two things that go wrong with money on a job
 * card: a step stored that contradicts the step before it, and a correction made
 * quietly. The first is refused at the edge; the second is written into the
 * event trail, because a re-quoted price and a silently edited one look
 * identical in the row and completely different in the history.
 */
describe('the commercial chain', () => {
  const quoted = () =>
    job({
      id: 'job-1',
      status: 'IN_PROGRESS',
      reportedAt: new Date(Date.now() - 6 * 86400000),
      startedAt: new Date(Date.now() - 6 * 86400000 + 3600000),
    });

  it('records a quotation and knows the card is now waiting for authority', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [quoted()] });
    const service = new MaintenanceService(prisma);

    const result = await service.recordCommercial(COMPANY, ACTOR, 'job-1', {
      quotationAmount: 42500,
      quotationAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    });

    expect(result.quotationAmount).toBe(42500);
    expect(result.commercial.nextStep).toBe('AUTHORISED');
    expect(result.commercial.stuckHours).toBeGreaterThan(0);
  });

  it('writes the change into the append-only trail, so a correction is visible', async () => {
    const { prisma, state } = makePrisma({ assets: [asset()], jobs: [quoted()] });
    const service = new MaintenanceService(prisma);

    await service.recordCommercial(COMPANY, ACTOR, 'job-1', { quotationAmount: 42500 });
    await service.recordCommercial(COMPANY, ACTOR, 'job-1', { quotationAmount: 39000 });

    const events = state.events.filter((e: any) => e.type === 'COMMERCIAL_CHANGED');
    expect(events).toHaveLength(2);
    expect(events[1].description).toContain('39000.00');
    expect(events[1].actorName).toBe(ACTOR.name);
  });

  it('accepts an order dated before the quotation, and records the anomaly', async () => {
    const { prisma, state } = makePrisma({ assets: [asset()], jobs: [quoted()] });
    const service = new MaintenanceService(prisma);

    // Not refused. The wait this would corrupt is already refused by
    // hoursBetween, so refusing here only stopped real paperwork being
    // entered — an order signed before the quote was written up is the
    // client's admin lag, not a lie.
    const result = await service.recordCommercial(COMPANY, ACTOR, 'job-1', {
      quotationAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      purchaseOrderNumber: 'PO-1',
      purchaseOrderAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    });

    expect(result.anomalies.join(' ')).toMatch(/before the quotation/i);

    // The reason the wait is blank travels with the change, so the record
    // explains itself later rather than just looking wrong.
    const events = state.events.filter((e: any) => e.type === 'COMMERCIAL_CHANGED');
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0].metadata ?? {})).toMatch(/before the quotation/i);
  });

  it('refuses to invoice work that is not complete', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [quoted()] });
    const service = new MaintenanceService(prisma);
    await expect(
      service.recordCommercial(COMPANY, ACTOR, 'job-1', {
        invoicedAt: new Date(Date.now() - 86400000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cannot be pointed at a card belonging to another tenant', async () => {
    const { prisma } = makePrisma({ assets: [asset()], jobs: [quoted()] });
    const service = new MaintenanceService(prisma);
    await expect(
      service.recordCommercial(OTHER, ACTOR, 'job-1', { quotationAmount: 1000 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses money on a cancelled card', async () => {
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [job({ id: 'job-1', status: 'CANCELLED', cancelledReason: 'Raised against the wrong unit.' })],
    });
    const service = new MaintenanceService(prisma);
    await expect(
      service.recordCommercial(COMPANY, ACTOR, 'job-1', { quotationAmount: 1000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not blank the rest of the chain when one step is recorded', async () => {
    // Dates relative to now: a fixed future date is legitimately refused.
    const fourDaysAgo = new Date(Date.now() - 4 * 86400000);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    const { prisma } = makePrisma({ assets: [asset()], jobs: [quoted()] });
    const service = new MaintenanceService(prisma);

    await service.recordCommercial(COMPANY, ACTOR, 'job-1', {
      quotationAmount: 42500,
      quotationAt: fourDaysAgo.toISOString(),
    });
    const after = await service.recordCommercial(COMPANY, ACTOR, 'job-1', {
      purchaseOrderNumber: 'PO-2026-118423',
      purchaseOrderAt: twoDaysAgo.toISOString(),
    });

    expect(after.quotationAmount).toBe(42500);
    expect(after.commercial.quoteToOrderHours).toBe(48);
    expect(after.commercial.nextStep).toBe('WORKED');
  });

  it('reports quoted against actual from the cost rows, not from a second stored total', async () => {
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [job({ id: 'job-1', status: 'COMPLETED', completedAt: new Date(Date.now() - 2 * 86400000) })],
      costs: [
        { id: 'c1', companyId: COMPANY, jobId: 'job-1', kind: 'PART', amount: 30000 },
        { id: 'c2', companyId: COMPANY, jobId: 'job-1', kind: 'LABOUR', amount: 8100 },
      ],
    });
    const service = new MaintenanceService(prisma);

    const result = await service.recordCommercial(COMPANY, ACTOR, 'job-1', { quotationAmount: 42500 });
    expect(result.commercial.actualCost).toBe(38100);
    expect(result.commercial.variance).toBe(4400);
  });

  it('exposes the chain on the card, so the page does not have to derive it', async () => {
    const { prisma } = makePrisma({
      assets: [asset()],
      jobs: [job({ id: 'job-1', status: 'COMPLETED', completedAt: new Date(Date.now() - 2 * 86400000) })],
    });
    const service = new MaintenanceService(prisma);

    const card = await service.getJob(COMPANY, 'job-1');
    expect(card.commercial).toBeDefined();
    expect(card.commercial.uninvoiced).toBe(true);
    expect(card.commercial.nextStep).toBe('INVOICED');
  });
});
