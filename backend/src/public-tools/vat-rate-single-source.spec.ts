import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { SA_VAT_RATE, SA_IMPORT_UPLIFTMENT } from './sa-import-duty';

/**
 * A regression guard, not a unit test.
 *
 * The SA VAT rate was declared in three places: the shared helper, a private
 * field on CustomsService, and a bare `const` in rate-shopping. All three have
 * been collapsed onto SA_VAT_RATE. Nothing in the type system stops a fourth
 * copy appearing tomorrow — `0.15` is a perfectly valid number everywhere you
 * might type it.
 *
 * So this scans the source for a statutory rate written as a literal. It will
 * not catch a copy that imports the constant and renames it (which is fine —
 * that is still one source of truth), but it will catch the thing that
 * actually happened: someone typing 0.15 into a new file.
 *
 * If this fails because SARS changed the rate: update the constant in
 * sa-import-duty.ts and the expected value here. That is the whole point —
 * one place, and a test that tells you if you missed one.
 */

const BACKEND_SRC = path.join(__dirname, '..', '..', 'src');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'generated') continue;
      out.push(...tsFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(spec|test)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The one file allowed to state the rate as a literal. */
const CANONICAL = path.join('public-tools', 'sa-import-duty.ts');

describe('statutory rates have a single source', () => {
  const files = tsFiles(BACKEND_SRC);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('no file outside sa-import-duty.ts declares the VAT rate as a literal', () => {
    // Matches `= 0.15` as a VAT-ish assignment. Narrow on purpose: we are
    // hunting `const VAT_PCT = 0.15`, `VAT_RATE = 0.15`, `vatRate = 0.15`.
    // A bare 0.15 with no name is not worth failing the build over.
    const pattern = /(\bv[a-zA-Z_]*rate[a-zA-Z_]*\s*[:=]\s*0?\.15\b|\b0?\.15\s*(?:;|\/\/|\/\*)[^\n]*\bvat\b)/i;
    const offenders: string[] = [];

    for (const f of files) {
      if (f.endsWith(CANONICAL)) continue;
      if (f.includes(`${path.sep}prisma${path.sep}`)) continue;
      const src = fs.readFileSync(f, 'utf8');
      if (pattern.test(src)) offenders.push(path.relative(BACKEND_SRC, f));
    }

    expect(offenders).toEqual([]);
  });

  it('no file outside sa-import-duty.ts declares the upliftment as a literal', () => {
    const pattern = /\buplift[a-zA-Z_]*\s*[:=]\s*0?\.10?\b/i;
    const offenders: string[] = [];

    for (const f of files) {
      if (f.endsWith(CANONICAL)) continue;
      if (f.includes(`${path.sep}prisma${path.sep}`)) continue;
      const src = fs.readFileSync(f, 'utf8');
      if (pattern.test(src)) offenders.push(path.relative(BACKEND_SRC, f));
    }

    expect(offenders).toEqual([]);
  });

  it('the canonical values are what SARS currently charges', () => {
    // Update here and in sa-import-duty.ts together when this changes.
    expect(SA_VAT_RATE).toBe(0.15);
    expect(SA_IMPORT_UPLIFTMENT).toBe(0.1);
  });

  it('customs and rate-shopping both import the constant rather than restating it', () => {
    const customs = fs.readFileSync(path.join(BACKEND_SRC, 'forwarding', 'customs.service.ts'), 'utf8');
    const rateShopping = fs.readFileSync(
      path.join(BACKEND_SRC, 'rate-shopping', 'rate-shopping.service.ts'),
      'utf8',
    );
    expect(customs).toMatch(/from '\.\.\/public-tools\/sa-import-duty'/);
    expect(rateShopping).toMatch(/from '\.\.\/public-tools\/sa-import-duty'/);
  });
});
