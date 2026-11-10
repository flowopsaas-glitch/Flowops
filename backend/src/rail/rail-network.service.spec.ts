import { Test } from '@nestjs/testing';
import { RailNetworkService } from './rail-network.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Rail networks and their escalation ladders.
 *
 * The bug these tests exist for: the ladder was an enum whose values name
 * Transnet posts, and every tenant saw it. An operator in another country
 * watched their deviations escalate to a TRIM job title that does not exist
 * in their market, on Transnet's clock.
 *
 * So two things are pinned. First, that Transnet's ladder is reproduced
 * exactly — this refactor must not move a single existing item, and the
 * boundary tests below are the old switch statement written out. Second, that
 * a different network gets a different ladder, which is the whole point: if a
 * second network resolves to Transnet's titles, this change has accomplished
 * nothing and should not have been made.
 */

/** Minimal Prisma exposing only what the resolver reads. */
function makePrisma(rungs: any[] = [], networks: any[] = []) {
  const state = { rungs, networks };
  return {
    prisma: {
      railEscalationRung: {
        findMany: async ({ where, orderBy }: any) => {
          const rows = state.rungs.filter((r) => !where?.networkId || r.networkId === where.networkId);
          const spec = Array.isArray(orderBy) ? orderBy[0] : orderBy;
          const [[field, dir]] = Object.entries(spec ?? { afterHours: 'asc' }) as [string, string][];
          return [...rows].sort((a, b) => (dir === 'desc' ? b[field] - a[field] : a[field] - b[field]));
        },
      },
      railNetwork: {
        findFirst: async ({ where }: any) =>
          state.networks.find((n) => (where?.isDefault ? n.isDefault : true)) ?? null,
      },
    } as unknown as PrismaService,
    state,
  };
}

const rung = (over: Record<string, any>) => ({
  id: `r-${over.code}`,
  networkId: 'net-x',
  title: 'Untitled',
  role: null,
  afterHours: 0,
  ordinal: 10,
  isManualOnly: false,
  isTerminal: false,
  legacyStage: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...over,
});

