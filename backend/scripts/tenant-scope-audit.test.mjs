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
