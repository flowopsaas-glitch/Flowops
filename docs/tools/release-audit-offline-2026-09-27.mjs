#!/usr/bin/env node
/**
 * Offline observations for the release audit, NOT release acceptance tests.
 * Expected outcomes deliberately describe defects in PR #436 at 7844fffa.
 * No connection, HTTP request, migration, or application server is started.
 * Usage: node <this-file> <pinned-source-root> [dependency-root]
 * dependency-root defaults to <pinned-source-root>/backend and must contain
 * installed pg and typescript. Do not install or execute lifecycle scripts here.
 * Nest decorators and Prisma are stubbed; application results are mock-backed,
 * not PostgreSQL-backed or deployed-environment evidence.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

if (!process.argv[2]) throw new Error('Supply the extracted pinned source root');
const root = resolve(process.argv[2]);
const requireDeps = createRequire(resolve(process.argv[3] ?? `${root}/backend`, 'package.json'));
const { Client } = requireDeps('pg');
const ts = requireDeps('typescript');
const tool = await import(pathToFileURL(`${root}/backend/scripts/migrate-rehearsal.mjs`));
const { parseMigration, compareInventory, decide, safetyChecks, readInventory,
  normalizeDefault, renderReport, assertDisposableTarget, QUERIES } = tool;
let count = 0;
async function observed(name, fn) {
  await fn();
  count++;
  console.log(`REPRODUCED ${String(count).padStart(2, '0')}: ${name}`);
}
const sql = `CREATE TYPE "State" AS ENUM ('DRAFT', 'APPROVED');
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
const migration = { ...parseMigration(sql), path: '/fixture/20260926130650_init/migration.sql' };
function matching() {
  return {
    tables: structuredClone(migration.tables), enums: structuredClone(migration.enums),
    indexes: structuredClone(migration.indexes), foreignKeys: structuredClone(migration.foreignKeys),
    primaryKeys: [{ table: 'Widget', columns: ['id'] }],
    migrationBookkeeping: { present: false, readable: true, applied: [] },
  };
}
const noQuery = { query: async () => { throw new Error('Unexpected query in this fixture'); } };

await observed('changed index name is reported but identical=true and verdict=baseline', () => {
  const i = matching(); i.indexes[0].name = 'renamed';
  const c = compareInventory(migration, i);
  assert.equal(c.indexNameDiffs.length, 1); assert.equal(c.identical, true);
  assert.equal(decide(migration, i, c).verdict, 'baseline');
});
await observed('FK CASCADE versus RESTRICT is ignored by comparison', () => {
  const i = matching(); i.foreignKeys[0].actions = 'ON DELETE RESTRICT ON UPDATE RESTRICT';
  assert.equal(compareInventory(migration, i).identical, true);
});
await observed('enum ordering differences are ignored', () => {
  const i = matching(); i.enums[0].values.reverse();
  assert.equal(compareInventory(migration, i).identical, true);
});
await observed('case-sensitive text defaults collapse to the same value', () => {
  assert.equal(normalizeDefault("'ABC'::text"), normalizeDefault("'abc'::text"));
});
await observed('index access method differences are ignored', () => {
  const m = structuredClone(migration); m.indexes[0].unique = false;
  const i = matching(); i.indexes[0].unique = false; i.indexes[0].method = 'hash';
  assert.equal(compareInventory(m, i).identical, true);
});
await observed('unreadable migration ledger yields no unknown safety finding on matching schema', async () => {
  const i = matching(); i.migrationBookkeeping = { present: true, readable: false, applied: [] };
  const c = compareInventory(migration, i);
  assert.deepEqual(await safetyChecks(noQuery, migration, c, i), []);
  assert.equal(decide(migration, i, c).verdict, 'baseline');
});
await observed('failed/rolled-back/checksum-mismatched ledger details are discarded', async () => {
  const i = await readInventory({ query: async (query) => {
    if (query === QUERIES.migrationBookkeeping) return { rows: [{ present: true }] };
    if (query === QUERIES.appliedMigrations) return { rows: [{ migration_name: '20260926130650_init', finished_at: null, rolled_back_at: 'fixture', checksum: 'incorrect' }] };
    return { rows: [] };
  } });
  const schema = matching(); schema.migrationBookkeeping = i.migrationBookkeeping;
  assert.equal(decide(migration, schema, compareInventory(migration, schema)).verdict, 'already-applied');
  assert.match(QUERIES.appliedMigrations, /^SELECT migration_name FROM/);
});
await observed('unknown findings silently stop at 15 although 20 checks fail', async () => {
  const i = matching(); const c = compareInventory(migration, i);
  c.indexesOnlyInMigration = Array.from({ length: 20 }, (_, n) => ({ name: `u${n}`, table: 'Widget', columns: [`c${n}`], unique: true }));
  let queries = 0;
  const findings = await safetyChecks({ query: async () => { queries++; throw new Error('permission denied'); } }, migration, c, i);
  assert.equal(queries, 20); assert.equal(findings.length, 15);
});
await observed('rendered findings are capped and SQL evidence is omitted', () => {
  const i = matching(); const c = compareInventory(migration, i);
  const report = renderReport({ target: { host: 'fixture', database: 'fixture_clone' }, migrationPath: migration.path, inventory: i, comparison: c, decision: decide(migration, i, c), mode: 'inspect', findings: Array.from({ length: 35 }, (_, n) => ({ severity: 'blocking', kind: 'fixture', target: `t${n}`, detail: 'fixture', sql: 'SELECT 987654321 AS omitted_sql' })) });
  assert.match(report, /…and 5 more/); assert.ok(!report.includes('SELECT 987654321'));
});
await observed('missing NOT NULL column with no default has no data safety check', async () => {
  const i = matching(); i.tables[0].rowEstimate = 4;
  const m = structuredClone(migration);
  m.tables[0].columns.push({ name: 'required_note', type: 'text', notNull: true, default: null });
  const c = compareInventory(m, i);
  assert.equal(c.columnsOnlyInMigration.length, 1);
  assert.deepEqual(await safetyChecks(noQuery, m, c, i), []);
});
await observed('missing primary key has no duplicate-row safety check', async () => {
  const i = matching(); i.primaryKeys = [];
  const c = compareInventory(migration, i);
  assert.equal(c.primaryKeysOnlyInMigration.length, 1);
  assert.deepEqual(await safetyChecks(noQuery, migration, c, i), []);
});
await observed('nullable UNIQUE precheck groups NULLs without PostgreSQL NULL-distinct filtering', async () => {
  const i = matching(); i.indexes = [];
  let query;
  const findings = await safetyChecks({ query: async q => { query = q; return { rows: [{ count: 2 }] }; } }, migration, compareInventory(migration, i), i);
  assert.equal(findings[0].kind, 'unique-index'); assert.ok(!query.includes('IS NOT NULL'));
});
await observed('drift recipe compares migrations to datamodel, not to actual clone', () => {
  const i = matching(); i.indexes = [];
  const d = decide(migration, i, compareInventory(migration, i));
  assert.equal(d.verdict, 'drift');
  assert.ok(d.commands.some(c => c.includes('--from-migrations') && c.includes('--to-schema-datamodel')));
  assert.ok(!d.commands.some(c => c.includes('--from-url')));
});
await observed('percent-encoded target passes guard while pg decodes a production-named database', () => {
  // Synthetic URL only. Constructing a Client parses config; connect() is NEVER called.
  const url = 'postgresql://fixture:fixture@localhost/%70rod_clone';
  assert.equal(assertDisposableTarget(url).database, '%70rod_clone');
  assert.equal(new Client({ connectionString: url }).connectionParameters.database, 'prod_clone');
});

// Execute the actual TypeScript method bodies with mocked infrastructure.
const decorator = () => () => {};
const common = new Proxy({ Logger: class { warn() {} error() {} log() {} },
  NotFoundException: class extends Error {}, BadRequestException: class extends Error {},
  ConflictException: class extends Error {} }, { get: (o, k) => o[k] ?? decorator });
function loadTs(relative, className) {
  const source = readFileSync(`${root}/${relative}`, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    experimentalDecorators: true, emitDecoratorMetadata: false,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: id => {
    if (id === '@nestjs/common') return common;
    if (id === '@nestjs/swagger') return new Proxy({}, { get: () => decorator });
    if (id.endsWith('public.decorator')) return { Public: decorator };
    if (id.endsWith('user.decorator')) return { CurrentUser: decorator };
    if (id.endsWith('groq-model')) return { GROQ_MODEL: 'offline-fixture' };
    throw new Error(`Unexpected runtime import: ${id}`);
  }, Date, Map, Set, console }, { filename: relative });
  return exports[className];
}
const Wms = loadTs('backend/src/warehouse-management/warehouse-management.service.ts', 'WarehouseManagementService');
function warehouseFixture({ blocked = false } = {}) {
  const state = { stock: 0, available: 0, movements: 0, completed: false, binUpdates: [] };
  const prisma = {
    goodsReceipt: { findFirst: async () => ({ id: 'r', receiptNumber: 'r', status: state.completed ? 'COMPLETED' : 'EXPECTED', expectedQty: 10, lines: [{ id: 'line', sku: 'SKU', expectedQty: 10 }] }), update: async () => { state.completed = true; } },
    productVariant: { findMany: async () => [], count: async () => 0 },
    goodsReceiptLine: { update: async () => {} },
    inventoryItem: { findFirst: async () => ({ id: 'stock' }), update: async ({ data }) => { state.stock += data.quantityOnHand.increment; state.available += data.quantityAvailable.increment; } },
    binLocation: { update: async args => state.binUpdates.push(args) },
    stockMovement: { create: async () => { state.movements++; } },
  };
  const bridge = { isEnabled: () => blocked, onGoodsReceived: async () => ({ blockDecision: { blocked: true } }), assertCompletionAllowed: () => { throw new Error('blocked'); } };
  const service = new Wms(prisma, {}, bridge);
  return { state, prisma, service };
}
const receipt = { lines: [{ sku: 'SKU', receivedQty: 10, damagedQty: 3, putAwayBinId: 'bin' }] };
await observed('receipt stocks full received quantity as available, including damaged units (mock)', async () => {
  const f = warehouseFixture(); await f.service.receiveGoods('r', 'tenant-a', receipt);
  assert.equal(f.state.stock, 10); assert.equal(f.state.available, 10);
});
await observed('replaying the same receipt increments stock twice (mock)', async () => {
  const f = warehouseFixture(); await f.service.receiveGoods('r', 'tenant-a', receipt); await f.service.receiveGoods('r', 'tenant-a', receipt);
  assert.equal(f.state.stock, 20); assert.equal(f.state.movements, 2);
});
await observed('bridge refusal occurs after stock and movement writes (mock)', async () => {
  const f = warehouseFixture({ blocked: true });
  await assert.rejects(f.service.receiveGoods('r', 'tenant-a', receipt), /blocked/);
  assert.equal(f.state.stock, 10); assert.equal(f.state.movements, 1); assert.equal(f.state.completed, false);
});
await observed('put-away bin update is scoped only by bin ID (mock query capture)', async () => {
  const f = warehouseFixture(); await f.service.receiveGoods('r', 'tenant-a', receipt);
  assert.equal(JSON.stringify(f.state.binUpdates[0].where), '{"id":"bin"}');
});
await observed('empty-bin suggestion has no tenant constraint on zone/warehouse (mock query capture)', async () => {
  let query;
  const service = new Wms({ binLocation: { findMany: async q => { query = q; return []; } } }, {});
  await service.aiSuggestPutAwayBin('tenant-a', 'SKU', 1);
  assert.equal(JSON.stringify(query.where.zone), '{"type":{"in":["BULK","PICK"]}}');
  assert.equal(JSON.stringify(query.where.OR[0]), '{"isEmpty":true}');
});
await observed('warehouse creation body can override server companyId (mock query capture)', async () => {
  let query;
  const service = new Wms({ warehouse: { create: async q => { query = q; return q; } } }, {});
  await service.createWarehouse('tenant-a', { name: 'fixture', companyId: 'tenant-b' });
  assert.equal(query.data.companyId, 'tenant-b');
});
const Portal = loadTs('backend/src/customer-portal/customer-portal.controller.ts', 'CustomerPortalController');
await observed('whitespace phone input becomes contains-empty-string in public tracking (mock)', async () => {
  let query;
  const service = new Portal({ waybill: { findMany: async q => { query = q; return []; } } }, {});
  await service.trackShipments('tenant-a', '   ');
  assert.equal(query.where.OR[0].senderPhone.contains, '');
  assert.equal(query.take, 50);
});
await observed('public invoice listing accepts email without proof of ownership (mock)', async () => {
  let queried = false;
  const service = new Portal({ invoice: { findMany: async () => { queried = true; return []; } } }, {});
  await service.getInvoices('tenant-a', 'fixture@example.invalid'); assert.equal(queried, true);
});
const Invoice = loadTs('backend/src/invoices/public-invoice.controller.ts', 'PublicInvoiceController');
await observed('public invoice renderer emits stored markup without HTML escaping (mock)', async () => {
  let html;
  const controller = new Invoice({ invoice: { findFirst: async () => ({ companyId: 'tenant-a', invoiceNumber: 'fixture', items: [{ description: '<b data-audit="marker">fixture</b>', quantity: 1, unitPrice: 1, total: 1 }] }) }, company: { findUnique: async () => ({ name: 'fixture' }) } });
  await controller.viewInvoice('invoice', 'synthetic-token', { setHeader() {}, send: s => { html = s; } });
  assert.ok(html.includes('<b data-audit="marker">fixture</b>'));
});
await observed('receipt actor role can come from request-body actorRole (mock)', async () => {
  const f = warehouseFixture(); let actor;
  f.service.receiptBridge = { isEnabled: () => true, onGoodsReceived: async (...args) => { actor = args[3]; throw new Error('stop before completion'); } };
  await assert.rejects(f.service.receiveGoods('r', 'tenant-a', { ...receipt, actorRole: 'ADMIN' }), /stop before completion/);
  assert.equal(actor.role, 'ADMIN');
});
await observed('receipt still requires product-master table access when bridge is disabled (mock)', async () => {
  const f = warehouseFixture(); f.prisma.productVariant.findMany = async () => { throw new Error('new product-master table unavailable'); };
  await assert.rejects(f.service.receiveGoods('r', 'tenant-a', receipt), /product-master table unavailable/);
});
const AiEvents = loadTs('backend/src/ai/ai-events.controller.ts', 'AiEventsController');
await observed('AI verification action forwards caller-supplied tenant without authenticated context (mock)', async () => {
  let companyId;
  const controller = new AiEvents({ verifyCompliance: async id => { companyId = id; } });
  await controller.verifyPod('tenant-b'); assert.equal(companyId, 'tenant-b');
});
const AiService = loadTs('backend/src/ai/ai-events.service.ts', 'AiEventsService');
await observed('AI resolve updates by ID even after tenant-scoped lookup returns no row (mock)', async () => {
  let update;
  const service = new AiService({ aiEvent: { findFirst: async () => null, update: async q => { update = q; return q; } } }, { get: () => 'MEDIUM' });
  await service.resolve('other-tenant-event', 'tenant-a', 'fixture');
  assert.equal(JSON.stringify(update.where), '{"id":"other-tenant-event"}');
  assert.equal(update.data.resolved, true);
});
console.log(`\n${count} current-code observations reproduced. This is defect evidence, NOT a release pass.`);
console.log(`No database connections or live HTTP requests performed. Node ${process.version}.`);
