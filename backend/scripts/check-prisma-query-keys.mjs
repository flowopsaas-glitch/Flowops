#!/usr/bin/env node
/**
 * Verify Prisma query field names against prisma/schema.prisma — by reading the
 * schema, not the generated client.
 *
 * Why this exists: the generated client is what normally catches a mistyped
 * field (`where.waybillID` instead of `where.waybillId`). When the client
 * cannot be generated — no reachable engine download — TypeScript falls back to
 * a loosely typed stub and those mistakes compile fine and then throw at
 * runtime, as a 500 on a read path. This script restores the check for the
 * subset that matters here: field names used in `where`, `orderBy` and
 * `select` inside the audit trail service.
 *
 * How: `where` objects are usually assembled in local variables and passed by
 * shorthand, so argument-literal parsing misses them. Instead this resolves
 * `where.<field> = ...` assignments and object-literal keys within each
 * function, and maps the function to the model its `this.prisma.<model>` calls
 * target. Nested objects belong to the parent model's relation/operator space,
 * which is not modelled — their keys are only checked against the union of
 * scalar fields and known Prisma operators, which still catches typos.
 *
 * This is a guard-rail, not a type system. When real per-model types are
 * available, they supersede it.
 *
 * Usage: node scripts/check-prisma-query-keys.mjs [file ...]
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backend = join(here, '..');

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['src/audit/audit-trail.service.ts'];

/** Prisma query keywords and filter operators — never field names. */
const OPERATORS = new Set([
  'where', 'orderBy', 'select', 'include', 'take', 'skip', 'cursor', 'distinct',
  'data', 'create', 'update', 'upsert', 'connect', 'connectOrCreate', 'disconnect',
  'delete', 'deleteMany', 'set', 'push', 'unset', 'increment', 'decrement',
  'multiply', 'divide', 'OR', 'AND', 'NOT', 'equals', 'in', 'notIn', 'not',
  'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith', 'endsWith', 'search',
  'mode', 'has', 'hasEvery', 'hasSome', 'isEmpty', 'isSet', 'every', 'some',
  'none', 'by', 'having', '_count', '_avg', '_sum', '_min', '_max', '_all',
  'insensitive', 'default', 'asc', 'desc', 'nulls', 'first', 'last',
]);

/** Parse `model Name { ... }` blocks into field-name sets (scalars + relations). */
function parseModels(schema) {
  const models = new Map();
  for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match;
    const fields = new Set();
    for (const raw of body.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      // `fieldName  Type` / `fieldName Type? @attr` — skip block attributes.
      const field = /^([A-Za-z_]\w*)\s+/.exec(line);
      if (field && !line.startsWith('@@')) fields.add(field[1]);
    }
    models.set(name, fields);
  }
  return models;
}

/**
 * Json columns hold free-form documents, so the keys inside their value are
 * application data, not schema fields — `metadata: { added: [...] }` is not a
 * mistyped `metadata.added` column.
 */
function parseJsonFields(schema) {
  const json = new Set();
  for (const match of schema.matchAll(/^model\s+\w+\s*\{([\s\S]*?)^\}/gm)) {
    for (const raw of match[1].split('\n')) {
      const field = /^\s*([A-Za-z_]\w*)\s+Json\??/.exec(raw);
      if (field) json.add(field[1]);
    }
  }
  return json;
}

const schema = readFileSync(join(backend, 'prisma', 'schema.prisma'), 'utf8');
const models = parseModels(schema);
const jsonFields = parseJsonFields(schema);
const lowerModel = (name) => name.charAt(0).toLowerCase() + name.slice(1);
const modelByKey = new Map([...models.keys()].map((n) => [lowerModel(n), n]));

const allFields = new Set();
for (const fields of models.values()) for (const f of fields) allFields.add(f);

let problems = 0;
let checked = 0;

for (const relPath of targets) {
  const source = readFileSync(join(backend, relPath), 'utf8');
  const lines = source.split('\n');

  // Split into methods so `where` assignments can be tied to a model.
  const methodStarts = [];
  lines.forEach((line, i) => {
    const m = /^\s{2}(?:private\s+)?(?:async\s+)?(\w+)\s*(?:<[^>]*>)?\s*\(/.exec(line);
    if (m) methodStarts.push({ name: m[1], line: i });
  });

  const methodFor = (lineNo) => {
    let current = null;
    for (const start of methodStarts) if (start.line <= lineNo) current = start;
    return current;
  };

  const modelForMethod = (method) => {
    if (!method) return null;
    // First `this.prisma.<model>` call at or after the method's opening line.
    for (let i = method.line; i < Math.min(lines.length, method.line + 400); i += 1) {
      if (/^\s{2}(?:private\s+)?(?:async\s+)?\w+\s*[<(]/.test(lines[i]) && i !== method.line) break;
      const call = /this\.prisma\.(\w+)\.\w+\(/.exec(lines[i]);
      if (call) return modelByKey.get(call[1]) ?? null;
    }
    return null;
  };

  lines.forEach((line, i) => {
    const method = methodFor(i);
    const model = modelForMethod(method);
    const fields = model ? models.get(model) : null;

    // `where.someField = ...` and `orderBy.someField`
    for (const assign of line.matchAll(/\bwhere\.([A-Za-z_]\w*)\s*=/g)) {
      checked += 1;
      if (!fields || fields.has(assign[1]) || OPERATORS.has(assign[1])) continue;
      problems += 1;
      console.log(`${relPath}:${i + 1}: where.${assign[1]} is not a field of ${model}`);
    }

    // Where a Json column is given an object literal, everything nested inside
    // it is opaque payload.
    const jsonValueAt = (() => {
      for (const m of line.matchAll(/([A-Za-z_]\w*)\s*:\s*\{/g)) {
        // Index of the opening brace itself, which is where a nested key match starts.
        if (jsonFields.has(m[1])) return m.index + m[0].length - 1;
      }
      return Number.POSITIVE_INFINITY;
    })();

    // Object-literal keys: `{ someField: ... }`
    for (const key of line.matchAll(/(?:^|[{,]\s*)([A-Za-z_]\w*)\s*:(\s*)(.*)$/g)) {
      const name = key[1];
      // Inside a Json column's value: free-form, so nothing to check.
      if (key.index >= jsonValueAt) continue;
      // Stop at the first argument/entry delimiter: the value of interest ends
      // there, and what follows (`, nextParam: Type`, `): ReturnType`) is a
      // different declaration.
      // A defaulted parameter (`query: ListClaimsQuery = {}`) is a declaration;
      // drop the default before deciding whether this is a type.
      const value = key[3].split(/[,;)]/)[0].split('=')[0].trim();
      if (OPERATORS.has(name) || allFields.has(name)) continue;
      if (/^[A-Z]/.test(name)) continue;
      // `{ query: TrailQuery }` and `(a: RawEvent, b: RawEvent)` are type
      // annotations, not object-literal keys. A type is a bare keyword or a
      // capitalised name, optionally arrayed — never a value expression like
      // `r.id`, `'waybill'` or `{ id: true }`.
      if (/^(?:string|number|boolean|any|unknown|Date|[A-Z]\w*(?:<[^>]*>)?)(?:\[\])?\s*$/.test(value)) continue;
      checked += 1;
      problems += 1;
      console.log(`${relPath}:${i + 1}: '${name}' is not a field of any model (or a Prisma operator)`);
    }
  });
}

console.log(
  problems === 0
    ? `prisma query keys: ${checked} checked, no unknown keys`
    : `prisma query keys: ${problems} problem(s) in ${checked} checked`,
);
process.exit(problems === 0 ? 0 : 1);
