#!/usr/bin/env node
/**
 * Tenant-scope audit — classifies every id-only database operation.
 *
 * A multi-tenant bug of this shape shipped once already: a tenant-scoped read
 * followed by an update keyed on id alone. This scanner finds every
 * update/delete/findUnique/findFirst whose arguments do not mention companyId,
 * and then decides WHY, because "no companyId" is not the same as "wrong".
 *
 * Classes, in the order they are decided:
 *   platform        — a file listed in the policy as cross-tenant by design
 *   reviewed        — a method listed in the policy, with the reason recorded
 *   housekeeping    — credential/token cleanup that is platform-wide
 *   identity        — a lookup by email/token/reference, which is how the
 *                     tenant is discovered in the first place
 *   guarded-by-read — a preceding STATEMENT names both companyId and the
 *                     identifier this write is keyed on: a scoped read feeding
 *                     the write. Proven mechanically, not assumed.
 *   tenant-in-method — companyId exists in the method but no statement ties it
 *                     to this call. Suspicious; needs a human or a policy entry.
 *   unscoped        — no tenant anywhere in the enclosing method.
 *
 * The last two fail --check. Every exemption carries a written reason, and an
 * exemption that stops matching anything fails the build too, so the allowlist
 * cannot quietly rot into a place where bugs hide.
 *
 * Usage: node scripts/tenant-scope-audit.mjs [--format table|json|summary]
 *        [--root src] [--check]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  PLATFORM_SCOPE,
  METHOD_SCOPE,
  IDENTITY_FIELDS,
  HOUSEKEEPING_MODELS,
} from './tenant-scope-policy.mjs';

const ROOT = process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : 'src';

const OPS = ['update', 'updateMany', 'delete', 'deleteMany', 'findUnique', 'findFirst'];
const CALL = new RegExp(
  `(?:this\\.)?(?:prisma|tx|db|trx)\\.(\\w+)\\.(${OPS.join('|')})\\s*\\(`,
  'g',
);

// A two-space-indented member declaration — but NOT `if (`, `for (`, `while (`
// and friends, which match the same shape. Missing that truncates every method
// body at its first conditional, and every guard after an `if` goes unseen.
const CONTROL = '(?!if\\b|for\\b|while\\b|switch\\b|catch\\b|return\\b|else\\b|do\\b|function\\b)';
// ...and not a bare CALL. `    numberField('x', 'y');` has the same shape as a
// declaration once the indent is stripped; what distinguishes them is that a
// call ends in `;`. Letting calls through truncates a method at its first
// helper invocation and hides every guard before it.
const METHOD_START = new RegExp(
  `^(?!.*;\\s*$)(?: {2})(?!\\s)(?:private|public|protected|readonly|static|async|override|\\s)*${CONTROL}[\\w$]+\\s*(?:<[^>]*>)?\\s*\\(`,
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
  for (const entry of readdirSync(dir)) out.push(...walk(join(dir, entry)));
  return out;
}

/** Extract the argument text of a call, respecting nested brackets. */
function extractArgs(source, startIndex) {
  let depth = 0;
  const from = source.indexOf('(', startIndex);
  for (let i = from; i < source.length && i - from < 1200; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return source.slice(from + 1, i);
    }
  }
  return source.slice(from + 1, from + 1200);
}

const stripStrings = (s) => s.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");

/** Identifiers in a `where` clause — the things a guarding statement could name. */
function identifiersIn(whereText) {
  const text = stripStrings(whereText);
  const idents = new Set();
  const withoutKeys = text.replace(/([A-Za-z_$][\w$]*)\s*:/g, ' ');
  for (const m of withoutKeys.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    const id = m[1];
    // `id` is deliberately NOT excluded: `where: { id }` is the most common
    // shape there is, and a guard naming both id and companyId is exactly the
    // read-then-write pattern we want to accept.
    if (/^(where|true|false|null|undefined|in|not|is|gt|lt|gte|lte|contains|startsWith|endsWith|mode|select|data|include|orderBy|take|skip|OR|AND|NOT)$/.test(
        id,
      )) {
      continue;
    }
    idents.add(id);
  }
  return idents;
}

/**
 * The enclosing method, as { start, end, text, offsetOf(charIndex) }.
 * NestJS services indent members by two spaces, which makes the method cheap
 * to find without parsing TypeScript — and knowing the method is what lets us
 * ask the useful question: does this function even HAVE a tenant to scope to?
 */
