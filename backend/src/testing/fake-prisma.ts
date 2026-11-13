/**
 * A very small in-memory stand-in for PrismaService.
 *
 * Why: the CI/sandbox environment for this workstream has no PostgreSQL, so the
 * service-level behaviour that matters most — tenant isolation, business-key
 * idempotency, blocking-incident refusal, evidence gating, SKU sequence
 * monotonicity — could not be exercised at all with a real database.
 *
 * This fake is deliberately NOT a database: it supports the subset of the query
 * surface the Process Control and Product Master services use (create /
 * findFirst / findMany / update / count / groupBy / deleteMany / createMany,
 * plus `$transaction` and the two raw-SQL calls the SKU allocator makes). It
 * implements just enough `where` semantics — equality, `in`, `notIn`, `not`,
 * `contains` with case-insensitive mode — to be useful.
 *
 * It is a test double for behaviour, not a substitute for the integration suite
 * against a real disposable database, which is still required before this
 * capability leaves non-production.
 */
export type Row = Record<string, any>;

/**
 * Nested `create` payloads this fake understands, keyed by parent model:
 * child relation field → { model, foreign key }. Prisma issues these in a
 * single statement; here they are written into the child table directly.
 */
const NESTED_CREATES: Record<string, Record<string, { model: string; fk: string }>> = {
  processVersion: {
    steps: { model: 'processStepDefinition', fk: 'versionId' },
    automationRules: { model: 'processAutomationRule', fk: 'versionId' },
  },
  processDefinition: {
    versions: { model: 'processVersion', fk: 'definitionId' },
  },
  product: {
    variants: { model: 'productVariant', fk: 'productId' },
  },
  processInstance: {
    stepInstances: { model: 'processStepInstance', fk: 'instanceId' },
  },
};

/**
 * `@default(...)` values from the schema. Prisma applies these server-side; the
 * fake has to apply them too, otherwise `where: { isActive: true }` would never
 * match a row the service created without naming the column.
 */
const MODEL_DEFAULTS: Record<string, Row> = {
  processDefinition: { isActive: true },
  processVersion: { status: 'DRAFT', isImmutable: false },
  processAutomationRule: { isActive: true, maxRunsPerInstance: 1, requiresHumanApproval: true },
  processInstance: { status: 'IN_PROGRESS' },
  processStepInstance: { status: 'PENDING', attempt: 1 },
  processIncident: { severity: 'MINOR', status: 'OPEN', isBlocking: false },
  processSolution: { status: 'PROPOSED' },
  processOutcome: { status: 'COMPLETED', firstTimeRight: false },
  processChangeProposal: { status: 'DRAFT' },
  product: { status: 'DRAFT', revision: 1, isActive: true, unitOfMeasure: 'EA' },
  productVariant: { status: 'DRAFT', revision: 1, isActive: true },
  productAlias: { isActive: true },
};

const MODEL_NAMES = [
  'processDefinition',
  'processVersion',
  'processStepDefinition',
  'processAutomationRule',
  'processInstance',
  'processStepInstance',
  'processIncident',
  'processSolution',
  'processOutcome',
  'processChangeProposal',
  'automationRun',
  'processAuditEvent',
  'product',
  'productVariant',
  'productAlias',
  'masterDataAuditEvent',
  'goodsReceipt',
] as const;

export class FakePrisma {
  private tables: Record<string, Row[]> = {};
  private sequences: Record<string, number> = {};
  private idCounter = 0;

  /** Rows written through raw SQL (`sku_sequences`) — keyed by companyId. */
  skuSequences: Record<string, { nextNumber: number; prefix: string; format: string }> = {};

  /** Every `where` the services used — handy for asserting tenant scoping. */
  readonly queriedWhereClauses: Array<{ model: string; where: any }> = [];

  constructor(seed?: Partial<Record<(typeof MODEL_NAMES)[number], Row[]>>) {
    for (const model of MODEL_NAMES) this.tables[model] = [];
    if (seed) {
      for (const [model, rows] of Object.entries(seed)) {
        if (rows) this.tables[model] = rows.map((r) => ({ ...r }));
      }
    }
  }

