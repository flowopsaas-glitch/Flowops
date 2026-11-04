#!/usr/bin/env node
/**
 * Generate a local stand-in for the Prisma client.
 *
 * `prisma generate` needs to reach binaries.prisma.sh for the query engine. In a
 * sandbox without that route (or when the engine download is blocked) every
 * backend spec fails at import time — including specs that never touch a
 * database — which makes it impossible to tell "my change broke this" from
 * "the client isn't generated".
 *
 * This writes `node_modules/.prisma/client/default.js` containing:
 *   - every enum from prisma/schema.prisma, with its real member names;
 *   - a PrismaClient whose query methods return empty results.
 *
 * It is NOT a test double for behaviour: it has no query semantics. Specs that
 * assert on query behaviour should inject their own fake (see
 * `src/audit/audit-trail.testkit.ts`). This exists so the *rest* of the suite
 * can at least load.
 *
 * node_modules is never committed, so this file has no effect on a real build.
 *
 * Usage:  node scripts/local-prisma-stub.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'prisma', 'schema.prisma');
const outDir = join(here, '..', 'node_modules', '.prisma', 'client');

/** Pull `enum Name { A B ... }` blocks out of the schema. */
function parseEnums(schema) {
  const enums = {};
  const pattern = /^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

  for (const match of schema.matchAll(pattern)) {
    const [, name, body] = match;
    const members = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/)[0])
      .filter((token) => /^[A-Z0-9_]+$/.test(token));

    if (members.length) enums[name] = Object.fromEntries(members.map((m) => [m, m]));
  }

  return enums;
}

/** Field names per model, so `prisma.<model>` exists with a plausible surface. */
function parseModels(schema) {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

/**
 * `Prisma.dmmf.datamodel.models` — the schema as data.
 *
 * Real Prisma exposes the datamodel at runtime, and specs use it to check their
 * own writes against the schema rather than against a hand-copied field list
 * (see rail-tariff.service.spec.ts). Only `name` and `fields[].name` are
 * supplied; that is the whole of what the codebase reads.
 */
function parseDatamodel(schema) {
  const models = [];
  for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match;
    const fields = [];
    for (const raw of body.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@')) continue;
      const field = /^([A-Za-z_]\w*)\s+(\S+)/.exec(line);
      if (!field) continue;
      fields.push({
        name: field[1],
        type: field[2].replace(/[?[\]]/g, ''),
        isRequired: !field[2].includes('?'),
        isList: field[2].includes('['),
      });
    }
    models.push({ name, fields });
  }
  return models;
}

/**
 * `Prisma.*` type names the codebase references (`Prisma.RailSlotApplicationWhereInput`, …).
 *
 * Real Prisma generates one per model and per operation; reproducing that set is
 * pointless, but TypeScript needs the name to exist. Reading them out of `src`
 * keeps this accurate without enumerating: whatever the code asks for, it gets.
 */
function collectPrismaTypeNames(dir) {
  const names = new Set();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
        continue;
      }
      if (!/\.ts$/.test(entry.name)) continue;
      const text = readFileSync(full, 'utf8');
      for (const match of text.matchAll(/\bPrisma\.([A-Z]\w*)/g)) names.add(match[1]);
    }
  };
  walk(dir);
  return [...names].sort();
}

/**
 * Type names imported from '@prisma/client' that are neither a model nor an
 * enum — `CustomsDeclaration`, `WaybillStatusType`, and so on. Real Prisma
 * emits them; this stub has to as well, or `npm run build` reports missing
 * exports in files that are perfectly correct.
 */
function collectClientTypeImports(dir, known) {
  const names = new Set();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
        continue;
      }
      if (!/\.ts$/.test(entry.name)) continue;
      const text = readFileSync(full, 'utf8');
      for (const match of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@prisma\/client['"]/g)) {
        for (const raw of match[1].split(',')) {
          // `{ type Foo }` and `{ Foo as Bar }` both occur in this codebase.
          const parts = raw.trim().split(/\s+as\s+/);
          const name = parts[parts.length - 1].trim().replace(/^(?:type|typeof)\s+/, '');
          if (!name || known.has(name) || names.has(name)) continue;
          names.add(name);
        }
      }
    }
  };
  walk(dir);
  return [...names].sort();
}

