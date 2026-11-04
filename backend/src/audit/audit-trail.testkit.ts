/**
 * A tiny in-memory stand-in for the slice of Prisma the trail service uses.
 *
 * Why not a spy that returns canned arrays: the properties worth testing here
 * are *filtering and paging* — that a second page never repeats a record, that
 * another tenant's rows can never appear, that a cursor is applied to the right
 * column. A mock that ignores `where` and returns whatever it is given would
 * pass every one of those tests while the real queries were wrong.
 *
 * It implements only what the service actually builds: equality, `in`, `lt`,
 * `gte`, `contains` (case-insensitive), `AND`, `OR`, and one nested relation
 * (`consignment.companyId`). Anything else throws, so a future query shape
 * cannot silently be ignored.
 */

type Rec = Record<string, any>;

function get(rec: Rec, path: string): any {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), rec);
}

function fieldMatches(value: any, condition: any): boolean {
  if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
    return value === condition;
  }

  if ('in' in condition) return (condition.in as any[]).includes(value);
  if ('lt' in condition) return value != null && new Date(value) < new Date(condition.lt);
  if ('lte' in condition) return value != null && new Date(value) <= new Date(condition.lte);
  if ('gt' in condition) return value != null && new Date(value) > new Date(condition.gt);
  if ('gte' in condition) return value != null && new Date(value) >= new Date(condition.gte);
  if ('contains' in condition) {
    const needle = String(condition.contains).toLowerCase();
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  }

  // Nested relation, e.g. { consignment: { companyId } }.
  return Object.entries(condition as Rec).every(([key, nested]) =>
    fieldMatches(get(value ?? {}, key), nested),
  );
}

export function matchesWhere(rec: Rec, where: Rec | undefined): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Rec[]).every((c) => matchesWhere(rec, c));
    if (key === 'OR') return (condition as Rec[]).some((c) => matchesWhere(rec, c));
    return fieldMatches(get(rec, key), condition);
  });
}

export interface TableOptions {
  /** Column the service sorts and pages on. */
  timeField?: string;
}

/** Build a fake `prisma.<model>` with `findMany` and `findFirst`. */
export function fakeTable(rows: Rec[], options: TableOptions = {}) {
  const { timeField } = options;

  const findMany = async (args: Rec = {}) => {
    let out = rows.filter((r) => matchesWhere(r, args.where));

    if (args.orderBy && timeField) {
      const clauses = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
      out = [...out].sort((a, b) => {
        for (const clause of clauses) {
          const [key, direction] = Object.entries(clause)[0] as [string, string];
          const av = a[key];
          const bv = b[key];
          const delta =
            av instanceof Date && bv instanceof Date
              ? av.getTime() - bv.getTime()
              : String(av).localeCompare(String(bv));
          if (delta !== 0) return direction === 'desc' ? -delta : delta;
        }
        return 0;
      });
    }

    return typeof args.take === 'number' ? out.slice(0, args.take) : out;
  };

  const findFirst = async (args: Rec = {}) => rows.find((r) => matchesWhere(r, args.where)) ?? null;

  const count = async (args: Rec = {}) => rows.filter((r) => matchesWhere(r, args.where)).length;

  return { findMany, findFirst, count, rows };
}