  /** Write nested `create` payloads into their child tables. */
  private applyNestedCreates(parentModel: string, parentRow: Row, data: Row): void {
    const mapping = NESTED_CREATES[parentModel];
    if (!mapping) return;
    for (const [relation, spec] of Object.entries(mapping)) {
      const payload = data?.[relation];
      const children = payload?.create;
      if (!Array.isArray(children) || children.length === 0) continue;
      const childTable = this.tables[spec.model] ?? (this.tables[spec.model] = []);
      for (const child of children) {
        childTable.push({
          id: child.id ?? this.nextId(),
          createdAt: new Date(),
          ...resolveCreateData(child),
          [spec.fk]: parentRow.id,
          companyId: child.companyId ?? parentRow.companyId,
        });
      }
    }
  }

  // ── Test helpers ──────────────────────────────────────────────────────────

  all(model: string): Row[] {
    return this.tables[model] ?? [];
  }

  seed(model: string, rows: Row[]): void {
    this.tables[model] = (this.tables[model] ?? []).concat(rows.map((r) => ({ ...r })));
  }

  // ── Prisma surface ───────────────────────────────────────────────────────

  /**
   * `self` is passed in rather than aliased with `const self = this` (which the
   * lint rule forbids) because the table closures below are object methods, not
   * arrow functions, so they cannot see the class instance through `this`.
   */
  /**
   * Memoised per model name.
   *
   * Prisma hands back a stable delegate — `prisma.processInstance` is the same
   * object every time — so a test can spy on it. Returning a fresh object per
   * property access made `jest.spyOn(prisma.processInstance, 'updateMany')`
   * spy on an object the service never touched.
   */
  private modelCache = new Map<string, any>();

  private modelFor(name: string, self: FakePrisma) {
    const cached = this.modelCache.get(name);
    if (cached) return cached;

    const table = self.tables[name] ?? (self.tables[name] = []);

    const matches = (row: Row, where: any): boolean => matchesWhere(row, where);

    const model = {
      async create(args: { data: Row; include?: any }) {
        const data = { ...(MODEL_DEFAULTS[name] ?? {}), ...resolveCreateData(args.data) };
        const row: Row = { id: data.id ?? self.nextId(), createdAt: new Date(), ...data };
        table.push(row);
        self.applyNestedCreates(name, row, args.data);
        return withIncludes(name, row, args?.include, self);
      },
      async createMany(args: { data: Row[] }) {
        const rows = args.data.map((d) => ({
          id: self.nextId(),
          createdAt: new Date(),
          ...(MODEL_DEFAULTS[name] ?? {}),
          ...resolveCreateData(d),
        }));
        table.push(...rows);
        return { count: rows.length };
      },
      async findFirst(args?: { where?: any; include?: any; orderBy?: any; select?: any }) {
        const where = args?.where;
        if (where) self.queriedWhereClauses.push({ model: name, where });
        const rows = table.filter((r) => matches(r, where));
        const sorted = applyOrder(rows, args?.orderBy);
        const row = sorted[0] ?? null;
        return row ? withIncludes(name, row, args?.include, self) : null;
      },
      async findUnique(args: { where: any; include?: any; select?: any }) {
        const row = table.find((r) => matches(r, args.where)) ?? null;
        return row ? withIncludes(name, row, args.include, self) : null;
      },
      async findMany(args?: { where?: any; orderBy?: any; take?: number; include?: any; select?: any }) {
        const where = args?.where;
        if (where) self.queriedWhereClauses.push({ model: name, where });
        let rows = table.filter((r) => matches(r, where));
        rows = applyOrder(rows, args?.orderBy);
        if (args?.take) rows = rows.slice(0, args.take);
        return rows.map((r) => withIncludes(name, r, args?.include, self));
      },
      async count(args?: { where?: any }) {
        const where = args?.where;
        if (where) self.queriedWhereClauses.push({ model: name, where });
        return table.filter((r) => matches(r, where)).length;
      },
      async groupBy(args: { by: string[]; where?: any; _count?: any }) {
        const where = args?.where;
        if (where) self.queriedWhereClauses.push({ model: name, where });
        const buckets = new Map<string, { key: Row; count: number }>();
        for (const row of table.filter((r) => matches(r, where))) {
          const key: Row = {};
          for (const field of args.by) key[field] = row[field];
          const keyStr = JSON.stringify(key);
          const bucket = buckets.get(keyStr) ?? { key, count: 0 };
          bucket.count += 1;
          buckets.set(keyStr, bucket);
        }
        return [...buckets.values()].map(({ key, count }) => ({
          ...key,
          _count: { _all: count },
        }));
      },
      async update(args: { where: any; data: Row }) {
        const index = table.findIndex((r) => matches(r, args.where));
        if (index === -1) {
          const err: any = new Error('Record to update not found');
          err.code = 'P2025';
          throw err;
        }
        table[index] = applyUpdate(table[index], args.data);
        return table[index];
      },
      async updateMany(args: { where?: any; data: Row }) {
        let count = 0;
        for (let i = 0; i < table.length; i += 1) {
          if (matches(table[i], args.where)) {
            table[i] = applyUpdate(table[i], args.data);
            count += 1;
          }
        }
        return { count };
      },
      async deleteMany(args?: { where?: any }) {
        const before = table.length;
        const keep = table.filter((r) => !matches(r, args?.where));
        this.tables[name] = keep;
        return { count: before - keep.length };
      },
      async delete(args: { where: any }) {
        const index = table.findIndex((r) => matches(r, args.where));
        if (index === -1) throw new Error('Record to delete does not exist');
        const [row] = table.splice(index, 1);
        return row;
      },
    };

    this.modelCache.set(name, model);
    return model;
  }