const schema = readFileSync(schemaPath, 'utf8');
const enums = parseEnums(schema);
const models = parseModels(schema);
const datamodel = parseDatamodel(schema);

const client = `// GENERATED LOCALLY by scripts/local-prisma-stub.mjs — do not edit, do not commit.
// Stand-in for the generated Prisma client: real enum names, no query semantics.
/* eslint-disable */

const enums = ${JSON.stringify(enums, null, 2)};

const empty = () => Promise.resolve([]);
const nothing = () => Promise.resolve(null);
const zero = () => Promise.resolve(0);
const one = () => Promise.resolve({ count: 0 });

const delegate = {
  findMany: empty,
  findFirst: nothing,
  findUnique: nothing,
  findUniqueOrThrow: nothing,
  create: (args) => Promise.resolve(args && args.data ? { id: 'stub-id', ...args.data } : { id: 'stub-id' }),
  createMany: one,
  update: (args) => Promise.resolve(args && args.data ? { id: 'stub-id', ...args.data } : { id: 'stub-id' }),
  updateMany: one,
  upsert: (args) => Promise.resolve(args && args.create ? { id: 'stub-id', ...args.create } : { id: 'stub-id' }),
  delete: nothing,
  deleteMany: one,
  count: zero,
  aggregate: empty,
  groupBy: empty,
};

class PrismaClient {
  constructor() {
    this.$queryRaw = async () => [{ 1: 1 }];
    this.$executeRaw = async () => 1;
    this.$connect = async () => {};
    this.$disconnect = async () => {};
    this.$transaction = async (fn) => (typeof fn === 'function' ? fn(this) : Promise.all(fn));
    this.$on = () => {};
  }
}

for (const model of ${JSON.stringify(models)}) {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  PrismaClient.prototype[key] = delegate;
}

const dmmf = { datamodel: { models: ${JSON.stringify(datamodel)} } };

/**
 * Real Prisma throws this for constraint violations and callers branch on
 * instanceof and .code (rail-timetable.service.ts). Without it the branch
 * itself throws, which reads as a bug in the caller.
 */
class PrismaClientKnownRequestError extends Error {
  constructor(message, options) {
    super(message);
    const { code, clientVersion, meta, batchRequestIdx } = options || {};
    this.code = code;
    this.clientVersion = clientVersion;
    this.meta = meta;
    this.batchRequestIdx = batchRequestIdx;
    this.name = 'PrismaClientKnownRequestError';
  }
}

class PrismaClientValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrismaClientValidationError';
  }
}

class PrismaClientInitializationError extends Error {
  constructor(message, clientVersion) {
    super(message);
    this.clientVersion = clientVersion;
    this.name = 'PrismaClientInitializationError';
  }
}

const Prisma = {
  ...enums,
  dmmf,
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
};

module.exports = {
  PrismaClient,
  Prisma,
  ...enums,
  dmmf,
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
  default: { PrismaClient, Prisma },
};
`;

/*
 * The .d.ts is the half that matters most: without it TypeScript reports
 * "Property 'trackingEvent' does not exist on type 'PrismaService'" for every
 * query in the codebase, and `npm test` (ts-jest, diagnostics on) refuses to
 * run any suite that imports the service. Enum members are emitted verbatim
 * from the schema, so `UserRole.MANAGER` resolves to the real thing.
 *
 * Query *arguments* and row shapes are deliberately loose (`any`). Real Prisma
 * generates per-model input/output types from the schema, which this stub
 * cannot reproduce; pretending otherwise would give a green light that means
 * nothing. Anything depending on arg/row typing has to be checked against the
 * schema itself — see scripts/check-prisma-query-keys.mjs.
 */
