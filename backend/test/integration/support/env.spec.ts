/**
 * The guard that keeps the integration suite away from anything but a
 * disposable database.
 *
 * These cases exist because the guard's first version compared the raw host —
 * `localhost:5432` — against an allowlist of names, so every CI run died in
 * `beforeAll` with "Refusing to run ... non-local host localhost:5432" while
 * the suite passed locally on a unix-socket URL. A host with a port is the
 * normal case, not an exotic one, so it is pinned here.
 */

import { integrationTruncateEnabled, resolveIntegrationDatabaseUrl } from './env';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('integration database guard', () => {
  it('accepts the CI shape: local host with a port', () => {
    process.env.INTEGRATION_DATABASE_URL =
      'postgresql://flowops_test:test_password@localhost:5432/flowops_test';
    expect(resolveIntegrationDatabaseUrl()).toContain('/flowops_test');
  });

  it('accepts a unix-socket URL', () => {
    process.env.INTEGRATION_DATABASE_URL =
      'postgresql://postgres:@/flowops_test?host=/tmp/dev-pg/data';
    expect(resolveIntegrationDatabaseUrl()).toContain('host=/tmp/dev-pg/data');
  });

  it.each([
    'postgresql://u:p@127.0.0.1:5432/flowops_test',
    'postgresql://u:p@[::1]:5432/flowops_test',
    'postgresql://u:p@db.local/flowops_test',
  ])('accepts other local forms: %s', (url) => {
    process.env.INTEGRATION_DATABASE_URL = url;
    expect(resolveIntegrationDatabaseUrl()).toBe(url);
  });

  it('refuses a database whose name is not unmistakably disposable', () => {
    process.env.INTEGRATION_DATABASE_URL = 'postgresql://u:p@localhost:5432/flowops';
    expect(() => resolveIntegrationDatabaseUrl()).toThrow(/flowops/);
  });

  it('refuses a non-local host', () => {
    process.env.INTEGRATION_DATABASE_URL = 'postgresql://u:p@db.example.com:5432/flowops_test';
    expect(() => resolveIntegrationDatabaseUrl()).toThrow(/non-local/);
  });

  it('falls back to DATABASE_URL, and demands some URL at all', () => {
    delete process.env.INTEGRATION_DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/flowops_test';
    expect(resolveIntegrationDatabaseUrl()).toContain('flowops_test');

    delete process.env.DATABASE_URL;
    expect(() => resolveIntegrationDatabaseUrl()).toThrow(/needs a database/);
  });
});

describe('integration truncation switch', () => {
  it('is on unless explicitly disabled', () => {
    delete process.env.INTEGRATION_ALLOW_TRUNCATE;
    expect(integrationTruncateEnabled()).toBe(true);

    process.env.INTEGRATION_ALLOW_TRUNCATE = 'false';
    expect(integrationTruncateEnabled()).toBe(false);
  });
});
