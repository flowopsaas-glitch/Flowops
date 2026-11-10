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

describe('RailNetworkService — the default network is tenant-scoped', () => {
  /**
   * The tenant-scope audit caught this, and it is worth a test of its own
   * because the failure is silent: an unscoped `findFirst({ isDefault: true })`
   * returns whichever row the planner reaches first, so a tenant with their
   * own default network can be escalated on another tenant's ladder, or on
   * the platform preset, with nothing logged and nothing thrown.
   *
   * The rule being pinned: a tenant's own default network wins, then the
   * shared platform preset, and never another tenant's.
   */
  function svcWith(networks: Array<Record<string, unknown>>) {
    const prisma = {
      railNetwork: {
        // Mirrors the real two-step read: honour companyId, then fall back to
        // the shared preset. A fake that ignores the clause would let an
        // unscoped query look correct.
        findFirst: jest.fn(async ({ where }: any) => {
          const hit = networks.find((n) => {
            if (where?.isDefault !== undefined && !!n.isDefault !== !!where.isDefault) return false;
            if (where && 'companyId' in where && n.companyId !== where.companyId) return false;
            return true;
          });
          return hit ?? null;
        }),
      },
      railEscalationRung: { findMany: jest.fn(async () => []) },
    } as any;
    return new RailNetworkService(prisma);
  }

  const preset = { id: 'net-transnet', isDefault: true, companyId: null, code: 'transnet' };
  const tenantA = { id: 'net-a', isDefault: true, companyId: 'A', code: 'a-rail' };
  const tenantB = { id: 'net-b', isDefault: true, companyId: 'B', code: 'b-rail' };

  it("a tenant with their own default gets their own, not the platform's", async () => {
    const svc = svcWith([preset, tenantA]);
    expect((await svc.defaultNetwork('A'))?.id).toBe('net-a');
  });

  it('a tenant with no default of their own falls back to the platform preset', async () => {
    const svc = svcWith([preset, tenantA]);
    expect((await svc.defaultNetwork('C'))?.id).toBe('net-transnet');
  });

  it("never returns another tenant's network", async () => {
    // Row order is the trap: an unscoped findFirst over this array returns
    // tenant B's network for tenant A, silently.
    const svc = svcWith([tenantB, tenantA, preset]);
    expect((await svc.defaultNetwork('A'))?.id).toBe('net-a');
  });

  it('a null companyId reads only the platform preset', async () => {
    const svc = svcWith([tenantB, tenantA, preset]);
    expect((await svc.defaultNetwork(null))?.id).toBe('net-transnet');
  });

  it('returns null when there is no default at all, rather than any network', async () => {
    const svc = svcWith([{ id: 'net-x', isDefault: false, companyId: null, code: 'x' }]);
    expect(await svc.defaultNetwork('A')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('RailNetworkService — role labels are per-network, not Transnet', () => {
  /**
   * The attribution and initiator enums name ROLES -- the infrastructure
   * manager, the train operator -- but their values are Transnet's names for
   * those roles: TRIM, PRASA. The logic that decides who bears a cancellation
   * is universal; only the word shown to the operator is not.
   *
   * So this is a labelling problem, not a logic problem, and it is worth being
   * precise about that: no penalty, refund or deadline changes here. What
   * changes is that a UK operator is no longer told their cancellation was
   * caused by "TRIM", an entity with no contractual relationship to them.
   *
   * The enum values stay as they are. They are stable keys that appear in
   * persisted rows, API contracts and DTO validation; renaming them would be a
   * migration and a breaking change to buy a cosmetic improvement.
   */

  const prismaWith = (networks: Array<Record<string, unknown>>) =>
    ({
      railNetwork: {
        findFirst: jest.fn(async ({ where }: any) => {
          const ok = (n: Record<string, unknown>): boolean => {
            if (where?.id && n.id !== where.id) return false;
            if (where?.isDefault !== undefined && !!n.isDefault !== !!where.isDefault) return false;
            if (where && 'companyId' in where && n.companyId !== where.companyId) return false;
            // mirrors the resolver's OR [{ companyId }, { companyId: null }]
            if (Array.isArray(where?.OR)) {
              const allowed = where.OR.some((c: any) =>
                c.companyId === null ? n.companyId === null : n.companyId === c.companyId);
              if (!allowed) return false;
            }
            return true;
          };
          const hit = networks.find(ok);
          return hit ?? null;
        }),
      },
      railEscalationRung: { findMany: jest.fn(async () => []) },
    }) as any;

  it('a Transnet network names the infrastructure manager as Transnet does', async () => {
    const svc = new RailNetworkService(prismaWith([{ id: 'net-transnet', companyId: null, roleLabels: null }]));
    const label = await svc.roleLabel('net-transnet', 'TRIM');
    expect(label).toMatch(/Transnet/);
  });

  it('another network names its own infrastructure manager', async () => {
    const svc = new RailNetworkService(prismaWith([
      { id: 'net-uk', companyId: null, roleLabels: { TRIM: 'Network Rail', TOC: 'Train Operator' } },
    ]));
    expect(await svc.roleLabel('net-uk', 'TRIM')).toBe('Network Rail');
    expect(await svc.roleLabel('net-uk', 'TOC')).toBe('Train Operator');
  });

  it('no Transnet name leaks into another network\'s label', async () => {
    const svc = new RailNetworkService(prismaWith([
      { id: 'net-uk', companyId: null, roleLabels: { TRIM: 'Network Rail', PRASA_OTHER_IM: 'Other Infrastructure Manager' } },
    ]));
    for (const role of ['TRIM', 'PRASA_OTHER_IM']) {
      expect(await svc.roleLabel('net-uk', role)).not.toMatch(/TRIM|Transnet|PRASA/i);
    }
  });

  it('a role the network did not label falls back to the Transnet label, not to nothing', async () => {
    // Partial seeds are the realistic case: someone adds a network and labels
    // what they care about. An unlabelled role must still read as a sentence.
    const svc = new RailNetworkService(prismaWith([
      { id: 'net-uk', companyId: null, roleLabels: { TRIM: 'Network Rail' } },
    ]));
    expect(await svc.roleLabel('net-uk', 'FORCE_MAJEURE')).toBeTruthy();
    expect(await svc.roleLabel('net-uk', 'FORCE_MAJEURE')).toMatch(/force majeure/i);
  });

  it('a role with no label anywhere degrades to the key rather than inventing a name', async () => {
    const svc = new RailNetworkService(prismaWith([{ id: 'net-x', companyId: null, roleLabels: {} }]));
    expect(await svc.roleLabel('net-x', 'SOMETHING_UNHEARD_OF')).toBe('SOMETHING_UNHEARD_OF');
  });

  it('an unknown network still gets a usable Transnet label', async () => {
    const svc = new RailNetworkService(prismaWith([]));
    expect(await svc.roleLabel('net-does-not-exist', 'TRIM')).toMatch(/Transnet/);
  });

  it('every role in the attribution and initiator enums has a Transnet label', async () => {
    // If a role ships with no fallback, the UI renders a raw enum key to an
    // operator trying to work out who owes them money.
    const svc = new RailNetworkService(prismaWith([]));
    for (const role of [
      'TRIM', 'TOC', 'FORCE_MAJEURE', 'UNDETERMINED',
      'YARD_OPERATOR', 'PORT_TERMINAL_OPERATOR', 'PRASA_OTHER_IM',
    ]) {
      const label = await svc.roleLabel(null, role);
      expect(label).not.toBe(role);
      expect(label.length).toBeGreaterThan(2);
    }
  });
});

describe('RailNetworkService — reading a network by id is tenant-scoped', () => {
  /**
   * The tenant-scope audit caught roleLabel() reading by primary key with no
   * tenant in the WHERE clause. An id is not a permission: handed one from
   * anywhere, that query reads another tenant's network just as happily as
   * this tenant's.
   */
  const prismaWith = (networks: Array<Record<string, unknown>>) =>
    ({
      railNetwork: {
        findFirst: jest.fn(async ({ where }: any) => {
          const hit = networks.find((n) => {
            if (where?.id && n.id !== where.id) return false;
            if (where && 'companyId' in where && n.companyId !== where.companyId) return false;
            if (Array.isArray(where?.OR)) {
              const allowed = where.OR.some((c: any) =>
                c.companyId === null ? n.companyId === null : n.companyId === c.companyId);
              if (!allowed) return false;
            }
            return true;
          });
          return hit ?? null;
        }),
      },
      railEscalationRung: { findMany: jest.fn(async () => []) },
    }) as any;

  const shared = { id: 'net-preset', companyId: null, roleLabels: { TRIM: 'Transnet' } };
  const mine = { id: 'net-mine', companyId: 'A', roleLabels: { TRIM: 'My Rail' } };
  const theirs = { id: 'net-theirs', companyId: 'B', roleLabels: { TRIM: 'Their Rail' } };

  it("reads the tenant's own network", async () => {
    const svc = new RailNetworkService(prismaWith([shared, mine, theirs]));
    expect(await svc.roleLabel('net-mine', 'TRIM', 'A')).toBe('My Rail');
  });

  it("refuses another tenant's network even when the id is known", async () => {
    // The whole point: knowing the id must not be enough.
    const svc = new RailNetworkService(prismaWith([shared, mine, theirs]));
    expect(await svc.roleLabel('net-theirs', 'TRIM', 'A')).not.toBe('Their Rail');
  });

  it('reads the shared preset for any tenant', async () => {
    const svc = new RailNetworkService(prismaWith([shared, mine, theirs]));
    expect(await svc.roleLabel('net-preset', 'TRIM', 'B')).toBe('Transnet');
  });

  it('with no tenant context, matches only the shared preset — never a tenant row', async () => {
    // Fail closed: an unauthenticated read must not reach tenant-defined data.
    const svc = new RailNetworkService(prismaWith([shared, mine, theirs]));
    expect(await svc.roleLabel('net-mine', 'TRIM')).not.toBe('My Rail');
    expect(await svc.roleLabel('net-preset', 'TRIM')).toBe('Transnet');
  });
});