const enumDecls = Object.entries(enums)
  .map(([name, members]) => {
    const keys = Object.keys(members);
    const objectEntries = keys.map((k) => `  readonly ${k}: '${k}';`).join('\n');
    const union = keys.map((k) => `'${k}'`).join(' | ');
    return `export declare const ${name}: {\n${objectEntries}\n};\nexport type ${name} = ${union};`;
  })
  .join('\n\n');

const modelKeys = models
  .map((m) => `  ${m.charAt(0).toLowerCase() + m.slice(1)}: PrismaDelegate<${m}>;`)
  .join('\n');

/*
 * Row shapes.
 *
 * `any` was not good enough: `{ ...withoutShareToken(row), ...metrics }` where
 * `row` is `any` resolves to just `metrics`, because spreading `any` contributes
 * nothing — which turned a correct controller into four type errors. An
 * interface per model restores the field names, so a spread behaves the way it
 * would with the real client.
 *
 * No index signature, deliberately: `Omit<T, K>` is built on `keyof T`, and an
 * index signature makes `keyof T` just `string | number`, so `Omit` would drop
 * every named field and a spread of the result would carry nothing. Real Prisma
 * types have exact keys for the same reason.
 *
 * The cost is that a `select`-narrowed result still types as the full row (the
 * stub cannot see the selection). That is looser than the real client, never
 * tighter, so it cannot invent an error that a real build would not also report.
 * Field-level correctness is checked against the schema by
 * scripts/check-prisma-query-keys.mjs.
 */
const SCALAR_TS = {
  String: 'string',
  Int: 'number',
  BigInt: 'number',
  Float: 'number',
  Decimal: 'number',
  Boolean: 'boolean',
  DateTime: 'Date',
  Json: 'any',
  Bytes: 'Uint8Array',
};

/** A relation, rather than a scalar or an enum. */
const isRelation = (field) => !SCALAR_TS[field.type] && !enums[field.type];

const tsTypeOf = (field) => {
  // An enum member map is truthy but not a type name: the field's type is the
  // enum's NAME, which is emitted alongside it.
  const base = SCALAR_TS[field.type] ?? (enums[field.type] ? field.type : 'any');
  if (field.isList) return `${base}[]`;
  return field.isRequired ? base : `${base} | null`;
};

/**
 * One row line.
 *
 * Relations are optional: `create()`/`update()` return scalars only unless the
 * caller asked for an `include`, so a required relation field would make every
 * correct prisma call that returns a row fail to compile. `_count` is the same
 * story — Prisma adds it only when selected — but every model can carry one, so
 * each interface gets the field.
 */
const fieldLine = (field) => {
  if (isRelation(field)) {
    // A to-many relation is `any[]`, a to-one is optional. The stub cannot model
    // `GetPayload<{ include }>`, so it cannot tell an included row from a bare
    // one; typing to-many as required is the same latitude the old `any`
    // delegate gave, and every to-many relation the code reads is `include`d.
    return field.isList ? `  ${field.name}: any[];` : `  ${field.name}?: any;`;
  }
  return `  ${field.name}: ${tsTypeOf(field)};`;
};

const modelTypes = datamodel
  .map(({ name, fields }) => {
    const rows = [...fields.map(fieldLine), '  _count?: Record<string, number>;'].join('\n');
    return `export interface ${name} {\n${rows}\n}`;
  })
  .join('\n\n');

const srcDir = join(here, '..', 'src');
const prismaTypeNames = collectPrismaTypeNames(srcDir);
const knownExports = new Set([
  ...models,
  ...Object.keys(enums),
  'PrismaClient',
  'Prisma',
  'PrismaClientKnownRequestError',
  'PrismaClientValidationError',
  'PrismaClientInitializationError',
  'dmmf',
]);
const clientTypeImports = collectClientTypeImports(srcDir, knownExports);
const prismaTypes = prismaTypeNames
  .map((name) => `  type ${name}<T = any, U = any, V = any> = any;`)
  .join('\n');

