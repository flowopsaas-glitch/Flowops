import { FLOWOPS_ARCHITECTURE } from './competitive-intelligence.service';

/**
 * The build planner describes FlowOps to an LLM using FLOWOPS_ARCHITECTURE — that string is
 * the planner's ONLY briefing on how this codebase is built, and every auto-drafted issue
 * copies its conventions. A wrong convention is therefore replicated into dozens of issues
 * before anyone notices, which is exactly what happened: it told the planner that schema
 * changes are "applied via prisma db push", contradicting the migrate-deploy-only rule and
 * producing issues that would fail the drift guard.
 *
 * These assertions fail if that class of defect is reintroduced. Note they test INSTRUCTIONS,
 * not word presence: the prompt is allowed to mention `db push` in order to forbid it.
 */
describe('FLOWOPS_ARCHITECTURE (build-planner prompt)', () => {
  // "applied via X" / "applied with X" is how the prompt tells the planner to change the schema.
  const APPLIED_VIA = /applied\s+(via|with|using|by)\s*'?`?\s*(prisma\s+)?(db\s+push|migrate\s+dev)/i;

  it('never instructs the planner to apply schema changes with prisma db push', () => {
    expect(FLOWOPS_ARCHITECTURE).not.toMatch(APPLIED_VIA);
  });

  it('directs schema changes to a migration folder applied by migrate deploy', () => {
    expect(FLOWOPS_ARCHITECTURE).toMatch(/prisma\/migrations\//);
    expect(FLOWOPS_ARCHITECTURE).toMatch(/migrate deploy/);
  });

  it('warns that Postgres caps identifier names at 63 bytes', () => {
    // Learned the hard way: Postgres and Prisma truncate long index names differently, so an
    // unpinned @@index spanning several columns is rejected by the drift guard.
    expect(FLOWOPS_ARCHITECTURE).toMatch(/63 bytes/);
  });

  it('records that companyId does not by itself imply a company foreign key', () => {
    // Adding an undeclared FK is migration drift, and it already broke one rail migration.
    expect(FLOWOPS_ARCHITECTURE).toMatch(/companyId/i);
    expect(FLOWOPS_ARCHITECTURE).toMatch(/foreign key/i);
  });

  it('still describes the conventions the planner is meant to follow', () => {
    expect(FLOWOPS_ARCHITECTURE).toMatch(/NestJS/);
    expect(FLOWOPS_ARCHITECTURE).toMatch(/BillingService\.hasFeature/);
    expect(FLOWOPS_ARCHITECTURE).toMatch(/EventsGateway/);
  });
});
