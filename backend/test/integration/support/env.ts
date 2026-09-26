/**
 * Environment handling for the database-backed integration suite.
 *
 * These tests TRUNCATE tables between cases, so they must never be pointed at
 * anything but a disposable database. The guard below is deliberately the same
 * shape as `scripts/ephemeral-db.mjs`: an explicit opt-in plus a name/host
 * check, so a copied shell or a stray `.env` cannot aim the suite at
 * production.
 */

const ALLOWED_DB_SUFFIXES = ['_test', '_ci', '_ephemeral', '_shadow'];

export function resolveIntegrationDatabaseUrl(): string {
  const url = process.env.INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'The integration suite needs a database. Set INTEGRATION_DATABASE_URL (or DATABASE_URL) ' +
        'to a disposable PostgreSQL, e.g. postgresql://user:pass@localhost:5432/flowops_test',
    );
  }

  // Parse by hand: `new URL()` rejects the unix-socket form
  // (`postgresql://user@/db?host=/dir`) local PostgreSQL uses.
  const match =
    /^postgres(?:ql)?:\/\/(?<userinfo>[^@]*)@?(?<hostport>[^/?]*)\/(?<db>[^?]*)(?:\?(?<query>.*))?$/.exec(
      url,
    );
  if (!match?.groups) {
    throw new Error('INTEGRATION_DATABASE_URL is not a valid postgres connection string.');
  }

  const query = new URLSearchParams(match.groups.query ?? '');
  const dbName = decodeURIComponent(match.groups.db || '');
  const host = query.get('host') || match.groups.hostport || '';
  const isLocal =
    host === '' ||
    ['localhost', '127.0.0.1', '::1'].includes(host) ||
    host.startsWith('/') ||
    host.endsWith('.local');

  if (!ALLOWED_DB_SUFFIXES.some((suffix) => dbName.endsWith(suffix))) {
    throw new Error(
      `Refusing to run the integration suite against database "${dbName}": the name must end in ` +
        `one of ${ALLOWED_DB_SUFFIXES.join(', ')} so it is unmistakably disposable.`,
    );
  }
  if (!isLocal) {
    throw new Error(
      `Refusing to run the integration suite against non-local host "${host}".`,
    );
  }

  return url;
}

/** True when the suite is explicitly allowed to wipe the target database. */
export function integrationTruncateEnabled(): boolean {
  return process.env.INTEGRATION_ALLOW_TRUNCATE !== 'false';
}
