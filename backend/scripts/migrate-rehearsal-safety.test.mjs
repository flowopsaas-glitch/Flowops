import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import {
  parseMigration,
  compareInventory,
  decide,
  ledgerFindings,
  safetyChecks,
  readInventory,
  normalizeDefault,
  normalizeForeignKeyActions,
  renderReport,
  assertDisposableTarget,
  describeTarget,
  parseOptions,
  inspectDatabase,
  writeReports,
  checkedQuery,
  main,
  QUERIES,
  IDENTITY_QUERY,
} from "./migrate-rehearsal.mjs";

const SQL = `CREATE TYPE "State" AS ENUM ('DRAFT', 'APPROVED');
CREATE TABLE "Widget" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "label" TEXT NOT NULL DEFAULT 'ABC',
    "state" "State" NOT NULL DEFAULT 'DRAFT',
    "parentId" TEXT,
    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Widget_code_key" ON "Widget"("code");
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE;`;
const migration = () => ({
  ...parseMigration(SQL),
  path: "/fixture/20260926130650_init/migration.sql",
  sha256: "a".repeat(64),
});
const matching = () => {
  const m = migration();
  return {
    tables: structuredClone(m.tables),
    enums: structuredClone(m.enums),
    indexes: structuredClone(m.indexes),
    foreignKeys: structuredClone(m.foreignKeys),
    primaryKeys: [{ name: "Widget_pkey", table: "Widget", columns: ["id"] }],
    migrationBookkeeping: {
      present: false,
      readable: true,
      records: [],
      applied: [],
    },
    unsupported: [],
  };
};
const record = (overrides) => ({
  migration_name: "20260926130650_init",
  checksum: "a".repeat(64),
  finished_at: "2026-09-27",
  rolled_back_at: null,
  applied_steps_count: 1,
  ...overrides,
});
const withLedger = (records) => ({
  ...matching(),
  migrationBookkeeping: { present: true, readable: true, records },
});
const target = {
  host: "localhost",
  database: "flowops_clone",
  role: "inspector",
  port: 5432,
  local: true,
};
const options = {
  target,
  sourceRevision: "b".repeat(40),
  migrationRevision: "d".repeat(40),
  cloneSource: "synthetic fixture only",
};
const identity = () => ({
  database: target.database,
  role: target.role,
  session_role: target.role,
  read_only: "on",
  isolation: "repeatable read",
  row_security: "off",
  search_path: "pg_catalog, public",
  server_version: "16.0",
  server_address: "127.0.0.1",
});
function fakeClient(handler = () => undefined) {
  const calls = [];
  return {
    calls,
    query: async (sql) => {
      calls.push(sql);
      const value = await handler(sql);
      if (value !== undefined) return { rows: value };
      if (sql === IDENTITY_QUERY) return { rows: [identity()] };
      if (sql === QUERIES.migrationBookkeeping)
        return { rows: [{ present: false }] };
      if (/^SELECT.*(?:COUNT|SUM)/s.test(sql))
        return { rows: [{ count: "0" }] };
      return { rows: [] };
    },
  };
}
const validArgs = () => [
  "--mode",
  "inspect",
  "--i-have-a-clone",
  "--migration",
  "/fixture/migration.sql",
  "--migration-sha256",
  "a".repeat(64),
  "--report",
  "/fixture/report.md",
  "--source-revision",
  "b".repeat(40),
  "--migration-revision",
  "d".repeat(40),
  "--expected-host",
  "localhost",
  "--expected-database",
  "flowops_clone",
  "--expected-role",
  "inspector",
  "--clone-source",
  "approved backup reference",
];
const env = {
  REHEARSAL_DATABASE_URL:
    "postgresql://inspector:synthetic@localhost/flowops_clone",
};