  get processDefinition() {
    return this.modelFor('processDefinition', this);
  }
  get processVersion() {
    return this.modelFor('processVersion', this);
  }
  get processStepDefinition() {
    return this.modelFor('processStepDefinition', this);
  }
  get processAutomationRule() {
    return this.modelFor('processAutomationRule', this);
  }
  get processInstance() {
    return this.modelFor('processInstance', this);
  }
  get processStepInstance() {
    return this.modelFor('processStepInstance', this);
  }
  get processIncident() {
    return this.modelFor('processIncident', this);
  }
  get processSolution() {
    return this.modelFor('processSolution', this);
  }
  get processOutcome() {
    return this.modelFor('processOutcome', this);
  }
  get processChangeProposal() {
    return this.modelFor('processChangeProposal', this);
  }
  get automationRun() {
    return this.modelFor('automationRun', this);
  }
  get processAuditEvent() {
    return this.modelFor('processAuditEvent', this);
  }
  get product() {
    return this.modelFor('product', this);
  }
  get productVariant() {
    return this.modelFor('productVariant', this);
  }
  get productAlias() {
    return this.modelFor('productAlias', this);
  }
  get masterDataAuditEvent() {
    return this.modelFor('masterDataAuditEvent', this);
  }
  get goodsReceipt() {
    return this.modelFor('goodsReceipt', this);
  }

  private transactionQueue: Promise<void> = Promise.resolve();

