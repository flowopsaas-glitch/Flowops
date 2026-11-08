/**
 * A small in-memory stand-in for the Prisma delegates the rail services use, so isolation and
 * state-machine behaviour are tested by BEHAVIOUR (tenant B really cannot see tenant A's rows)
 * rather than by asserting which arguments were passed.
 *
 * Deliberately limited to what the services use: equality, in/notIn/not, lt/lte/gt/gte,
 * contains, null, OR/AND/NOT. Rows are returned as COPIES, like a real database, so a later
 * update never mutates an object the caller already holds. Test-only: excluded from the build.
 */
import { Prisma } from '@prisma/client';

export type Row = Record<string, any>;

const isOperator = (v: unknown): v is Row =>
  !!v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);

/**
 * Prisma addresses a compound unique key as a single nested condition —
 * `{ companyId_corridorCode_validFrom: { companyId, corridorCode, validFrom } }`.
 * Flatten those into their constituent columns so the fake can match them the
 * way the generated client would.
 */
export function normaliseWhere(where: Row = {}): Row {
  const out: Row = {};
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR' || key === 'AND' || key === 'NOT') { out[key] = cond; continue; }
    if (key.includes('_') && isOperator(cond)) Object.assign(out, normaliseWhere(cond as Row));
    else out[key] = cond;
  }
  return out;
}

const cmp = (a: unknown, b: unknown): number => {
  const x = a instanceof Date ? a.getTime() : (a as number);
  const y = b instanceof Date ? b.getTime() : (b as number);
  return x < y ? -1 : x > y ? 1 : 0;
};

export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(normaliseWhere(where)).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w));
    if (key === 'NOT') return !(Array.isArray(cond) ? cond : [cond]).some((w: Row) => matches(row, w));
    const actual = row[key];
    if (cond === null) return actual == null; // an absent nullable column reads as NULL
    if (isOperator(cond)) {
      if ('in' in cond) return cond.in.includes(actual);
      if ('notIn' in cond) return !cond.notIn.includes(actual);
      if ('not' in cond) return cond.not === null ? actual != null : actual !== cond.not;
      if ('equals' in cond) return actual === cond.equals;
      if ('contains' in cond) return String(actual ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
      if ('lt' in cond || 'lte' in cond || 'gt' in cond || 'gte' in cond) {
        if (actual == null) return false;
        return ('lt' in cond ? cmp(actual, cond.lt) < 0 : true) && ('lte' in cond ? cmp(actual, cond.lte) <= 0 : true)
          && ('gt' in cond ? cmp(actual, cond.gt) > 0 : true) && ('gte' in cond ? cmp(actual, cond.gte) >= 0 : true);
      }
    }
    // Prisma compares values, not object identity: two Dates holding the same
    // instant are equal, and a compound-unique upsert depends on that.
    if (actual instanceof Date || cond instanceof Date) {
      return actual instanceof Date && cond instanceof Date && actual.getTime() === cond.getTime();
    }
    return actual === cond;
  });
}

const clean = (data: Row): Row => {
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) out[k] = v === Prisma.DbNull || v === Prisma.JsonNull ? null : v;
  return out;
};

export class FakeTable {
  rows: Row[] = [];
  private seq = 0;

  constructor(
    public readonly name: string,
    private readonly opts: { defaults?: (data: Row) => Row; unique?: string[][] } = {},
  ) {}

  seed(row: Row): Row {
    const full = { id: `${this.name}-${++this.seq}`, createdAt: new Date(), updatedAt: new Date(), ...this.opts.defaults?.(row), ...row };
    this.rows.push(full);
    return { ...full };
  }

  private sorted(rows: Row[], orderBy?: Row | Row[]): Row[] {
    const keys = ([] as Row[]).concat(orderBy ?? []);
    if (!keys.length) return rows;
    return [...rows].sort((a, b) => {
      for (const k of keys) {
        const [field, dir] = Object.entries(k)[0] as [string, string];
        const c = cmp(a[field], b[field]);
        if (c) return dir === 'desc' ? -c : c;
      }
      return 0;
    });
  }

  create = jest.fn(async ({ data }: { data: Row }) => {
    for (const cols of this.opts.unique ?? []) {
      if (this.rows.some((r) => cols.every((c) => r[c] === data[c]))) {
        throw Object.assign(new Error(`Unique constraint failed on (${cols.join(', ')})`), { code: 'P2002' });
      }
    }
    return this.seed(clean(data));
  });

  findFirst = jest.fn(async ({ where, orderBy }: { where?: Row; orderBy?: Row | Row[] } = {}) => {
    const found = this.sorted(this.rows.filter((r) => matches(r, where)), orderBy)[0];
    return found ? { ...found } : null;
  });

  findUnique = jest.fn(async ({ where }: { where: Row }) => {
    const found = this.rows.find((r) => matches(r, where));
    return found ? { ...found } : null;
  });

  findMany = jest.fn(async ({ where, orderBy, take }: { where?: Row; orderBy?: Row | Row[]; take?: number } = {}) => {
    const rows = this.sorted(this.rows.filter((r) => matches(r, where)), orderBy).map((r) => ({ ...r }));
    return take ? rows.slice(0, take) : rows;
  });

  count = jest.fn(async ({ where }: { where?: Row } = {}) => this.rows.filter((r) => matches(r, where)).length);

  /**
   * Find by `where`, then update or create. Mirrors Prisma closely enough for
   * the compound-key upserts the rail capacity ledger uses; it is not
   * transactional, so it does not reproduce concurrent-write behaviour.
   */
  upsert = jest.fn(async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
    const row = this.rows.find((r) => matches(r, where));
    if (!row) return this.seed(clean(create));
    Object.assign(row, clean(update), { updatedAt: new Date() });
    return { ...row };
  });

  update = jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const row = this.rows.find((r) => matches(r, where));
    if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
    Object.assign(row, clean(data), { updatedAt: new Date() });
    return { ...row };
  });

  updateMany = jest.fn(async ({ where, data }: { where?: Row; data: Row }) => {
    const hit = this.rows.filter((r) => matches(r, where));
    hit.forEach((r) => Object.assign(r, clean(data), { updatedAt: new Date() }));
    return { count: hit.length };
  });

  delete = jest.fn(async ({ where }: { where: Row }) => {
    const i = this.rows.findIndex((r) => matches(r, where));
    if (i < 0) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
    return this.rows.splice(i, 1)[0];
  });

  /** Every jest.fn on this table, to assert "nothing was touched". */
  get fns(): jest.Mock[] {
    return [this.create, this.findFirst, this.findUnique, this.findMany, this.count, this.update, this.updateMany, this.delete, this.upsert];
  }
}

/** Snapshot all rows of the given tables — compare before/after to prove an attempt changed nothing. */
export const snapshot = (...tables: FakeTable[]): string => JSON.stringify(tables.map((t) => t.rows));
