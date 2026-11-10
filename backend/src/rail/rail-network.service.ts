import { Injectable } from '@nestjs/common';
import type { EscalationStage, RailEscalationRung, RailNetwork } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Rail networks and their escalation ladders.
 *
 * The ladder used to be `enum EscalationStage`, whose values name Transnet
 * posts. Every rail tenant saw them: a client operating outside South Africa
 * watched their deviations escalate to a TRIM Head of Access Seeker Service —
 * a job that does not exist in their market — on a clock set by Annexure 28
 * rather than by their own access contract. How long each rung gets, and who
 * it goes to, are properties of a network, not of the platform.
 *
 * Two rules the old enum carried in prose and which the resolver now enforces
 * mechanically, whichever network is configured:
 *
 *   A rung marked manual-only is never reached by the clock. Lodging with a
 *   regulator is a decision a person makes, and a timer must not make it.
 *
 *   The clock stops at the terminal rung. The final decision-maker is entitled
 *   to their full window before anyone refers the item onward.
 */
@Injectable()
export class RailNetworkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The ladder the previous code hardcoded, as data.
   *
   * This is the fallback, not the usual path: it is what a report resolves
   * against when it names no network and the table has not been seeded. Keeping
   * it in code means this change cannot break an existing tenant even if the
   * migration applied but the seed did not — behaviour is identical either way.
   */
  static readonly TRANSNET_FALLBACK: ReadonlyArray<{
    code: string;
    title: string;
    role: string;
    afterHours: number;
    ordinal: number;
    isManualOnly: boolean;
    isTerminal: boolean;
    legacyStage: EscalationStage;
  }> = [
    {
      code: 'liaison-manager',
      title: 'Access Seeker Liaison Manager',
      role: 'TRIM Access Seeker Liaison Manager',
      afterHours: 0,
      ordinal: 10,
      isManualOnly: false,
      isTerminal: false,
      legacyStage: 'LIAISON_MANAGER_24H' as EscalationStage,
    },
    {
      code: 'head-access-seeker',
      title: 'Head of Access Seeker Service',
      role: 'TRIM Head of Access Seeker Service',
      afterHours: 24,
      ordinal: 20,
      isManualOnly: false,
      isTerminal: false,
      legacyStage: 'HEAD_LIAISON_48H' as EscalationStage,
    },
    {
      code: 'head-nspo',
      title: 'Head of Network Service Planning and Operations',
      role: 'TRIM Head of Network Service Planning and Operations',
      afterHours: 48,
      ordinal: 30,
      isManualOnly: false,
      isTerminal: false,
      legacyStage: 'HEAD_NSPO_72H' as EscalationStage,
    },
    {
      code: 'route-logistics-forum',
      title: 'Route Logistics Forum',
      role: 'Route Logistics Forum',
      afterHours: 96,
      ordinal: 40,
      isManualOnly: false,
      isTerminal: true,
      legacyStage: 'ROUTE_LOGISTICS_FORUM' as EscalationStage,
    },
    {
      code: 'regulator-dispute',
      title: 'Dispute with the Regulator',
      role: 'Transport Economic Regulator (Rail)',
      afterHours: 96,
      ordinal: 50,
      isManualOnly: true,
      isTerminal: true,
      legacyStage: 'REGULATOR_DISPUTE' as EscalationStage,
    },
  ];

  /**
   * The ladder for a network, rungs in ascending order.
   *
   * Falls back to the Transnet ladder when the network is unknown or the table
   * has no rows for it, so a missing seed degrades to today's behaviour rather
   * than to an empty ladder that silently stops escalating.
   */
  async ladderFor(networkId: string | null | undefined): Promise<RailEscalationRungView[]> {
    if (networkId) {
      const rows = await this.prisma.railEscalationRung.findMany({
        where: { networkId },
        orderBy: [{ afterHours: 'asc' }, { ordinal: 'asc' }],
      });
      if (rows.length > 0) return rows;
    }
    return RailNetworkService.TRANSNET_FALLBACK.map((r, i) => ({
      id: `fallback-${r.code}`,
      networkId: networkId ?? null,
      ...r,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      // preserve declaration order for the fallback ladder
      ordinal: r.ordinal ?? i,
    })) as RailEscalationRungView[];
  }

  /**
   * What each ROLE KEY is called on Transnet's network.
   *
   * These are the fallback, and unlike the ladder they are also the defaults
   * for every network: a network that labels only some roles still reads as a
   * sentence for the rest, because an operator reading "planned occupation
   * only affects SOMETHING-caused cancellations" cannot act on it.
   */
  static readonly TRANSNET_ROLE_LABELS: Readonly<Record<string, string>> = {
    TRIM: 'Transnet Rail Infrastructure Manager (TRIM)',
    TOC: 'Train Operating Company (TOC)',
    FORCE_MAJEURE: 'Force majeure',
    UNDETERMINED: 'Undetermined - decided at the Clearinghouse',
    YARD_OPERATOR: 'Yard operator',
    PORT_TERMINAL_OPERATOR: 'Port terminal operator',
    PRASA_OTHER_IM: 'PRASA or another infrastructure manager',
  };

  /**
   * The word to show an operator for a role key, on a given network.
   *
   * Falls back to the Transnet label, and failing that to the key itself.
   * Showing a raw enum value is worse than showing Transnet's name, and
   * showing Transnet's name to a European operator is its own small wrong --
   * but inventing a name is not an option, so the key is the honest last
   * resort.
   */
  async roleLabel(
    networkId: string | null | undefined,
    role: string,
    companyId?: string | null,
  ): Promise<string> {
    // Scoped, not merely filtered by id. A tenant may define their own
    // network, and looking one up by primary key without a tenant in the
    // WHERE clause reads another tenant's row just as happily as this
    // tenant's -- the id is not a permission. With no companyId the lookup
    // deliberately matches only the shared presets, which is the safe failure.
    const network = networkId
      ? await this.prisma.railNetwork.findFirst({
          where: {
            id: networkId,
            ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : { companyId: null }),
          },
        })
      : null;
    const labels = (network?.roleLabels ?? null) as Record<string, unknown> | null;
    const own = labels && typeof labels === 'object' ? labels[role] : null;
    if (typeof own === 'string' && own.trim() !== '') return own;
    return RailNetworkService.TRANSNET_ROLE_LABELS[role] ?? role;
  }

  /**
   * The network assumed when a report does not name one.
   *
   * Tenant-aware, and deliberately in two steps. A tenant may define its own
   * default network alongside the platform preset, so a bare
   * `findFirst({ where: { isDefault: true } })` would hand back whichever row
   * the planner reached first — possibly another tenant's network, silently
   * changing whose escalation clock a report runs on. Read the tenant's own
   * default first, then fall back to the shared preset.
   */
  async defaultNetwork(companyId?: string | null): Promise<RailNetwork | null> {
    if (companyId) {
      const own = await this.prisma.railNetwork.findFirst({
        where: { isDefault: true, companyId },
        orderBy: { createdAt: 'asc' },
      });
      if (own) return own;
    }
    return this.prisma.railNetwork.findFirst({
      where: { isDefault: true, companyId: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * The rung an item should sit on given hours elapsed since the window closed:
   * the highest rung whose threshold has passed.
   *
   * Manual-only rungs are skipped — the clock never files a regulator dispute.
   */
  async rungForElapsedHours(
    networkId: string | null | undefined,
    hours: number,
  ): Promise<RailEscalationRungView | null> {
    const ladder = (await this.ladderFor(networkId)).filter((r) => !r.isManualOnly);
    if (ladder.length === 0) return null;
    // `afterHours` is exclusive: a rung is reached once elapsed time has gone
    // PAST its threshold, not on reaching it. Transnet's ladder was written as
    // `hours <= 24 -> liaison`, so an item at exactly 24h is still with the
    // liaison manager and only moves on the 24h mark being passed. Using >=
    // here would promote every item a hair early and quietly shorten every
    // rung by a step.
    let chosen = ladder[0];
    for (const rung of ladder) {
      if (hours > rung.afterHours && rung.afterHours >= chosen.afterHours) chosen = rung;
    }
    return chosen;
  }

  /** The rung a stored legacy enum value now corresponds to. */
  async rungForLegacyStage(
    networkId: string | null | undefined,
    stage: EscalationStage,
  ): Promise<RailEscalationRungView | null> {
    const ladder = await this.ladderFor(networkId);
    return ladder.find((r) => r.legacyStage === stage) ?? null;
  }
}

export type RailEscalationRungView = RailEscalationRung;