  /**
   * Mirrors `prisma.$transaction`.
   *
   * Interactive transactions are serialised against each other. That models the
   * part that matters for the SKU allocator: `SELECT … FOR UPDATE` makes two
   * concurrent allocations queue up, so the second one reads the *advanced*
   * counter rather than the same stale value. (A real database serialises them
   * on the row lock; the fake serialises the whole transaction.)
   */
  async $transaction<T>(arg: ((tx: FakePrisma) => Promise<T>) | Promise<T>[]): Promise<T | T[]> {
    if (typeof arg !== 'function') return Promise.all(arg);

    const run = this.transactionQueue.then(() => arg(this));
    // Keep the queue alive regardless of the transaction's outcome.
    this.transactionQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Mirrors `PrismaService.withTenant`: the same serialisation as
   * `$transaction`, plus the empty-tenant guard the real service applies —
   * a test double that skips it would let an unscoped write pass unnoticed.
   */
  async withTenant<T>(companyId: string, fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    if (typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error('withTenant requires a non-empty companyId');
    }
    return this.$transaction(fn) as Promise<T>;
  }

  async $executeRaw(strings: TemplateStringsArray | any, ...values: any[]) {
    const sql = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (sql.includes('INSERT INTO sku_sequences')) {
      const companyId = String(values[1]);
      if (!this.skuSequences[companyId]) {
        this.skuSequences[companyId] = {
          nextNumber: Number(values[2] ?? 1),
          prefix: String(values[3] ?? 'SKU'),
          format: String(values[4] ?? 'SKU-{number:05d}'),
        };
      }
      return 1;
    }
    if (sql.includes('UPDATE sku_sequences')) {
      const nextNumber = Number(values[0]);
      const companyId = String(values[1]);
      const existing = this.skuSequences[companyId];
      // The real row is locked FOR UPDATE; here we enforce the same invariant
      // the allocator relies on: the counter only ever moves forward.
      if (existing && nextNumber <= existing.nextNumber) {
        throw new Error('SKU sequence regression detected');
      }
      this.skuSequences[companyId] = { ...(existing ?? { prefix: 'SKU', format: 'SKU-{number:05d}' }), nextNumber };
      return 1;
    }
    return 0;
  }

  async $queryRaw(strings: TemplateStringsArray | any, ...values: any[]) {
    const sql = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (sql.includes('FROM sku_sequences')) {
      const companyId = String(values[0]);
      const sequence = this.skuSequences[companyId];
      return sequence ? [{ nextNumber: sequence.nextNumber, prefix: sequence.prefix, format: sequence.format }] : [];
    }
    return [];
  }

  private nextId(): string {
    this.idCounter += 1;
    this.sequences['__id'] = this.idCounter;
    return `id_${this.idCounter}`;
  }
}

// ── Where-clause semantics ─────────────────────────────────────────────────

function matchesWhere(row: Row, where: any): boolean {
  if (!where) return true;
  for (const [field, condition] of Object.entries(where)) {
    if (field === 'OR') {
      const branches = condition as any[];
      if (!branches.some((branch) => matchesWhere(row, branch))) return false;
      continue;
    }
    if (field === 'AND') {
      const branches = condition as any[];
      if (!branches.every((branch) => matchesWhere(row, branch))) return false;
      continue;
    }
    if (field === 'NOT') {
      if (matchesWhere(row, condition)) return false;
      continue;
    }

    const value = row[field];

    if (condition !== null && typeof condition === 'object' && !Array.isArray(condition)) {
      const cond = condition as Row;
      if ('in' in cond) {
        if (!(cond.in as any[]).includes(value)) return false;
        continue;
      }
      if ('notIn' in cond) {
        if ((cond.notIn as any[]).includes(value)) return false;
        continue;
      }
      if ('not' in cond) {
        const notValue = cond.not;
        if (notValue !== null && typeof notValue === 'object' && 'in' in notValue) {
          if ((notValue.in as any[]).includes(value)) return false;
          continue;
        }
        if (value === notValue) return false;
        continue;
      }
      if ('contains' in cond) {
        const needle = String(cond.contains);
        const haystack = String(value ?? '');
        const found =
          cond.mode === 'insensitive'
            ? haystack.toLowerCase().includes(needle.toLowerCase())
            : haystack.includes(needle);
        if (!found) return false;
        continue;
      }
      if ('gt' in cond || 'gte' in cond || 'lt' in cond || 'lte' in cond) {
        if ('gt' in cond && !(value > cond.gt)) return false;
        if ('gte' in cond && !(value >= cond.gte)) return false;
        if ('lt' in cond && !(value < cond.lt)) return false;
        if ('lte' in cond && !(value <= cond.lte)) return false;
        continue;
      }
      // Nested relation filter (e.g. { company: { isActive: true } }) is not
      // modelled — treat as a non-match rather than silently matching.
      return false;
    }

    if (value !== condition) return false;
  }
  return true;
}

function applyOrder(rows: Row[], orderBy: any): Row[] {
  if (!orderBy) return rows;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [field, direction] = Object.entries(order)[0] as [string, string];
      if (a[field] === b[field]) continue;
      const result = a[field] > b[field] ? 1 : -1;
      return direction === 'desc' ? -result : result;
    }
    return 0;
  });
}

