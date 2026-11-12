#!/usr/bin/env node
/**
 * Duplicate-reference check — READ-ONLY pre-flight for the unique constraints
 * added in migration 20261113090000_unique_business_references.
 *
 * WHY THIS EXISTS
 * ---------------
 * `CREATE UNIQUE INDEX` fails outright if a single duplicate row exists. All
 * three columns it constrains have been unenforced since their tables were
 * created, so a deploy that adds the index will abort on the first database
 * that already holds a duplicate — which is precisely the database that needs
 * the constraint most.
 *
 * The migration de-duplicates before it constrains, so the deploy will not
 * actually fail. But "it will be handled automatically" is not a good enough
 * answer when the handling means nulling a provider id or suffixing a printed
 * manifest code. Run this first, read what it says, and decide whether you
 * want the automatic outcome or a manual one.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It never writes. There is no UPDATE, DELETE or DDL anywhere in this file.
 * It is safe to run against production at any time, and safe to run repeatedly.
 *
 * Usage:
 *   node scripts/duplicate-reference-check.mjs              # human report
 *   node scripts/duplicate-reference-check.mjs --format json
 *   node scripts/duplicate-reference-check.mjs --sql        # emit SQL only
 *
 * `--sql` needs no database and no driver: it prints the exact statements so
 * they can be pasted into psql on a box where node is not available. That is
 * the path to use if you would rather not put a connection string anywhere.
 *
 * Exit codes:
 *   0  no duplicates
 *   1  at least one duplicate group found
 *   1  could not run (no DATABASE_URL, connection failed) — a check that
 *      cannot see the data must never be reported as a clean result
 */

const CHECKS = [
  {
    name: 'whatsapp_messages.wabaMessageId',
    scope: 'global',
    // Nullable, and Postgres lets a unique index hold any number of NULLs, so
    // rows without a provider id are not duplicates of each other.
    sql: `
      SELECT "wabaMessageId" AS value, COUNT(*) AS n,
             MIN("sentAt") AS first_seen, MAX("sentAt") AS last_seen
        FROM "whatsapp_messages"
       WHERE "wabaMessageId" IS NOT NULL
       GROUP BY "wabaMessageId"
      HAVING COUNT(*) > 1
       ORDER BY n DESC, value
    `,
    explain:
      'Meta retries a webhook until it gets a 200 and does not promise ' +
      'exactly-once, so the same message can arrive more than once. Each ' +
      'group here is one customer message stored several times.',
    remedy: 'the migration nulls the provider id on the redundant rows; the message content is kept',
  },
  {
    name: 'manifests.code (per company)',
    scope: 'companyId',
    sql: `
      SELECT "companyId" AS tenant, "code" AS value, COUNT(*) AS n,
             MIN("createdAt") AS first_seen, MAX("createdAt") AS last_seen
        FROM "manifests"
       GROUP BY "companyId", "code"
      HAVING COUNT(*) > 1
       ORDER BY n DESC, tenant, value
    `,
    explain:
      'The code is COUNT()+1, so deleting a manifest lowers the count and ' +
      'reissues a code that is still on a live row. Two manifests then share ' +
      'the code a depot quotes when it asks where a load is.',
    remedy: 'the migration suffixes the redundant rows with -dup<N>; the oldest row keeps its code',
  },
  {
    name: 'courier_orders.reference (per company)',
    scope: 'companyId',
    sql: `
      SELECT "companyId" AS tenant, "reference" AS value, COUNT(*) AS n,
             MIN("createdAt") AS first_seen, MAX("createdAt") AS last_seen
        FROM "courier_orders"
       GROUP BY "companyId", "reference"
      HAVING COUNT(*) > 1
       ORDER BY n DESC, tenant, value
    `,
    explain:
      'Same generator shape as manifest codes: a count over rows created this ' +
      'year, so a deletion reissues a reference.',
    remedy: 'the migration suffixes the redundant rows with -dup<N>; the oldest row keeps its reference',
  },
];

export { CHECKS };

const SAMPLES_PER_GROUP = 3;

