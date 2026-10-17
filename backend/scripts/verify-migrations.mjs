#!/usr/bin/env node
/**
 * Fail loudly when the repository has no applied-shape migrations.
 *
 * Why this exists: an empty `prisma/migrations/` directory makes
 * `prisma migrate deploy` exit 0 having done nothing, so a CI job that is
 * supposed to prepare a database reports success while every environment stays
 * un-migrated. That is a silent failure of the kind this project has had enough
 * of, so the migration job refuses to run against an empty directory.
 *
 * Usage:
 *   node scripts/verify-migrations.mjs [--migrations-dir prisma/migrations]
 *                                      [--schema prisma/schema.prisma]
 *
 * Exit codes: 0 = usable migrations, 1 = the repository is not deployable.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, '..');

/** Prisma names migration folders `<14-digit timestamp>_<snake_case name>`. */
const MIGRATION_DIR_NAME = /^\d{14}_[a-z0-9_]+$/i;

/** Read the datasource provider out of a Prisma schema. */
export function schemaProvider(schemaSource) {
  const datasource = /datasource\s+\w+\s*\{([\s\S]*?)\}/.exec(schemaSource);
  const match = datasource && /provider\s*=\s*"([^"]+)"/.exec(datasource[1]);
  return match ? match[1] : undefined;
}

/** The lock file's provider, or undefined when the file is missing/unreadable. */
export function lockProvider(lockSource) {
  const match = /provider\s*=\s*"([^"]+)"/.exec(lockSource ?? '');
  return match ? match[1] : undefined;
}

/**
 * Inspect a migrations directory. Pure enough to unit test: takes paths, reads
 * the filesystem, returns findings instead of printing them.
 */
export function checkMigrations({ migrationsDir, schemaPath }) {
  const errors = [];
  const warnings = [];
  const migrations = [];

  if (!existsSync(migrationsDir) || !statSync(migrationsDir).isDirectory()) {
    errors.push(
      `No migrations directory at ${migrationsDir}. Run \`npx prisma migrate dev\` ` +
        'against a disposable database and commit the result.',
    );
    return { ok: false, errors, warnings, migrations, schemaProvider: undefined };
  }

  const lockPath = path.join(migrationsDir, 'migration_lock.toml');
  const providerFromSchema = existsSync(schemaPath)
    ? schemaProvider(readFileSync(schemaPath, 'utf8'))
    : undefined;
  const providerFromLock = existsSync(lockPath)
    ? lockProvider(readFileSync(lockPath, 'utf8'))
    : undefined;

  if (providerFromLock === undefined) {
    errors.push(`Missing or unreadable ${lockPath} (expected \`provider = "..."\`).`);
  } else if (providerFromSchema && providerFromLock !== providerFromSchema) {
    errors.push(
      `migration_lock.toml declares provider "${providerFromLock}" but the schema ` +
        `datasource uses "${providerFromSchema}".`,
    );
  }

  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const migrationSqlPath = path.join(migrationsDir, entry.name, 'migration.sql');
    if (!MIGRATION_DIR_NAME.test(entry.name)) {
      errors.push(
        `Migration folder "${entry.name}" does not look like "<timestamp>_<name>"; ` +
          'Prisma orders migrations by that timestamp.',
      );
    }
    if (!existsSync(migrationSqlPath)) {
      errors.push(`Migration "${entry.name}" has no migration.sql.`);
      continue;
    }
    const sql = readFileSync(migrationSqlPath, 'utf8').trim();
    if (sql.length === 0) {
      errors.push(`Migration "${entry.name}" has an empty migration.sql.`);
      continue;
    }
    migrations.push({ name: entry.name, bytes: sql.length });
  }

  if (migrations.length === 0) {
    errors.push(
      'prisma/migrations contains no migration — `prisma migrate deploy` would ' +
        'exit 0 without creating anything, leaving every database un-migrated.',
    );
  }

  if (migrations.length > 1) {
    warnings.push(
      `${migrations.length} migration(s) present; this check validates file/provider shape only and does not attest migration review, data compatibility, or deployment safety.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    migrations,
    schemaProvider: providerFromSchema,
  };
}

function main(argv) {
  const argOf = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index === -1 ? fallback : argv[index + 1];
  };

  const migrationsDir = path.resolve(
    BACKEND_ROOT,
    argOf('--migrations-dir', 'prisma/migrations'),
  );
  const schemaPath = path.resolve(BACKEND_ROOT, argOf('--schema', 'prisma/schema.prisma'));

  const result = checkMigrations({ migrationsDir, schemaPath });
  const annotate = (level, message) =>
    process.env.GITHUB_ACTIONS === 'true' ? `${level}::${message}` : message;

  for (const warning of result.warnings) console.log(annotate('::warning', warning));

  if (!result.ok) {
    console.error(
      `✗ migrations are not deployable (${result.migrations.length} usable migration(s))`,
    );
    for (const error of result.errors) console.error(annotate('::error', error));
    return 1;
  }

  console.log(
    `✓ ${result.migrations.length} migration(s) present and well-formed ` +
      `(provider ${result.schemaProvider ?? 'unknown'}): ` +
      result.migrations.map((m) => m.name).join(', '),
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
