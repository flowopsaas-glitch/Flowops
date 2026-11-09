import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tenant provisioning defaults — FlowOps™
 *
 * An approved signup used to produce a `Company` row and an admin `User` and
 * nothing else. The tenant then landed on an empty workspace where every
 * costing screen needed a CommercialConfig row that did not exist and SKU
 * numbering had no sequence to draw from, so the first thing a new client did
 * was hunt through settings guessing at numbers. That manual wake is what caps
 * how many clients can be taken on in a month.
 *
 * This service gives a new tenant its defaults so it is usable the moment the
 * welcome email lands.
 *
 * Two rules shape it:
 *
 *  - IDEMPOTENT. Provisioning runs after approval and can be retried (a failed
 *    deploy, a manual re-run, a support request). Every write is an upsert
 *    keyed on companyId, so running it twice is the same as running it once.
 *    No "already provisioned" state to get out of sync.
 *
 *  - TENANT-CONTEXTUALISED. It runs inside prisma.withTenant(), which sets
 *    app.company_id for the transaction. Row-level security is PHASE 1 (off),
 *    so this costs nothing today, but it means these writes are covered the
 *    moment the flag is flipped — and the tenant-context ratchet counts them
 *    as protected rather than as unprotected gaps.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Give a newly created tenant its working defaults.
   *
   * Safe to call more than once for the same company. Returns what exists
   * afterwards rather than what was created, so a caller can log or assert on
   * the end state without caring whether this run did the work.
   */
  async provisionDefaults(companyId: string): Promise<{
    commercialConfig: boolean;
    skuSequence: boolean;
  }> {
    return this.prisma.withTenant(companyId, async (tx) => {
      // Every field on both models has a schema-level default, so an empty
      // create is a complete, sane configuration — not a blank one. The values
      // (fuel R2.50/km, driver R45/hr, 35% target margin) are the South
      // African road-freight starting points already encoded in the schema.
      await tx.commercialConfig.upsert({
        where: { companyId },
        create: { companyId },
        update: {}, // never overwrite a tenant that has tuned its own numbers
      });

      await tx.skuSequence.upsert({
        where: { companyId },
        create: { companyId },
        update: {},
      });

      const [commercialConfig, skuSequence] = await Promise.all([
        tx.commercialConfig.findUnique({ where: { companyId }, select: { id: true } }),
        tx.skuSequence.findUnique({ where: { companyId }, select: { id: true } }),
      ]);

      return {
        commercialConfig: Boolean(commercialConfig),
        skuSequence: Boolean(skuSequence),
      };
    });
  }

  /**
   * Provision defaults, reporting failure instead of throwing.
   *
   * A tenant without its defaults is inconvenient; a tenant that fails to
   * approve at all is a lost client. So defaults are best-effort: if they fail
   * the tenant still exists and can be fixed by re-running
   * `provisionDefaults`, and the failure is logged with enough detail to do
   * exactly that.
   */
  async provisionDefaultsSafely(companyId: string): Promise<boolean> {
    try {
      await this.provisionDefaults(companyId);
      return true;
    } catch (err: any) {
      this.logger.error(
        `Tenant ${companyId} was created without provisioning defaults — ` +
          `re-run provisionDefaults(${companyId}). ${err?.message ?? err}`,
      );
      return false;
    }
  }
}
