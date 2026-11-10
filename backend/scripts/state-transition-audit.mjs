#!/usr/bin/env node
/**
 * State-transition audit — finds status writes that are not compare-and-set.
 *
 * The bug this looks for has shipped three times in this codebase: a credit
 * note applied twice, a payment confirmed twice, a signup approved twice. The
 * shape never varies:
 *
 *     const row = await find(...)                    // read
 *     if (row.status !== 'EXPECTED') throw ...       // decide in application code
 *     await update({ where: { id }, data: { status } })   // write
 *
 * Two callers overlapping both read the same committed row, so both pass the
 * check and both write. Nothing throws and nothing fails a test — which is
 * exactly why it needs a scanner rather than care.
 *
 * The fix is to make the expectation part of the write:
 *
 *     updateMany({ where: { id, status: current }, data: { status: next } })
 *
 * so the database evaluates the WHERE against the committed row at lock time
 * and the second caller matches nothing. See
 * src/common/state-transition.ts and ClaimsService.claimStatus for the two
 * shapes of that fix already in use.
 *
 * This scanner reports, per module, the writes that still read-then-write.
 * It is a HELP FOR A HUMAN, not a verdict: a hit is a place to look, and some
 * are benign (a write guarded by an enclosing row lock, or one where two
 * concurrent writes are genuinely harmless). Read the site before changing it.
 *
 * Usage: node scripts/state-transition-audit.mjs [--format table|json]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : join(process.cwd(), 'src');

/** True when this write's WHERE already constrains status — already a CAS. */
function isCompareAndSet(body) {
  const where = /where\s*:\s*\{([\s\S]*?)\}\s*,\s*data\s*:/.exec(body);
  return Boolean(where && /\bstatus\b/.test(where[1]));
}

/**
 * The text of the method enclosing `index`, and nothing else.
 *
 * This matters more than it looks. An earlier version scanned a fixed number of
 * characters backwards, which meant an adjacent method's `updateMany` could
 * "guard" a write it had nothing to do with — a planted unguarded transition
 * passed the audit because the helper next door happened to be atomic. A guard
 * only counts if it is in the same method, running before the write.
 *
 * Methods in these services are declared at two-space indent.
 */
function enclosingMethod(text, index) {
  const upto = text.slice(0, index);
  const lines = upto.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^ {2}(?:private |public |protected )?(?:async |static )*\w+\s*[(<]/.test(lines[i])) {
      return lines.slice(i).join('\n');
    }
  }
  return upto;
}

/**
 * True when something upstream in the SAME method already serialises this
 * write: a claimTransition call, or an updateMany whose WHERE names a status.
 * Both take a row lock that the rest of the transaction then runs inside.
 */
function isGuardedByEnclosingWrite(text, index) {
  const scope = enclosingMethod(text, index);
  return (
    /claimTransition/.test(scope) ||
    /updateMany\(\s*\{[^}]*\bstatus\s*:/.test(scope)
  );
}

/** Walk the source tree, ignoring tests and generated output. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Bracket-match a `{` starting at `open`, respecting nesting. */
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return '';
}

function audit(root = ROOT) {
  const findings = [];
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(process.cwd(), file).split(sep).join('/');
    const parts = rel.split('/');
    const module = parts.length > 2 ? parts[1] : 'root';

    for (const m of text.matchAll(/\.update\(\s*\{/g)) {
      const body = matchBrace(text, m.index + m[0].length - 1);
      if (!body) continue;
      // Only status writes are in scope: renaming a client is not a transition.
      if (!/\bstatus\s*:/.test(body)) continue;
      if (isCompareAndSet(body)) continue;
      const scope = enclosingMethod(text, m.index);
      if (isGuardedByEnclosingWrite(text, m.index)) continue;
      // A write with no status read in the same method is not a
      // read-decide-write: it is a plain field edit that happens to include a
      // status, or a write whose precondition lives somewhere else entirely.
      if (!/\bstatus\b/.test(scope)) continue;
      findings.push({
        module,
        file: rel,
        line: text.slice(0, m.index).split('\n').length,
      });
    }
  }
  findings.sort((a, b) => a.module.localeCompare(b.module) || a.file.localeCompare(b.file) || a.line - b.line);
  return findings;
}

export { audit };

// Only run the CLI when invoked directly, so the test can import `audit()`
// without this file printing a table as a side effect.
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join('/').split('/').pop());
if (!invokedDirectly) {
  // imported — export only
} else {
const findings = audit();
const byModule = new Map();
for (const f of findings) {
  if (!byModule.has(f.module)) byModule.set(f.module, []);
  byModule.get(f.module).push(f);
}

if (process.argv.includes('--format') && process.argv[process.argv.indexOf('--format') + 1] === 'json') {
  console.log(
    JSON.stringify(
      {
        total: findings.length,
        modules: [...byModule.entries()]
          .map(([module, rows]) => ({ module, count: rows.length }))
          .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module)),
        findings,
      },
      null,
      2,
    ),
  );
} else {
  console.log('State-transition audit — status writes that are not compare-and-set');
  console.log('─'.repeat(72));
  for (const [module, rows] of [...byModule.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(String(rows.length).padStart(5), ' ', module);
  }
  console.log('─'.repeat(72));
  console.log(String(findings.length).padStart(5), '  TOTAL');
  console.log();
  console.log('A hit is a place to look, not a proven bug. Some are guarded by an');
  console.log('enclosing row lock, or are harmless when written twice. Read the site.');
}
}
