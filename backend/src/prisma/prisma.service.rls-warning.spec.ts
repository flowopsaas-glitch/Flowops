import { PrismaService } from './prisma.service';

/**
 * `warnIfRlsIsInert` — the probe that announces a bypassed security layer.
 *
 * The property that matters most is the one that is easiest to get wrong: a
 * startup probe must never be able to stop the API booting. A database in
 * recovery, a pool that has not warmed, a role without permission to read
 * pg_roles — none of those should take the service down over a warning.
 */
function harness(queryImpl: (sql: string) => Promise<unknown>) {
  const messages: Array<{ level: string; text: string }> = [];
  const service = Object.create(PrismaService.prototype) as PrismaService;
  Object.defineProperty(service, 'logger', {
    value: {
      log: (t: string) => messages.push({ level: 'log', text: t }),
      warn: (t: string) => messages.push({ level: 'warn', text: t }),
      error: (t: string) => messages.push({ level: 'error', text: t }),
    },
  });
  Object.defineProperty(service, '$connect', { value: async () => undefined });
  Object.defineProperty(service, '$queryRawUnsafe', { value: queryImpl });
  return { service, messages };
}

const ROW = (is_superuser: string, has_bypassrls: string) => [{ is_superuser, has_bypassrls }];

describe('warnIfRlsIsInert', () => {
  it('says nothing when the connection is bound by RLS', async () => {
    const { service, messages } = harness(async () => ROW('off', 'false'));
    await service.onModuleInit();
    expect(messages.filter((m) => m.level === 'warn')).toEqual([]);
    expect(messages.some((m) => m.text === 'Database connected')).toBe(true);
  });

  it('warns loudly when the connection is a superuser', async () => {
    const { service, messages } = harness(async () => ROW('on', 'true'));
    await service.onModuleInit();
    const warn = messages.find((m) => m.level === 'warn');
    expect(warn).toBeDefined();
    expect(warn!.text).toContain('row-level security is NOT in force');
    expect(warn!.text).toContain('superuser');
    // The message has to be actionable, not just alarming: name the fix and
    // point at the analysis, or it is noise in a log someone ignores.
    expect(warn!.text).toContain('DATABASE_URL');
    expect(warn!.text).toContain('RLS-PHASE2-READINESS');
  });

  it('warns for a non-superuser role that still holds BYPASSRLS', async () => {
    const { service, messages } = harness(async () => ROW('off', 'true'));
    await service.onModuleInit();
    const warn = messages.find((m) => m.level === 'warn');
    expect(warn).toBeDefined();
    expect(warn!.text).toContain('BYPASSRLS');
  });

  // ── The property that matters most ────────────────────────────────────────

  it('never lets a failed probe stop the service booting', async () => {
    const { service, messages } = harness(async () => {
      throw new Error('permission denied for table pg_roles');
    });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(messages.some((m) => m.text === 'Database connected')).toBe(true);
  });

  it('reports a failed probe as unknown rather than as safe', async () => {
    const { service, messages } = harness(async () => {
      throw new Error('connection terminated');
    });
    await service.onModuleInit();
    const warn = messages.find((m) => m.level === 'warn');
    expect(warn).toBeDefined();
    // Must not claim RLS is fine: the absence of a warning reads as
    // "we checked, it's OK", which is exactly the lie this is here to avoid.
    expect(warn!.text).toContain('unknown rather than safe');
    expect(warn!.text).toContain('connection terminated');
  });

  it('treats an empty result as unknown, not as safe', async () => {
    // The bug this caught: `rows?.[0]` was undefined, so both comparisons were
    // false, `bypasses` was false, and the probe reported nothing. A probe that
    // learned nothing must not look like one that learned everything was fine.
    const { service, messages } = harness(async () => []);
    await service.onModuleInit();
    const warn = messages.find((m) => m.level === 'warn');
    expect(warn).toBeDefined();
    expect(warn!.text).toContain('unknown rather than safe');
  });

  it('treats a malformed row as unknown, not as safe', async () => {
    const { service, messages } = harness(async () => [{ is_superuser: null, has_bypassrls: null }]);
    await service.onModuleInit();
    const warn = messages.find((m) => m.level === 'warn');
    expect(warn).toBeDefined();
    expect(warn!.text).toContain('unknown rather than safe');
  });
});
