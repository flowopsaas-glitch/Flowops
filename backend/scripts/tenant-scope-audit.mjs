#!/usr/bin/env node
/**
 * Tenant-scope audit — advisory static scan for id-only database operations.
 *
 * A multi-tenant bug of this shape shipped once already: a tenant-scoped read
 * followed by an update keyed on id alone. This scanner finds every
 * update/delete/findUnique/findFirst whose arguments do not mention companyId
 * and reports how confident it is that a preceding check protects the call.
 *
 * It is ADVISORY. It cannot see runtime control flow, so:
 *   - "unscoped"  = no companyId anywhere near the call: verify by hand.
 *   - "guarded?"  = companyId appears shortly before the call, usually a
 *                   scoped findOne(); still worth a human glance.
 * Legitimate hits exist (platform/owner endpoints, token lookups, internal
 * jobs). The point is that every one of them is a deliberate, reviewed choice.
 *
 * Usage: node scripts/tenant-scope-audit.mjs [--format table|json|summary]
 *        [--root src]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : 'src';

const OPS = ['update', 'updateMany', 'delete', 'deleteMany', 'findUnique', 'findFirst'];
const CALL = new RegExp(
  `(?:this\\.)?(?:prisma|tx|db|trx)\\.(\\w+)\\.(${OPS.join('|')})\\s*\\(`,
  'g',
);

function walk(dir) {
  const out = [];
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    return out;
  }
  if (!stat.isDirectory()) return [dir];
  for (const entry of readdirSync(dir)) {
    out.push(...walk(join(dir, entry)));
  }
  return out;
}

/** Extract the argument text of a call, respecting nested brackets. */
function extractArgs(source, startIndex) {
  let depth = 0;
  let i = source.indexOf('(', startIndex);
  const from = i;
  for (; i < source.length && i - from < 1200; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return source.slice(from + 1, i);
    }
  }
  return source.slice(from + 1, from + 1200);
}

const files = walk(ROOT).filter((f) => /\.service\.ts$/.test(f));
const findings = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  for (const match of source.matchAll(CALL)) {
    const args = extractArgs(source, match.index);
    // The where clause is what decides the scope.
    const where = /where\s*:\s*/.test(args) ? args.slice(args.search(/where\s*:\s*/)) : args;
    if (/companyId/.test(where)) continue; // already scoped

    const before = source.slice(Math.max(0, match.index - 900), match.index);
    const guarded = /companyId/.test(before);
    const line = source.slice(0, match.index).split('\n').length;

    findings.push({
      file: relative(process.cwd(), file),
      line,
      model: match[1],
      op: match[2],
      confidence: guarded ? 'guarded?' : 'unscoped',
      snippet: (lines[line - 1] || '').trim().slice(0, 110),
    });
  }
}

const summary = {
  serviceFiles: files.length,
  findings: findings.length,
  unscoped: findings.filter((f) => f.confidence === 'unscoped').length,
  probablyGuarded: findings.filter((f) => f.confidence === 'guarded?').length,
  topFiles: Object.entries(
    findings.reduce((acc, f) => {
      acc[f.file] = (acc[f.file] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([file, count]) => ({ file, count })),
};

const format = process.argv.includes('--format')
  ? process.argv[process.argv.indexOf('--format') + 1]
  : 'table';

if (format === 'json') {
  console.log(JSON.stringify({ summary, findings }, null, 2));
} else if (format === 'summary') {
  console.log(summary);
} else {
  console.log('Advisory tenant-scope audit — verify each entry by hand.\n');
  console.log('File:line'.padEnd(52) + 'Model.op'.padEnd(26) + 'Confidence');
  console.log('─'.repeat(92));
  for (const f of findings) {
    console.log(
      `${`${f.file}:${f.line}`.padEnd(52)}${`${f.model}.${f.op}`.padEnd(26)}${f.confidence}`,
    );
  }
  console.log('─'.repeat(92));
  console.log(summary);
}