/** Row ids inside a duplicate group, so the affected rows can be inspected. */
export function sampleSql(check) {
  if (check.name.startsWith('whatsapp')) {
    return `
      SELECT "wabaMessageId" AS value, "id", "threadId", "sentAt", "direction",
             LEFT("content", 80) AS content
        FROM "whatsapp_messages"
       WHERE "wabaMessageId" = ANY($1::text[])
       ORDER BY "wabaMessageId", "sentAt", "id"
    `;
  }
  const table = check.name.startsWith('manifests') ? 'manifests' : 'courier_orders';
  const column = table === 'manifests' ? 'code' : 'reference';
  return `
    SELECT "companyId" AS tenant, "${column}" AS value, "id", "createdAt"
      FROM "${table}"
     WHERE ("companyId", "${column}") IN (SELECT * FROM unnest($1::text[], $2::text[]) AS t(a,b))
     ORDER BY "companyId", "${column}", "createdAt", "id"
  `;
}

function emitSqlOnly() {
  console.log('-- Duplicate-reference pre-flight (read-only).');
  console.log('-- Generated by backend/scripts/duplicate-reference-check.mjs --sql');
  console.log('-- Each statement returns zero rows when that reference is clean.\n');
  for (const c of CHECKS) {
    console.log(`-- ${c.name}`);
    console.log(`${c.sql.trim()}\n`);
  }
  console.log('-- Reminder: these are SELECTs. Nothing here changes data.');
}

function render(results) {
  const lines = [];
  lines.push('Duplicate-reference pre-flight (READ-ONLY)');
  lines.push('─'.repeat(78));
  lines.push(
    'Run before deploying migration 20261113090000_unique_business_references.',
  );
  lines.push('');

  let total = 0;
  for (const r of results) {
    total += r.groups.length;
    const flag = r.groups.length === 0 ? 'clean' : `${r.groups.length} duplicate group(s)`;
    lines.push(`${r.name}: ${flag}`);
    if (r.groups.length === 0) continue;

    lines.push(`  why:    ${r.explain}`);
    lines.push(`  remedy: ${r.remedy}`);
    for (const g of r.groups.slice(0, SAMPLES_PER_GROUP)) {
      const where = g.tenant ? `tenant ${g.tenant} / ${g.value}` : `${g.value}`;
      lines.push(`    - ${where}  x${g.n}  (${g.first_seen} .. ${g.last_seen})`);
    }
    if (r.groups.length > SAMPLES_PER_GROUP) {
      lines.push(`    ... and ${r.groups.length - SAMPLES_PER_GROUP} more group(s)`);
    }
    lines.push('');
  }

  lines.push('─'.repeat(78));
  if (total === 0) {
    lines.push('PASS  no duplicate references. The migration will add its indexes');
    lines.push('      without touching any existing row.');
  } else {
    lines.push(`FOUND ${total} duplicate group(s) across ${results.filter((r) => r.groups.length).length} of 3 references.`);
    lines.push('The migration de-duplicates these itself, so the deploy will not');
    lines.push('fail — but review the list above first, because de-duplication');
    lines.push('means nulling a provider id or suffixing a printed code.');
  }
  return { text: lines.join('\n'), total };
}

export async function run(client) {
  const results = [];
  for (const c of CHECKS) {
    const res = await client.query(c.sql);
    results.push({
      name: c.name,
      explain: c.explain,
      remedy: c.remedy,
      groups: res.rows.map((row) => ({
        tenant: row.tenant ?? null,
        value: row.value,
        n: Number(row.n),
        first_seen: row.first_seen,
        last_seen: row.last_seen,
      })),
    });
  }
  return results;
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--sql')) {
    emitSqlOnly();
    return { total: 0 };
  }

  const json = argv.includes('--format') && argv[argv.indexOf('--format') + 1] === 'json';
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL is not set. This check must actually see the data — it does\n' +
        'not report "clean" when it could not run. Use --sql to print the\n' +
        'statements instead and run them yourself with psql.',
    );
    process.exitCode = 1;
    return { total: -1 };
  }

  const { Client } = await import('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const results = await run(client);
    const { text, total } = render(results);
    if (json) {
      console.log(JSON.stringify({ total, results }, null, 2));
    } else {
      console.log(text);
    }
    if (total > 0) process.exitCode = 1;
    return { total };
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`duplicate-reference-check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
