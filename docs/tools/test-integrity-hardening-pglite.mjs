#!/usr/bin/env node
/**
 * Exercise the integrity-hardening migration's legacy-data preflights and the
 * constraints it installs against an in-memory PostgreSQL-compatible engine.
 * This is intentionally separate from the empty-schema parity checker.
 *
 * Usage (with PGlite installed in an ignored scratch directory):
 *   PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js \
 *     node docs/tools/test-integrity-hardening-pglite.mjs
 *
 * It never connects to or modifies a network database.
 */
import fs from 'node:fs';
import path from 'node:path';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const migrationRoot = path.join(process.cwd(), 'backend/prisma/migrations');
const migrationName = '20261015110000_integrity_hardening';
const migrationPath = path.join(migrationRoot, migrationName, 'migration.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const migrations = fs.readdirSync(migrationRoot)
  .filter((name) => fs.existsSync(path.join(migrationRoot, name, 'migration.sql')))
  .sort();
const now = '2026-10-17T00:00:00.000Z';

if (!migrations.includes(migrationName)) throw new Error(`Missing ${migrationName}`);

async function createDatabase(includeHardeningMigration) {
  const db = new PGlite();
  const hardeningIndex = migrations.indexOf(migrationName);
  const toApply = includeHardeningMigration
    ? migrations
    : migrations.slice(0, hardeningIndex);
  for (const name of toApply) {
    await db.exec(fs.readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8'));
  }
  return db;
}

async function seedCompanies(db) {
  await db.query(
    'INSERT INTO companies (id, name, "updatedAt") VALUES ($1, $2, $3), ($4, $5, $3)',
    ['company-a', 'Company A', now, 'company-b', 'Company B'],
  );
}

async function insertCollection(db, id, companyId = 'company-a') {
  await db.query(
    'INSERT INTO collections (id, "clientName", "clientPhone", "pickupAddress", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6)',
    [id, 'Test Client', '+27123456789', 'Johannesburg', companyId, now],
  );
}

async function insertWaybill(db, id, companyId = 'company-a', sourceCollectionId = null) {
  await db.query(
    `INSERT INTO waybills
      (id, "trackingNumber", "senderName", "senderPhone", "senderAddress", "recipientName", "recipientPhone", "recipientAddress", "companyId", "sourceCollectionId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, `TRACK-${id}`, 'Sender', '+27111111111', 'Origin', 'Recipient', '+27222222222', 'Destination', companyId, sourceCollectionId, now],
  );
}

async function insertInvoice(db, id, companyId = 'company-a') {
  await db.query(
    'INSERT INTO invoices (id, "invoiceNumber", "clientName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5)',
    [id, `INV-${id}`, 'Test Client', companyId, now],
  );
}

async function insertInvoiceItem(db, id, invoiceId, waybillId) {
  await db.query(
    'INSERT INTO invoice_items (id, description, "unitPrice", total, "invoiceId", "waybillId") VALUES ($1, $2, $3, $3, $4, $5)',
    [id, 'Test delivery', 100, invoiceId, waybillId],
  );
}

async function expectPreflightRejection(label, expectedMessage, setup) {
  const db = await createDatabase(false);
  try {
    await seedCompanies(db);
    await setup(db);
    let failure;
    try {
      await db.exec(migrationSql);
    } catch (error) {
      failure = error;
    }
    if (!failure) throw new Error(`${label}: migration unexpectedly succeeded`);
    if (!String(failure.message).includes(expectedMessage)) {
      throw new Error(`${label}: unexpected migration error: ${failure.message}`);
    }
    console.log(`✓ preflight rejects ${label}`);
  } finally {
    await db.close();
  }
}

await expectPreflightRejection(
  'duplicate sourceCollectionId',
  'Duplicate waybill sourceCollectionId',
  async (db) => {
    await insertCollection(db, 'collection-1');
    await insertWaybill(db, 'waybill-1', 'company-a', 'collection-1');
    await insertWaybill(db, 'waybill-2', 'company-a', 'collection-1');
  },
);

await expectPreflightRejection(
  'cross-company sourceCollectionId',
  'Waybill sourceCollectionId contains',
  async (db) => {
    await insertCollection(db, 'collection-1', 'company-a');
    await insertWaybill(db, 'waybill-1', 'company-b', 'collection-1');
  },
);

await expectPreflightRejection(
  'duplicate invoice line for one waybill',
  'Waybills appear on multiple invoice items',
  async (db) => {
    await insertWaybill(db, 'waybill-1');
    await insertInvoice(db, 'invoice-1');
    await insertInvoiceItem(db, 'item-1', 'invoice-1', 'waybill-1');
    await insertInvoiceItem(db, 'item-2', 'invoice-1', 'waybill-1');
  },
);

await expectPreflightRejection(
  'cross-company invoice/waybill line',
  'Invoice items link waybills across companies',
  async (db) => {
    await insertWaybill(db, 'waybill-1', 'company-b');
    await insertInvoice(db, 'invoice-1', 'company-a');
    await insertInvoiceItem(db, 'item-1', 'invoice-1', 'waybill-1');
  },
);

await expectPreflightRejection(
  'cross-company disbursement invoice',
  'Disbursement invoiceId contains',
  async (db) => {
    await insertInvoice(db, 'invoice-1', 'company-a');
    await db.query(
      'INSERT INTO disbursements (id, "companyId", authority, "invoiceId", "updatedAt") VALUES ($1, $2, $3, $4, $5)',
      ['disbursement-1', 'company-b', 'Test authority', 'invoice-1', now],
    );
  },
);

// A valid legacy-format database must migrate, discard plaintext provider
// secrets, and retain an encrypted-format value for its configured key.
const legacyDb = await createDatabase(false);
try {
  await seedCompanies(legacyDb);
  await legacyDb.query(
    `INSERT INTO sso_connections (id, "companyId", "clientSecret", "updatedAt")
     VALUES ($1, $2, $3, $4), ($5, $6, $7, $4)`,
    ['sso-legacy', 'company-a', 'legacy-plaintext-secret', now,
      'sso-encrypted', 'company-b', 'enc:v1:opaque-envelope'],
  );
  await legacyDb.exec(migrationSql);
  const secrets = (await legacyDb.query('SELECT id, "clientSecret" FROM sso_connections ORDER BY id')).rows;
  const legacySecret = secrets.find((row) => row.id === 'sso-legacy')?.clientSecret;
  const encryptedSecret = secrets.find((row) => row.id === 'sso-encrypted')?.clientSecret;
  if (legacySecret !== null || encryptedSecret !== 'enc:v1:opaque-envelope') {
    throw new Error('SSO migration did not clear plaintext while preserving the encrypted-format secret');
  }
  console.log('✓ migration clears legacy plaintext SSO secrets and preserves encrypted-format secrets');
} finally {
  await legacyDb.close();
}

// Confirm that clean post-migration data remains usable and the database—not
// merely application code—rejects duplicate/cross-tenant financial links.
const constrainedDb = await createDatabase(true);
try {
  await seedCompanies(constrainedDb);
  await insertCollection(constrainedDb, 'collection-1');
  await insertWaybill(constrainedDb, 'waybill-1', 'company-a', 'collection-1');
  await insertInvoice(constrainedDb, 'invoice-a', 'company-a');
  await insertInvoice(constrainedDb, 'invoice-b', 'company-b');
  await insertInvoiceItem(constrainedDb, 'item-1', 'invoice-a', 'waybill-1');
  await constrainedDb.query(
    'INSERT INTO disbursements (id, "companyId", authority, "invoiceId", "updatedAt") VALUES ($1, $2, $3, $4, $5)',
    ['disbursement-1', 'company-b', 'Test authority', 'invoice-b', now],
  );

  async function expectConstraintRejection(label, sql, values, expectedText) {
    let failure;
    try {
      await constrainedDb.query(sql, values);
    } catch (error) {
      failure = error;
    }
    if (!failure || !String(failure.message).toLowerCase().includes(expectedText)) {
      throw new Error(`${label}: expected ${expectedText} constraint error, got ${failure?.message ?? 'success'}`);
    }
    console.log(`✓ database constraint rejects ${label}`);
  }

  await expectConstraintRejection(
    'second source waybill for one collection',
    `INSERT INTO waybills
      (id, "trackingNumber", "senderName", "senderPhone", "senderAddress", "recipientName", "recipientPhone", "recipientAddress", "companyId", "sourceCollectionId", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    ['waybill-2', 'TRACK-waybill-2', 'Sender', '+27111111111', 'Origin', 'Recipient', '+27222222222', 'Destination', 'company-a', 'collection-1', now],
    'duplicate key',
  );
  await expectConstraintRejection(
    'second invoice line for one waybill',
    'INSERT INTO invoice_items (id, description, "unitPrice", total, "invoiceId", "waybillId") VALUES ($1, $2, $3, $3, $4, $5)',
    ['item-2', 'Duplicate delivery', 100, 'invoice-a', 'waybill-1'],
    'duplicate key',
  );
  await expectConstraintRejection(
    'cross-company disbursement invoice',
    'INSERT INTO disbursements (id, "companyId", authority, "invoiceId", "updatedAt") VALUES ($1, $2, $3, $4, $5)',
    ['disbursement-2', 'company-b', 'Test authority', 'invoice-a', now],
    'foreign key',
  );
} finally {
  await constrainedDb.close();
}

console.log('✓ integrity-hardening PGlite checks passed; no external database was used');