function applyUpdate(row: Row, data: Row): Row {
  const next = { ...row };
  for (const [field, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'increment' in (value as Row)) {
      next[field] = (next[field] ?? 0) + ((value as Row).increment as number);
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'decrement' in (value as Row)) {
      next[field] = (next[field] ?? 0) - ((value as Row).decrement as number);
      continue;
    }
    next[field] = value;
  }
  return next;
}

function resolveCreateData(data: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'create' || key === 'connect' || key === 'createMany') continue;
    out[key] = value;
  }
  return out;
}

function withIncludes(name: string, row: Row, include: any, prisma: FakePrisma): Row {
  if (!include) return row;
  const result = { ...row };

  if (name === 'processDefinition') {
    if (include.currentVersion) {
      result.currentVersion = row.currentVersionId
        ? prisma.all('processVersion').find((v) => v.id === row.currentVersionId) ?? null
        : null;
    }
    if (include.versions) result.versions = prisma.all('processVersion').filter((v) => v.definitionId === row.id);
    if (include._count?.select?.variants) {
      result._count = { variants: prisma.all('productVariant').filter((v) => v.productId === row.id).length };
    }
  }

  if (name === 'processVersion') {
    if (include.steps) {
      result.steps = prisma
        .all('processStepDefinition')
        .filter((s) => s.versionId === row.id)
        .sort((a, b) => a.stepNumber - b.stepNumber);
    }
    if (include.automationRules) {
      result.automationRules = prisma.all('processAutomationRule').filter((r) => r.versionId === row.id);
    }
    if (include.definition) result.definition = prisma.all('processDefinition').find((d) => d.id === row.definitionId) ?? null;
  }

  if (name === 'processInstance') {
    if (include.currentStep) {
      result.currentStep = row.currentStepId
        ? prisma.all('processStepDefinition').find((s) => s.id === row.currentStepId) ?? null
        : null;
    }
    if (include.version) {
      const version = prisma.all('processVersion').find((v) => v.id === row.versionId) ?? null;
      result.version = version
        ? withIncludes('processVersion', version, { steps: true }, prisma)
        : null;
    }
    if (include.definition) result.definition = prisma.all('processDefinition').find((d) => d.id === row.definitionId) ?? null;
    if (include.stepInstances) {
      result.stepInstances = prisma.all('processStepInstance').filter((s) => s.instanceId === row.id);
    }
    if (include.incidents) result.incidents = prisma.all('processIncident').filter((i) => i.instanceId === row.id);
    if (include.outcome) result.outcome = prisma.all('processOutcome').find((o) => o.instanceId === row.id) ?? null;
    if (include.auditEvents) result.auditEvents = prisma.all('processAuditEvent').filter((a) => a.instanceId === row.id);
  }

  if (name === 'processStepInstance') {
    if (include.stepDefinition) {
      result.stepDefinition = prisma.all('processStepDefinition').find((s) => s.id === row.stepDefinitionId) ?? null;
    }
  }

  if (name === 'processIncident') {
    if (include.instance) result.instance = prisma.all('processInstance').find((i) => i.id === row.instanceId) ?? null;
    if (include.solutions) result.solutions = prisma.all('processSolution').filter((s) => s.incidentId === row.id);
  }

  if (name === 'processOutcome') {
    if (include.instance) result.instance = prisma.all('processInstance').find((i) => i.id === row.instanceId) ?? null;
  }

  if (name === 'product') {
    if (include.variants) result.variants = prisma.all('productVariant').filter((v) => v.productId === row.id);
    if (include.aliases) result.aliases = prisma.all('productAlias').filter((a) => a.productId === row.id);
    if (include.auditEvents) result.auditEvents = prisma.all('masterDataAuditEvent').filter((a) => a.productId === row.id);
  }

  if (name === 'productAlias') {
    if (include.variant) {
      result.variant = row.variantId
        ? prisma.all('productVariant').find((v) => v.id === row.variantId) ?? null
        : null;
    }
    if (include.product) {
      result.product = row.productId
        ? prisma.all('product').find((p) => p.id === row.productId) ?? null
        : null;
    }
  }

  if (name === 'productVariant' && include.product) {
    result.product = prisma.all('product').find((p) => p.id === row.productId) ?? null;
  }

  return result;
}
