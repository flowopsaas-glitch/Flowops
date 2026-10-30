import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tenant-context rollout ratchet.
 *
 * Every rail service transaction must run through `PrismaService.withTenant`
 * (which establishes the `app.company_id` RLS context) — not a bare
 * `$transaction`. This suite is the anti-regression guard: if someone re-adds
 * a context-free transaction to a rail service, the build goes red and points
 * at the file.
 *
 * Rollout status: ALL rail services converted (2026-10-12). Other modules may
 * still use bare transactions (phase-1 policies permit it); this ratchet
 * tightens as each module is converted — add its folder to SERVICE_DIRS.
 */

const SRC = join(__dirname, '..');
const SERVICE_DIRS = ['rail']; // extend as modules adopt withTenant

describe('tenant-context rollout — rail services', () => {
  const files = SERVICE_DIRS.flatMap((dir) =>
    readdirSync(join(SRC, dir))
      .filter((f) => f.endsWith('.service.ts'))
      .map((f) => ({ file: `${dir}/${f}`, src: readFileSync(join(SRC, dir, f), 'utf8') })),
  );

  it('finds the rail service files it is meant to guard', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it('has no context-free $transaction left in rail services', () => {
    const offenders = files
      .filter(({ src }) => /this\.prisma\.\$transaction/.test(src))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('every rail service that writes through a transaction uses withTenant', () => {
    const withTx = files.filter(({ src }) => /withTenant\(/.test(src));
    // The eight transaction-owning services: rail, rail-slot, rail-handshake,
    // rail-possession, rail-timetable, rail-manifest, rail-telemetry (+ any more).
    expect(withTx.length).toBeGreaterThanOrEqual(7);
    for (const { src } of files) {
      if (/this\.(prisma\.)?withTenant\(|prisma\.withTenant\(/.test(src)) {
        expect(src).toMatch(/withTenant\(companyId/);
      }
    }
  });

  it('PrismaService still defines withTenant with the SET LOCAL contract', () => {
    const prismaService = readFileSync(join(SRC, 'prisma', 'prisma.service.ts'), 'utf8');
    expect(prismaService).toContain('async withTenant<T>');
    expect(prismaService).toContain("set_config('app.company_id'");
  });
});
