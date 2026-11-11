import { ObservabilityService } from './observability.service';

/**
 * OBSERVABILITY — the CLAW error observatory.
 *
 * Deliberately platform-scoped: ErrorEvent carries an OPTIONAL companyId for
 * context, and the only reader is the owner console. No tenant can see another
 * tenant's error rows, so there is no cross-tenant leak to pin here.
 *
 * Two defects, both about anonymous input:
 *
 *   1. `take: opts.limit || 100` — the same falsy-value trap as the other
 *      modules this audit has touched.
 *   2. Every NEW fingerprint triggered an AI triage call, and two of the three
 *      ingest paths are @Public(). Anyone could mint fresh fingerprints and
 *      have the server pay to read strings they wrote.
 */

function makeHarness() {
  const events: any[] = [];

  const prisma: any = {
    errorEvent: {
      findUnique: jest.fn(async ({ where }: any) => events.find((e) => e.fingerprint === where.fingerprint || e.id === where.id) ?? null),
      findMany: jest.fn(async (args: any = {}) => events.slice(0, args?.take ?? events.length)),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `ev-${events.length + 1}`, count: 1, resolved: false, ...data };
        events.push(row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const e = events.find((x) => x.fingerprint === where.fingerprint || x.id === where.id);
        if (e) {
          // Honour Prisma's { increment: n }; a bare assign would leave `count`
          // as the operator object and hide whether the row was bumped.
          for (const [k, v] of Object.entries<any>(data)) {
            if (v && typeof v === 'object' && typeof v.increment === 'number') e[k] = (e[k] ?? 0) + v.increment;
            else e[k] = v;
          }
        }
        return e;
      }),
    },
    __events: events,
  };

  return { prisma, svc: new ObservabilityService(prisma as any) };
}

describe('ObservabilityService — list() honours an explicit limit', () => {
  const takeOf = async (h: any, opts: any) => {
    await h.svc.list(opts);
    return (h.prisma.errorEvent.findMany.mock.calls.at(-1) as any)[0]?.take;
  };

  it('treats 0 as a request for the minimum, not as "unsupplied"', async () => {
    // FAILED BEFORE: `opts.limit || 100` returned a full page for an explicit 0.
    const h = makeHarness();
    expect(await takeOf(h, { limit: 0 })).toEqual(1);
  });

  it('uses an explicit in-range limit', async () => {
    const h = makeHarness();
    expect(await takeOf(h, { limit: 5 })).toEqual(5);
  });

  it('defaults to 100 when no limit is given', async () => {
    const h = makeHarness();
    expect(await takeOf(h, {})).toEqual(100);
    expect(await takeOf(h, undefined)).toEqual(100);
  });

  it('clamps a huge limit to 300', async () => {
    const h = makeHarness();
    expect(await takeOf(h, { limit: 10_000 })).toEqual(300);
  });

  it('falls back to 100 for a non-numeric limit', async () => {
    const h = makeHarness();
    expect(await takeOf(h, { limit: Number.NaN })).toEqual(100);
  });
});

describe('ObservabilityService — anonymous input must not spend AI budget', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
    fetchMock = jest.fn(async () => ({
      json: async () => ({}), // no JSON object -> triage returns early
    }));
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete (globalThis as any).fetch;
  });

  it('does NOT auto-triage a self-reported frontend error', async () => {
    // FAILED BEFORE: capture() fired AI triage on every new fingerprint, and
    // POST /observability/client-error is @Public() — so an anonymous caller
    // controlled both the text sent to the model and how often it was sent.
    const h = makeHarness();
    await h.svc.capture({ source: 'frontend', message: 'TypeError: x is undefined', stack: 'at App' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.prisma.__events).toHaveLength(1); // still recorded
  });

  it('does NOT auto-triage an integrity beacon', async () => {
    const h = makeHarness();
    await h.svc.capture({ source: 'integrity', message: 'Possible clone' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.prisma.__events).toHaveLength(1);
  });

  it('still auto-triages errors the server produced', async () => {
    const h = makeHarness();
    await h.svc.capture({ source: 'backend', message: 'PrismaClientKnownRequestError' });

    expect(fetchMock).toHaveBeenCalled();
  });

  it('triage stays available on demand for a stored frontend error', async () => {
    // The data is not discarded — an operator can still ask for triage.
    const h = makeHarness();
    const created = await h.svc.capture({ source: 'frontend', message: 'ChunkLoadError' });
    expect(fetchMock).not.toHaveBeenCalled();

    await h.svc.retriage('ev-1');
    expect(fetchMock).toHaveBeenCalled();
    expect(created.isNew).toBe(true);
  });
});

describe('ObservabilityService — capture behaviour', () => {
  it('groups repeat occurrences under one fingerprint instead of inserting rows', async () => {
    const h = makeHarness();
    const a = await h.svc.capture({ source: 'backend', message: 'Connection refused' });
    const b = await h.svc.capture({ source: 'backend', message: 'Connection refused' });

    expect(b.fingerprint).toEqual(a.fingerprint);
    expect(b.isNew).toBe(false);
    expect(h.prisma.__events).toHaveLength(1);
    expect(h.prisma.__events[0].count).toEqual(2);
  });

  it('caps the stored message and stack so public input cannot grow without bound', async () => {
    const h = makeHarness();
    await h.svc.capture({ source: 'frontend', message: 'x'.repeat(50_000), stack: 'y'.repeat(50_000) });

    expect(h.prisma.__events[0].message.length).toBeLessThanOrEqual(2000);
    expect(h.prisma.__events[0].stack.length).toBeLessThanOrEqual(8000);
  });

  it('reopens a resolved group when the error recurs', async () => {
    const h = makeHarness();
    const { fingerprint } = await h.svc.capture({ source: 'backend', message: 'Timeout' });
    await h.svc.setResolved('ev-1', true);
    const again = await h.svc.capture({ source: 'backend', message: 'Timeout' });

    expect(again.isNew).toBe(false);
    expect(h.prisma.__events[0].resolved).toBe(false);
    expect(h.prisma.__events[0].resolvedAt).toBeNull();
    expect(fingerprint).toBeTruthy();
  });
});