async function build(rungs: any[] = [], networks: any[] = []) {
  const { prisma } = makePrisma(rungs, networks);
  const mod = await Test.createTestingModule({
    providers: [RailNetworkService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return mod.get(RailNetworkService);
}

describe('RailNetworkService — the Transnet ladder is reproduced exactly', () => {
  // The previous implementation was:
  //   hours <= 24  -> LIAISON_MANAGER_24H
  //   hours <= 48  -> HEAD_LIAISON_48H
  //   hours <= 96  -> HEAD_NSPO_72H
  //   else         -> ROUTE_LOGISTICS_FORUM
  // Each case below is that switch, written out. Changing a threshold fails here.
  // `afterHours` is exclusive: an item at exactly 24h is still with the
  // liaison manager and moves only once 24h has been passed. These boundaries
  // are taken from the handshake suite, which was written against the ladder
  // as delivered in the source — not invented here.
  const cases: Array<[number, string]> = [
    [0, 'liaison-manager'],
    [1, 'liaison-manager'],
    [23, 'liaison-manager'],
    [24, 'liaison-manager'], // inclusive: still the liaison manager
    [24.01, 'head-access-seeker'],
    [47, 'head-access-seeker'],
    [48, 'head-access-seeker'], // inclusive
    [48.01, 'head-nspo'],
    [72, 'head-nspo'],
    [96, 'head-nspo'], // inclusive: NSP&O holds until 96h is passed
    [96.01, 'route-logistics-forum'],
    [200, 'route-logistics-forum'],
  ];

  it.each(cases)('%i hours elapsed resolves to %s', async (hours, code) => {
    const svc = await build();
    const resolved = await svc.rungForElapsedHours(null, hours);
    expect(resolved?.code).toBe(code);
  });

  it('carries the Transnet job titles, not generic ones', async () => {
    const svc = await build();
    const resolved = await svc.rungForElapsedHours(null, 30);
    expect(resolved?.role).toBe('TRIM Head of Access Seeker Service');
  });

  it('maps every legacy enum value onto a rung', async () => {
    const svc = await build();
    for (const stage of [
      'LIAISON_MANAGER_24H',
      'HEAD_LIAISON_48H',
      'HEAD_NSPO_72H',
      'ROUTE_LOGISTICS_FORUM',
      'REGULATOR_DISPUTE',
    ] as const) {
      const found = await svc.rungForLegacyStage(null, stage);
      expect(found).toBeTruthy();
      expect(found?.legacyStage).toBe(stage);
    }
  });
});

describe('RailNetworkService — another network gets another ladder', () => {
  // A UK-style operator: 12/36/72-hour ladder, its own job titles, no TRIM.
  const networkRail = [
    rung({ networkId: 'net-uk', code: 'duty-controller', title: 'Duty Access Controller', role: 'Network Rail Duty Access Controller', afterHours: 0, ordinal: 10, legacyStage: null }),
    rung({ networkId: 'net-uk', code: 'access-manager', title: 'Access Manager', role: 'Network Rail Access Manager', afterHours: 12, ordinal: 20, legacyStage: null }),
    rung({ networkId: 'net-uk', code: 'head-access', title: 'Head of Access', role: 'Network Rail Head of Access', afterHours: 36, ordinal: 30, legacyStage: null }),
    rung({ networkId: 'net-uk', code: 'orr-referral', title: 'Referral to ORR', role: 'Office of Rail and Road', afterHours: 72, ordinal: 40, isTerminal: true, legacyStage: null }),
    rung({ networkId: 'net-uk', code: 'regulator-dispute', title: 'Dispute with the Regulator', role: 'Office of Rail and Road', afterHours: 72, ordinal: 50, isManualOnly: true, isTerminal: true, legacyStage: null }),
  ];

  it('resolves on that network’s clock, not Transnet’s', async () => {
    const svc = await build(networkRail);
    // 30h is mid-ladder on Transnet (Head of Access Seeker Service, 24h)
    // but only the second rung here.
    expect((await svc.rungForElapsedHours('net-uk', 30))?.code).toBe('access-manager');
    expect((await svc.rungForElapsedHours('net-uk', 40))?.code).toBe('head-access');
    expect((await svc.rungForElapsedHours('net-uk', 100))?.code).toBe('orr-referral');
  });

  it('names that network’s people, never Transnet’s', async () => {
    const svc = await build(networkRail);
    const ladder = await svc.ladderFor('net-uk');
    const allText = ladder.map((r) => `${r.title} ${r.role ?? ''}`).join(' ');
    expect(allText).not.toMatch(/TRIM|Transnet|NSP&O|Route Logistics Forum/i);
    expect(allText).toMatch(/Network Rail|ORR|Office of Rail and Road/i);
  });

  it('does not leak one network’s ladder into another', async () => {
    const svc = await build(networkRail);
    const transnet = await svc.rungForElapsedHours('net-transnet', 30);
    // No rows seeded for net-transnet, so it falls back — but it must fall back
    // to Transnet, never to whichever ladder was loaded last.
    expect(transnet?.role).toBe('TRIM Head of Access Seeker Service');
  });
});

describe('RailNetworkService — the rules the enum carried in prose', () => {
  it('the clock never files a regulator dispute', async () => {
    const svc = await build();
    for (const hours of [0, 24, 96, 1000, 100_000]) {
      const resolved = await svc.rungForElapsedHours(null, hours);
      expect(resolved?.isManualOnly).toBe(false);
      expect(resolved?.code).not.toBe('regulator-dispute');
    }
  });

  it('the manual-only rung still exists for a human to choose', async () => {
    const svc = await build();
    const ladder = await svc.ladderFor(null);
    expect(ladder.some((r) => r.code === 'regulator-dispute' && r.isManualOnly)).toBe(true);
  });

  it('an unknown network falls back rather than silently stopping escalation', async () => {
    const svc = await build([]);
    const resolved = await svc.rungForElapsedHours('net-does-not-exist', 200);
    // A null here would mean items stop escalating with no error — the failure
    // mode nobody notices until a dispute is time-barred.
    expect(resolved).toBeTruthy();
    expect(resolved?.code).toBe('route-logistics-forum');
  });
});