for (const [name, mutate] of [
  [
    "index rename",
    (i) => {
      i.indexes[0].name = "renamed";
    },
  ],
  [
    "foreign-key actions",
    (i) => {
      i.foreignKeys[0].actions = "ON DELETE RESTRICT";
    },
  ],
  [
    "foreign-key name",
    (i) => {
      i.foreignKeys[0].name = "renamed";
    },
  ],
  [
    "primary-key name",
    (i) => {
      i.primaryKeys[0].name = "renamed";
    },
  ],
  [
    "enum order",
    (i) => {
      i.enums[0].values.reverse();
    },
  ],
  [
    "literal case",
    (i) => {
      i.tables[0].columns.find((c) => c.name === "label").default = "'abc'";
    },
  ],
]) {
  test(`audit regression: ${name} cannot produce a matching-schema verdict`, () => {
    const m = migration(),
      i = matching();
    mutate(i);
    const c = compareInventory(m, i);
    assert.equal(c.identical, false);
    assert.equal(decide(m, i, c).verdict, "drift");
  });
}
test("index access method is significant", () => {
  const m = migration(),
    i = matching();
  m.indexes[0].unique = false;
  i.indexes[0].unique = false;
  i.indexes[0].method = "hash";
  assert.equal(compareInventory(m, i).identical, false);
});
test("defaults retain data case, spaces, doubled quotes, and cast-like substrings", () => {
  for (const literal of [
    "'ABC'",
    "'has  two spaces'",
    "'It''s Mixed CASE'",
    "'value::text'",
    '"CaseSensitiveFunction"()',
  ])
    assert.equal(normalizeDefault(literal), literal);
  assert.notEqual(
    normalizeDefault("'ABC'::text"),
    normalizeDefault("'abc'::text"),
  );
  assert.equal(normalizeDefault("((now()))"), "current_timestamp");
});
test("referential actions normalize defaults without losing deferral and match semantics", () => {
  assert.notEqual(
    normalizeForeignKeyActions("ON DELETE CASCADE"),
    normalizeForeignKeyActions("ON DELETE RESTRICT"),
  );
  assert.notEqual(
    normalizeForeignKeyActions("DEFERRABLE INITIALLY DEFERRED"),
    normalizeForeignKeyActions("NOT DEFERRABLE"),
  );
  assert.notEqual(
    normalizeForeignKeyActions("MATCH FULL"),
    normalizeForeignKeyActions("MATCH SIMPLE"),
  );
});
test("unsupported migration statements and partial indexes cannot be silently accepted", () => {
  const m = {
    ...migration(),
    ...parseMigration(
      SQL +
        '\nCREATE VIEW "secret" AS SELECT 1;\nCREATE INDEX "partial" ON "Widget"("code") WHERE "code" IS NOT NULL;',
    ),
  };
  assert.equal(m.unsupported.length, 2);
  assert.equal(
    decide(m, matching(), compareInventory(m, matching())).verdict,
    "unknown",
  );
});
test("catalog-discovered unsupported objects force an unknown verdict", () => {
  const i = matching();
  i.unsupported.push({ kind: "row-security", name: "Widget" });
  assert.equal(
    decide(migration(), i, compareInventory(migration(), i)).verdict,
    "unknown",
  );
});
for (const [name, ledger] of [
  ["unreadable", { present: true, readable: false, records: [] }],
  ["unfinished", { present: true, records: [record({ finished_at: null })] }],
  [
    "rolled back",
    { present: true, records: [record({ rolled_back_at: "2026-09-27" })] },
  ],
  [
    "checksum mismatch",
    { present: true, records: [record({ checksum: "c".repeat(64) })] },
  ],
  [
    "metadata missing",
    { present: true, records: [record({ applied_steps_count: undefined })] },
  ],
  ["duplicate successes", { present: true, records: [record({}), record({})] }],
]) {
  test(`ledger ${name} is explicit HOLD evidence, not already-applied`, async () => {
    const m = migration(),
      i = matching();
    i.migrationBookkeeping = ledger;
    assert.notEqual(ledgerFindings(m, i).length, 0);
    assert.equal(decide(m, i, compareInventory(m, i)).verdict, "unknown");
    const findings = await safetyChecks(
      fakeClient(),
      m,
      compareInventory(m, i),
      i,
    );
    assert.ok(findings.some((f) => f.kind === "migration-ledger"));
  });
}
test("completed checksum-matching baseline with zero applied steps is valid ledger evidence", () => {
  const m = migration(),
    i = withLedger([record({ applied_steps_count: 0 })]);
  assert.deepEqual(ledgerFindings(m, i), []);
  assert.equal(decide(m, i, compareInventory(m, i)).verdict, "already-applied");
});
test("a previous rolled-back record does not erase a later valid success", () => {
  const i = withLedger([
    record({ rolled_back_at: "old", checksum: "old" }),
    record({}),
  ]);
  assert.deepEqual(ledgerFindings(migration(), i), []);
});
test("unknown findings are complete, even after fifty permission failures", async () => {
  const m = migration(),
    i = matching(),
    c = compareInventory(m, i);
  c.indexesOnlyInMigration = Array.from({ length: 50 }, (_, n) => ({
    name: `key${n}`,
    table: "Widget",
    columns: [`col${n}`],
    unique: true,
  }));
  const client = fakeClient((sql) => {
    if (sql.startsWith("SELECT"))
      throw Object.assign(new Error("DO NOT EXPOSE DATABASE VALUES"), {
        code: "42501",
      });
  });
  const checks = [],
    findings = await safetyChecks(client, m, c, i, checks);
  assert.equal(findings.length, 51); // 50 constraint checks plus visibility
  assert.equal(checks.length, 51);
  assert.equal(
    client.calls.filter((c) => c === "ROLLBACK TO SAVEPOINT rehearsal_check")
      .length,
    51,
  );
  assert.ok(!JSON.stringify(findings).includes("DO NOT EXPOSE"));
});
test("required-column and primary-key checks run against populated tables", async () => {
  const m = migration(),
    i = matching();
  i.primaryKeys = [];
  m.tables[0].columns.push({
    name: "newRequired",
    type: "text",
    notNull: true,
    default: null,
  });
  const client = fakeClient((sql) =>
    /^SELECT.*COUNT/s.test(sql) ? [{ count: "2" }] : undefined,
  );
  const findings = await safetyChecks(client, m, compareInventory(m, i), i);
  for (const kind of [
    "primary-key-duplicates",
    "primary-key-nulls",
    "new-required-column",
  ])
    assert.ok(
      findings.some((f) => f.kind === kind && f.severity === "blocking"),
    );
});
test("default/backfill behavior for new required columns is unknown, never assumed safe", async () => {
  const m = migration(),
    i = matching();
  m.tables[0].columns.push({
    name: "newRequired",
    type: "text",
    notNull: true,
    default: "unknown_function()",
  });
  assert.ok(
    (await safetyChecks(fakeClient(), m, compareInventory(m, i), i)).some(
      (f) =>
        f.kind === "new-required-column-default" && f.severity === "unknown",
    ),
  );
});
test("nullable unique composite keys exclude all NULL-containing tuples", async () => {
  const m = migration(),
    i = matching(),
    c = compareInventory(m, i);
  c.indexesOnlyInMigration = [
    { name: "unique", table: "Widget", unique: true, columns: ["a", "b"] },
  ];
  const client = fakeClient();
  await safetyChecks(client, m, c, i);
  const sql = client.calls.find((c) => c.includes("SUM(duplicates)"));
  assert.match(sql, /WHERE "a" IS NOT NULL AND "b" IS NOT NULL/);
  assert.match(sql, /FROM "public"\."Widget"/);
});
test("composite MATCH SIMPLE foreign key skips partially NULL references", async () => {
  const m = migration(),
    i = matching(),
    c = compareInventory(m, i);
  c.foreignKeysOnlyInMigration = [
    {
      name: "fk",
      table: "Widget",
      refTable: "Widget",
      columns: ["a", "b"],
      refColumns: ["x", "y"],
    },
  ];
  const client = fakeClient();
  await safetyChecks(client, m, c, i);
  const sql = client.calls.find((c) => c.includes("NOT EXISTS"));
  assert.match(sql, /child\."a" IS NOT NULL AND child\."b" IS NOT NULL/);
  assert.match(sql, /child\."b" = parent\."y"/);
});
test("matching schema still probes every table for visibility", async () => {
  const m = migration(),
    i = matching();
  const client = fakeClient((sql) => {
    if (sql.includes("AS accessible"))
      throw Object.assign(new Error("restricted"), { code: "42501" });
  });
  const findings = await safetyChecks(client, m, compareInventory(m, i), i);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "table-visibility");
  assert.equal(findings[0].severity, "unknown");
});
test("counts larger than signed 32-bit are preserved as exact strings", async () => {
  const m = migration(),
    i = matching();
  i.indexes = [];
  const findings = await safetyChecks(
    fakeClient((sql) =>
      sql.includes("SUM(") ? [{ count: "9007199254740993" }] : undefined,
    ),
    m,
    compareInventory(m, i),
    i,
  );
  assert.match(findings[0].detail, /^9007199254740993 row/);
});
test("inspection starts a read-only snapshot and always rolls back without sending migration SQL", async () => {
  const client = fakeClient();
  const report = await inspectDatabase(client, migration(), options);
  assert.equal(
    client.calls[0],
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  assert.equal(client.calls.at(-1), "ROLLBACK");
  assert.ok(client.calls.includes("SET LOCAL row_security = off"));
  assert.ok(
    client.calls.includes("SET LOCAL search_path = pg_catalog, public"),
  );
  for (const query of client.calls)
    assert.match(query, /^(BEGIN|SET LOCAL|SELECT|ROLLBACK|SAVEPOINT|RELEASE)/);
  assert.ok(!client.calls.includes(SQL));
  assert.equal(report.mode, "inspect");
  assert.equal(report.status, "REVIEW_REQUIRED");
  assert.equal(report.approval, "NOT_GRANTED");
  assert.equal(report.postApplyVerification.status, "not-applicable");
  assert.equal(report.cloneSource.independentlyVerifiedByTool, false);
  assert.deepEqual(report.decision.commands, []);
});
for (const [field, value] of [
  ["database", "wrong_clone"],
  ["role", "other"],
  ["session_role", "other"],
  ["read_only", "off"],
  ["isolation", "read committed"],
  ["row_security", "on"],
  ["search_path", "attacker,public"],
]) {
  test(`inspection refuses wrong connected ${field} before introspection and rolls back`, async () => {
    const client = fakeClient((sql) =>
      sql === IDENTITY_QUERY ? [{ ...identity(), [field]: value }] : undefined,
    );
    await assert.rejects(
      inspectDatabase(client, migration(), options),
      /Connected identity/,
    );
    assert.equal(client.calls.at(-1), "ROLLBACK");
    assert.ok(!client.calls.includes(QUERIES.tables));
  });
}
test("unexpected catalog errors roll back the inspection", async () => {
  const client = fakeClient((sql) => {
    if (sql === QUERIES.tables) throw new Error("catalog error");
  });
  await assert.rejects(
    inspectDatabase(client, migration(), options),
    /catalog error/,
  );
  assert.equal(client.calls.at(-1), "ROLLBACK");
});
test("unreadable ledger recovers to savepoint and remains unknown evidence", async () => {
  const client = fakeClient((sql) => {
    if (sql === QUERIES.migrationBookkeeping) return [{ present: true }];
    if (sql === QUERIES.appliedMigrations)
      throw Object.assign(new Error("restricted"), { code: "42501" });
  });
  const i = await readInventory(client);
  assert.equal(i.migrationBookkeeping.readable, false);
  assert.ok(client.calls.includes("ROLLBACK TO SAVEPOINT rehearsal_check"));
  assert.equal(ledgerFindings(migration(), i)[0].severity, "unknown");
});
test("unsupported index expressions are retained as unknown rather than filtered without evidence", async () => {
  const client = fakeClient((sql) =>
    sql === QUERIES.indexes
      ? [
          {
            indexname: "partial",
            indexdef:
              'CREATE INDEX partial ON public."Widget" USING btree ("code") WHERE "code" IS NOT NULL',
          },
        ]
      : undefined,
  );
  const i = await readInventory(client);
  assert.ok(
    i.unsupported.some(
      (o) => o.kind === "index-definition" && o.name === "partial",
    ),
  );
});
test("checked queries recover failed statements and release their savepoint", async () => {
  const client = fakeClient((sql) => {
    if (sql === "SELECT broken") throw new Error("failure");
  });
  await assert.rejects(checkedQuery(client, "SELECT broken"));
  assert.deepEqual(client.calls, [
    "SAVEPOINT rehearsal_check",
    "SELECT broken",
    "ROLLBACK TO SAVEPOINT rehearsal_check",
    "RELEASE SAVEPOINT rehearsal_check",
  ]);
});
test("target guard rejects percent-encoded production names after driver decoding", () => {
  for (const url of [
    "postgresql://u:p@localhost/%70rod_clone",
    "postgresql://u:p@%70rod.example/okay_clone",
  ])
    assert.throws(
      () => assertDisposableTarget(url, { allowRemote: true }),
      /production/,
    );
});
test("IPv6 parsing uses canonical host, not authority plus port", () => {
  assert.equal(
    describeTarget("postgresql://u:p@[::1]:5432/okay_clone").host,
    "::1",
  );
  assert.doesNotThrow(() =>
    assertDisposableTarget("postgresql://u:p@[::1]:5432/okay_clone"),
  );
});
test(".local is not proof of locality and query-option overrides are refused", () => {
  assert.throws(
    () => assertDisposableTarget("postgresql://u:p@staging.local/okay_clone"),
    /non-local/,
  );
  assert.throws(
    () =>
      assertDisposableTarget(
        "postgresql://u:p@localhost/okay_clone?options=-c%20search_path%3Devil",
      ),
    /unsupported/,
  );
});
test("expected host/database/role mismatches fail without echoing credentials", () => {
  const secret = "secret-MUST-NOT-APPEAR";
  assert.throws(
    () =>
      assertDisposableTarget(`postgresql://u:${secret}@localhost/okay_clone`, {
        expected: { host: "other", database: "okay_clone", role: "u" },
      }),
    (e) => !e.message.includes(secret) && e.message.includes("does not match"),
  );
});
for (const args of [
  ["--mode", "apply"],
  ["--confirm-apply"],
  ["--url", "DO-NOT-PRINT-SECRET"],
  ["--migration", "x", "--migration", "y"],
]) {
  test(`inspect CLI rejects write/ambiguous arguments: ${args[0]} ${args[1] === "apply" ? "apply" : ""}`, () => {
    assert.throws(
      () => parseOptions(args, env),
      (e) => !e.message.includes("DO-NOT-PRINT-SECRET"),
    );
  });
}
test("CLI requires explicit clone assertion, independently supplied target, and full revision/hash", () => {
  assert.equal(parseOptions(validArgs(), env).target.database, "flowops_clone");
  assert.throws(() =>
    parseOptions(
      validArgs().filter((a) => a !== "--i-have-a-clone"),
      env,
    ),
  );
  assert.throws(() => parseOptions(validArgs(), {}), /Inject REHEARSAL/);
  const args = validArgs();
  args[args.indexOf("--source-revision") + 1] = "short";
  assert.throws(() => parseOptions(args, env), /full Git SHA/);
});
test("report retains every finding and SQL statement; files are private and cannot be overwritten", async () => {
  const report = await inspectDatabase(fakeClient(), migration(), options);
  report.findings = Array.from({ length: 60 }, (_, n) => ({
    kind: "fixture",
    severity: "unknown",
    target: `table${n}`,
    detail: "unknown",
    sql: `SELECT ${n} AS fixture`,
  }));
  const markdown = renderReport(report);
  assert.match(markdown, /SELECT 59 AS fixture/);
  assert.ok(!markdown.includes("…and"));
  const dir = mkdtempSync(join(tmpdir(), "flowops-report-unit-"));
  try {
    const path = join(dir, "report.md");
    writeReports(report, path);
    assert.equal(
      JSON.parse(readFileSync(join(dir, "report.json"), "utf8")).findings
        .length,
      60,
    );
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, "report.json")).mode & 0o777, 0o600);
    assert.throws(() => writeReports(report, path), /already exist/);
    assert.equal(readFileSync(path, "utf8"), markdown);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("main checks reviewed artifact checksum before attempting a connection", async (t) => {
  let connections = 0;
  t.mock.method(pg.Client.prototype, "connect", async () => {
    connections++;
    throw new Error("must not connect");
  });
  const dir = mkdtempSync(join(tmpdir(), "flowops-checksum-unit-"));
  try {
    writeFileSync(join(dir, "migration.sql"), SQL);
    const args = validArgs();
    args[args.indexOf("--migration") + 1] = join(dir, "migration.sql");
    args[args.indexOf("--report") + 1] = join(dir, "report.md");
    await assert.rejects(main(args, env), /checksum mismatch/);
    assert.equal(connections, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("drift output contains no apply/baseline commands or misleading migration-to-datamodel recipe", () => {
  const m = migration(),
    i = matching();
  i.indexes = [];
  const decision = decide(m, i, compareInventory(m, i));
  assert.equal(decision.verdict, "drift");
  assert.deepEqual(decision.commands, []);
  assert.ok(!JSON.stringify(decision).includes("npx prisma"));
});

test("unsupported function defaults cannot produce an exact-schema claim", () => {
  const m = {
    ...migration(),
    ...parseMigration(
      SQL.replace("DEFAULT 'ABC'", "DEFAULT mysterious_function()"),
    ),
  };
  assert.ok(m.unsupported.some((s) => s.includes("Unsupported default")));
});
test("duplicate declared objects are unsupported instead of silently collapsed", () => {
  assert.ok(
    parseMigration(
      SQL + "\nCREATE TYPE \"State\" AS ENUM ('OTHER');",
    ).unsupported.some((s) => s.includes("Duplicate enum")),
  );
});
test("duplicate catalog index signatures are unknown, not collapsed to one matching index", async () => {
  const client = fakeClient((sql) =>
    sql === QUERIES.indexes
      ? [
          {
            indexname: "first",
            indexdef:
              'CREATE INDEX first ON public."Widget" USING btree ("code")',
          },
          {
            indexname: "second",
            indexdef:
              'CREATE INDEX second ON public."Widget" USING btree ("code")',
          },
        ]
      : undefined,
  );
  assert.ok(
    (await readInventory(client)).unsupported.some(
      (o) => o.kind === "duplicate-index-signature",
    ),
  );
});