// Types the codebase imports that the schema does not describe one-to-one.
const namedTypeExports = clientTypeImports.map((name) => `export type ${name} = any;`).join('\n');

const dts = `// GENERATED LOCALLY by scripts/local-prisma-stub.mjs — do not edit, do not commit.
/* eslint-disable */

/**
 * Rows are any.
 *
 * Tried Record<string, any> first, on the theory that it would keep property
 * access while resisting typos. It is worse: an index-signature row is NOT
 * assignable to the concrete shapes this codebase passes around
 * ({ id: string; name: string }), so it produced 228 errors where any produced
 * 8 — all of them artefacts of the stub, in code this change does not touch.
 * any is the permissive approximation real Prisma types are being stood in for;
 * it is only for local loading, never for verified behaviour.
 */
export type PrismaRow = any;

export interface PrismaDelegate<Row = any> {
  findMany(args?: any): Promise<Row[]>;
  findFirst(args?: any): Promise<Row | null>;
  findFirstOrThrow(args?: any): Promise<Row>;
  findUnique(args?: any): Promise<Row | null>;
  findUniqueOrThrow(args?: any): Promise<Row>;
  create(args?: any): Promise<Row>;
  createMany(args?: any): Promise<{ count: number }>;
  update(args?: any): Promise<Row>;
  updateMany(args?: any): Promise<{ count: number }>;
  upsert(args?: any): Promise<Row>;
  delete(args?: any): Promise<Row>;
  deleteMany(args?: any): Promise<{ count: number }>;
  count(args?: any): Promise<number>;
  aggregate(args?: any): Promise<any>;
  groupBy(args?: any): Promise<any[]>;
}

${enumDecls}

${modelTypes}

${namedTypeExports}

export declare namespace Prisma {
  type TransactionClient = PrismaClient;
  type JsonValue = any;
  type Decimal = any;
  type InputJsonValue = any;
  type InputJsonObject = any;
${prismaTypes}
}

export declare class PrismaClient {
  constructor(options?: any);
${modelKeys}
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $on(event: string, callback: (...args: any[]) => void): void;
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, options?: any): Promise<T>;
  $transaction<T extends any[]>(promises: T): Promise<any>;
  $queryRaw<T = any>(query: TemplateStringsArray | string, ...values: any[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray | string, ...values: any[]): Promise<number>;
  $queryRawUnsafe<T = any>(query: string, ...values: any[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: any[]): Promise<number>;
}

export declare const Prisma: Record<string, any>;

export declare class PrismaClientKnownRequestError extends Error {
  readonly code: string;
  readonly clientVersion?: string;
  readonly meta?: any;
  constructor(message: string, options?: any);
}
export declare class PrismaClientValidationError extends Error {}
export declare class PrismaClientInitializationError extends Error {}
export declare const dmmf: any;

export default PrismaClient;
`;

// A real `prisma generate` always emits index.d.ts alongside the model files.
// If that is present, a genuine client exists and this script must not shadow
// it — `@prisma/client` re-exports `.prisma/client/default`, so writing there
// would break a working install in a way that looks like a Prisma bug.
const realClient = join(outDir, 'index.d.ts');
if (existsSync(realClient) && !process.argv.includes('--force')) {
  process.stderr.write(
    `Refusing to overwrite a generated Prisma client at ${realClient}.\n` +
      'A real client is better than this stub — nothing to do. Pass --force only if\n' +
      'you are certain the existing one is itself a leftover stub.\n',
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'default.js'), client, 'utf8');
writeFileSync(join(outDir, 'default.d.ts'), dts, 'utf8');
process.stdout.write(
  `local Prisma stub: ${Object.keys(enums).length} enums, ${models.length} models -> ${join(outDir, 'default.js')} + default.d.ts\n`,
);