function enclosingMethod(lines, lineOffsets, lineNumber, charIndex) {
  const idx = lineNumber - 1;
  let start = 0;
  for (let i = idx; i >= 0; i--) {
    if (METHOD_START.test(lines[i]) && isDeclaration(lines[i])) {
      start = i;
      break;
    }
  }
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if ((METHOD_START.test(lines[i]) && isDeclaration(lines[i])) || /^\}/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const text = lines.slice(start, end).join('\n');
  return { start, end, text, offsetIn: Math.max(0, charIndex - lineOffsets[start]) };
}

/**
 * A declaration's parentheses either stay open (multi-line signature, ends in
 * `(`) or close onto a body (`) {`). A call like `actorFrom(dto),` sitting in
 * an argument list has balanced parens and no `{`, so it is not a method.
 */
function isDeclaration(line) {
  if (/\{\s*$/.test(line)) return true;
  let depth = 0;
  for (const ch of line) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return depth > 0;
}

const escapeId = (id) => id.replace(/\$/g, '\\$');

/**
 * A write is protected when an earlier STATEMENT in the same method mentions
 * both companyId and an identifier this write is keyed on. Statement-level
 * rather than line-level because a Prisma `where` routinely spans lines:
 * `const waybill = await prisma.waybill.findFirst({\n  where: { trackingNumber, companyId },\n});`
 * feeds `update({ where: { id: waybill.id } })` three lines later.
 */
function guardedByRead(method, whereText) {
  const idents = identifiersIn(whereText);
  if (idents.size === 0) return null;
  const prefix = method.text.slice(0, method.offsetIn);
  const statements = prefix.split(';');
  for (let i = statements.length - 1; i >= 0; i--) {
    const stmt = statements[i];
    if (!/\bcompanyId\b/.test(stmt)) continue;
    for (const id of idents) {
      if (new RegExp(`\\b${escapeId(id)}\\b`).test(stmt)) return id;
    }
  }
  return null;
}

/** The method's own name, for policy keys and for readable output. */
function methodName(lines, start) {
  const m = lines[start].match(/([\w$]+)\s*(?:<[^>]*>)?\s*\(/);
  return m ? m[1] : '?';
}

const platformByFile = new Map(PLATFORM_SCOPE.map((p) => [p.file, p.reason]));
const reviewedByMethod = new Map(
  METHOD_SCOPE.map((p) => [`${p.file}#${p.method}`, p.reason]),
);

const files = walk(ROOT).filter((f) => /\.service\.ts$/.test(f));
const findings = [];

for (const file of files) {
  const rel = relative(process.cwd(), file).replace(/\\/g, '/');
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const lineOffsets = [];
  {
    let o = 0;
    for (const l of lines) {
      lineOffsets.push(o);
      o += l.length + 1;
    }
  }
  const platformReason = platformByFile.get(rel);

  for (const match of source.matchAll(CALL)) {
    const args = extractArgs(source, match.index);
    const where = /where\s*:\s*/.test(args) ? args.slice(args.search(/where\s*:\s*/)) : args;

    if (/companyId/.test(where)) continue; // already scoped: nothing to decide

    const model = match[1];
    const op = match[2];
    const line = source.slice(0, match.index).split('\n').length;
    const method = enclosingMethod(lines, lineOffsets, line, match.index);
    const name = methodName(lines, method.start);
    const reviewed = reviewedByMethod.get(`${rel}#${name}`);

    let cls = null;
    let detail = '';

    if (platformReason) {
      cls = 'platform';
      detail = platformReason;
    } else if (reviewed) {
      cls = 'reviewed';
      detail = reviewed;
    } else if (HOUSEKEEPING_MODELS.includes(model)) {
      cls = 'housekeeping';
      detail = `${model} is platform-wide credential storage`;
    } else {
      const identity = IDENTITY_FIELDS.find((f) => new RegExp(`\\b${f}\\b`).test(where));
      if (identity) {
        cls = 'identity';
        detail = `looked up by ${identity} before a tenant is known`;
      } else if (IDENTITY_FIELDS.some((f) => new RegExp(`\\b${f}\\s*:`).test(method.text))) {
        // The row was found earlier in this method by a secret (rating token,
        // device token, payment reference). Holding the secret is the
        // entitlement — there is no tenant JWT on a public rating link.
        cls = 'identity-derived';
        detail = 'row found in this method by a secret token; possession is the entitlement';
      } else {
        const guard = guardedByRead(method, where);
        if (guard) {
          cls = 'guarded-by-read';
          detail = `a scoped read names \`${guard}\` with companyId`;
        } else if (/\bcompanyId\b/.test(method.text)) {
          cls = 'tenant-in-method';
          detail = 'method has companyId in scope but no statement ties it to this call';
        } else {
          cls = 'unscoped';
          detail = 'no companyId anywhere in the enclosing method';
        }
      }
    }

    findings.push({
      file: rel,
      line,
      method: name,
      model,
      op,
      class: cls ?? 'unscoped',
      detail,
      snippet: (lines[line - 1] || '').trim().slice(0, 110),
    });
  }
}

const byClass = (c) => findings.filter((f) => f.class === c).length;
const summary = {
  serviceFiles: files.length,
  findings: findings.length,
  platform: byClass('platform'),
  reviewed: byClass('reviewed'),
  housekeeping: byClass('housekeeping'),
  identity: byClass('identity'),
  identityDerived: byClass('identity-derived'),
  guardedByRead: byClass('guarded-by-read'),
  tenantInMethod: byClass('tenant-in-method'),
  unscoped: byClass('unscoped'),
};

const usedPlatform = new Set(findings.filter((f) => f.class === 'platform').map((f) => f.file));
const usedMethods = new Set(
  findings.filter((f) => f.class === 'reviewed').map((f) => `${f.file}#${f.method}`),
);
const deadEntries = [
  ...PLATFORM_SCOPE.filter((p) => !usedPlatform.has(p.file)).map((p) => `file ${p.file}`),
  ...METHOD_SCOPE.filter((p) => !usedMethods.has(`${p.file}#${p.method}`)).map(
    (p) => `method ${p.file}#${p.method}`,
  ),
];

const format = process.argv.includes('--format')
  ? process.argv[process.argv.indexOf('--format') + 1]
  : 'table';

if (format === 'json') {
  console.log(JSON.stringify({ summary, deadEntries, findings }, null, 2));
} else if (format === 'summary') {
  console.log({ ...summary, deadEntries });
} else if (!(process.argv.includes('--check') && !process.argv.includes('--format'))) {
  // --check is quiet unless a format was asked for; a gate should not dump 400
  // rows at you on success.
  console.log('Tenant-scope audit — every id-only operation, classified.\n');
  console.log('File:line'.padEnd(52) + 'Method'.padEnd(26) + 'Class');
  console.log('─'.repeat(104));
  for (const f of findings) {
    console.log(
      `${`${f.file}:${f.line}`.padEnd(52)}${`${f.method}.${f.model}.${f.op}`.padEnd(26)}${f.class}`,
    );
  }
  console.log('─'.repeat(104));
  console.log(summary);
  if (deadEntries.length) console.log('DEAD POLICY ENTRIES:', deadEntries);
}

if (process.argv.includes('--check')) {
  const unreviewed = findings.filter((f) => f.class === 'unscoped' || f.class === 'tenant-in-method');
  const problems = [];
  if (unreviewed.length) {
    problems.push(
      `${unreviewed.length} id-only operation(s) with no explanation. Scope them to companyId, or add them to scripts/tenant-scope-policy.mjs with a reason.`,
    );
    for (const f of unreviewed) {
      console.error(`  ${f.class.toUpperCase()} ${f.file}:${f.line} ${f.method}() ${f.model}.${f.op}`);
      console.error(`      ${f.snippet}`);
    }
  }
  if (deadEntries.length) {
    problems.push(
      `${deadEntries.length} policy entr(y/ies) match nothing: ${deadEntries.join(', ')}. Remove them.`,
    );
  }
  if (problems.length) {
    console.error(`\nTenant-scope audit failed:\n - ${problems.join('\n - ')}`);
    process.exit(1);
  }
  console.log(
    `Tenant-scope audit: ${findings.length} id-only operations, all explained ` +
      `(${summary.guardedByRead} guarded by a scoped read, ${summary.platform} platform, ` +
      `${summary.reviewed} reviewed, ${summary.identity} identity lookups, ${summary.housekeeping} housekeeping).`,
  );
}
