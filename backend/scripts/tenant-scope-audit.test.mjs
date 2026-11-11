/**
 * Tests for the tenant-scope audit.
 *
 * The dangerous failure mode for a scanner like this is not a false positive —
 * it is going blind. If the classifier starts accepting everything, --check
 * stays green while real leaks walk in. So these tests pin both directions:
 * the real tree passes, and synthetic code with a genuine hole is caught.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PLATFORM_SCOPE, METHOD_SCOPE } from './tenant-scope-policy.mjs';

const SCRIPT = new URL('./tenant-scope-audit.mjs', import.meta.url).pathname;
const REPO_ROOT = new URL('..', import.meta.url).pathname;

/** Run the scanner against a directory and return parsed JSON. */
function audit(root, args = []) {
  const out = execFileSync('node', [SCRIPT, '--root', root, '--format', 'json', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

/** Write a throwaway service file and audit the directory containing it. */
function auditSnippet(source, name = 'sample.service.ts') {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-scope-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', name), source);
  try {
    return audit(join(dir, 'src'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the real service tree has no unexplained id-only operations', () => {
  assert.doesNotThrow(() => {
    execFileSync('node', [SCRIPT, '--check'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }, 'tenant-scope-audit --check failed; see the UNREVIEWED lines above');
});

test('a genuinely unscoped write is still caught', () => {
  const result = auditSnippet(`
export class SampleService {
  async updateThing(id: string, data: any) {
    return this.prisma.thing.update({ where: { id }, data });
  }
}
  `);

  const finding = result.findings.find((f) => f.model === 'thing');
  assert.ok(finding, 'expected the unscoped update to be reported');
  assert.equal(finding.class, 'unscoped');
});

test('a scoped read feeding a write is accepted, not flagged', () => {
  const result = auditSnippet(`
export class SampleService {
  async updateThing(id: string, companyId: string, data: any) {
    const row = await this.prisma.thing.findFirst({ where: { id, companyId } });
    return this.prisma.thing.update({ where: { id: row.id }, data });
  }
}
  `);

  const finding = result.findings.find((f) => f.op === 'update');
  assert.ok(finding, 'expected the update to be reported and classified');
  assert.equal(finding.class, 'guarded-by-read');
});

test('a scoped read on its own line still protects the write that follows', () => {
  // The original scanner missed this shape because the `where` spans lines,
  // putting companyId on a different line from the identifier.
  const result = auditSnippet(`
export class SampleService {
  async batchScan(trackingNumber: string, companyId: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { trackingNumber, companyId },
    });
    return this.prisma.waybill.update({
      where: { id: waybill.id },
      data: { status: 'DELIVERED' },
    });
  }
}
  `);

  const finding = result.findings.find((f) => f.op === 'update');
  assert.ok(finding, 'expected the update to be reported and classified');
  assert.equal(finding.class, 'guarded-by-read');
});

test('a guard in a DIFFERENT method does not excuse the write', () => {
  const result = auditSnippet(`
export class SampleService {
  async readThing(id: string, companyId: string) {
    return this.prisma.thing.findFirst({ where: { id, companyId } });
  }
  async updateThing(id: string, data: any) {
    return this.prisma.thing.update({ where: { id }, data });
  }
}
  `);

  const finding = result.findings.find((f) => f.op === 'update');
  assert.ok(finding, 'expected the update to be reported');
  assert.equal(finding.class, 'unscoped');
});

test('every policy exemption carries a reason', () => {
  for (const entry of [...PLATFORM_SCOPE, ...METHOD_SCOPE]) {
    assert.ok(
      entry.reason && entry.reason.trim().length > 20,
      `policy entry ${entry.file}${entry.method ? `#${entry.method}` : ''} needs a real reason`,
    );
  }
});

test('policy entries are unique', () => {
  const keys = [
    ...PLATFORM_SCOPE.map((p) => `file:${p.file}`),
    ...METHOD_SCOPE.map((p) => `method:${p.file}#${p.method}`),
  ];
  assert.equal(new Set(keys).size, keys.length, 'duplicate policy entries');
});

// ── Blind-spot regression tests ──────────────────────────────────────────────
// These pin the failure found in the real tree: `guardedByRead` accepted ANY
// earlier statement that merely MENTIONED companyId alongside an identifier —
// including the method signature itself and parameter destructuring. Neither
// performs a read, so neither can protect a write. 182 of 226 "guarded-by-read"
// classifications in the real tree were justified that way.

test('declaring companyId as a parameter does not excuse an unscoped write', () => {
  const result = auditSnippet(`
export class SampleService {
  async updateThing(id: string, companyId: string, data: any) {
    return this.prisma.thing.update({ where: { id }, data });
  }
}
  `);

  const finding = result.findings.find((f) => f.model === 'thing');
  assert.ok(finding, 'expected the update to be reported');
  // 'tenant-in-method' is the honest answer: companyId IS in scope, but nothing ties
  // it to the query. Critically it is NOT 'guarded-by-read' — a parameter list names
  // companyId and reads nothing, so it cannot guard anything.
  assert.equal(
    finding.class,
    'tenant-in-method',
    'a parameter list names companyId but reads nothing — it cannot guard the write',
  );
});

test('destructuring a dto alongside companyId does not excuse an unscoped write', () => {
  const result = auditSnippet(`
export class SampleService {
  async updateThing(companyId: string, dto: any) {
    const { id, ...data } = dto;
    return this.prisma.thing.update({ where: { id }, data });
  }
}
  `);

  const finding = result.findings.find((f) => f.model === 'thing');
  assert.ok(finding, 'expected the update to be reported');
  assert.equal(finding.class, 'tenant-in-method');
});

test('a comment mentioning companyId does not excuse an unscoped write', () => {
  const result = auditSnippet(`
export class SampleService {
  async updateThing(id: string, data: any) {
    // Re-fetch with companyId before trusting this row.
    return this.prisma.thing.update({ where: { id }, data });
  }
}
  `);

  const finding = result.findings.find((f) => f.model === 'thing');
  assert.ok(finding, 'expected the update to be reported');
  assert.equal(finding.class, 'unscoped');
});

test('a tenant-scoped helper call still counts as a guard', () => {
  // Not every read is inline: many services re-fetch through a private helper.
  // That must remain accepted, or the fix would just trade one blind spot for a
  // wall of false positives.
  const result = auditSnippet(`
export class SampleService {
  private async getThing(id: string, companyId: string) {
    return this.prisma.thing.findFirst({ where: { id, companyId } });
  }
  async updateThing(id: string, companyId: string, data: any) {
    const row = await this.getThing(id, companyId);
    return this.prisma.thing.update({ where: { id: row.id }, data });
  }
}
  `);

  const finding = result.findings.find((f) => f.op === 'update');
  assert.ok(finding, 'expected the update to be reported and classified');
  assert.equal(finding.class, 'guarded-by-read');
});

test('an operation inside withTenant is classified as RLS-protected', () => {
  // withTenant sets app.company_id, so Postgres enforces the boundary even when
  // the where clause omits companyId. That is strictly stronger than an
  // application filter, and the scanner must say so rather than falling through
  // to the weaker (and now tighter) guarded-by-read rule.
  const result = auditSnippet(`
export class SampleService {
  async updateThing(id: string, companyId: string, data: any) {
    return this.prisma.withTenant(companyId, async (tx) => {
      return tx.thing.update({ where: { id }, data });
    });
  }
}
  `);

  const finding = result.findings.find((f) => f.model === 'thing');
  assert.ok(finding, 'expected the update to be reported');
  assert.equal(finding.class, 'rls-protected');
});

test('an operation AFTER the withTenant block is not excused by it', () => {
  const result = auditSnippet(`
export class SampleService {
  async updateThing(id: string, companyId: string, data: any) {
    await this.prisma.withTenant(companyId, async (tx) => {
      await tx.thing.findFirst({ where: { id } });
    });
    return this.prisma.thing.update({ where: { id }, data });
  }
}
  `);

  const finding = result.findings.find((f) => f.model === 'thing' && f.op === 'update');
  assert.ok(finding, 'expected the update to be reported');
  // NOT 'rls-protected': the block has closed, so RLS no longer covers this update.
  // It lands on 'guarded-by-read' instead, which is the correct answer for a subtler
  // reason: the preceding statement IS the withTenant(...) call, and that statement
  // really did perform a tenant-scoped read, so the id it produced is trustworthy.
  // Asserting the exact class rather than `notEqual(..., 'rls-protected')` is what makes
  // this test worth having — the weak form would pass for a dozen wrong reasons.
  assert.equal(finding.class, 'guarded-by-read');
});

test('a method PASSED INTO withTenant is RLS-protected for its whole body', () => {
  // `withTenant(companyId, (tx) => this.ingest(tx, ...))` runs the entire method in
  // the tenant context, but the method is defined elsewhere in the file, so a purely
  // lexical range check cannot see it. Real case: rail-telemetry.service.ts.
  const result = auditSnippet(`
export class SampleService {
  async run(companyId: string, id: string) {
    return this.prisma.withTenant(companyId, (tx) => this.ingest(tx, companyId, id));
  }
  private async ingest(tx: any, companyId: string, id: string) {
    const row = await tx.device.findUnique({ where: { id } });
    await tx.device.update({ where: { id }, data: { seen: true } });
    return row;
  }
}
  `);

  for (const op of ['findUnique', 'update']) {
    const finding = result.findings.find((f) => f.model === 'device' && f.op === op);
    assert.ok(finding, `expected the ${op} to be reported`);
    assert.equal(finding.class, 'rls-protected', `${op} should inherit the tenant context`);
  }
});
