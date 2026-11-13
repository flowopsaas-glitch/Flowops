-- RLS Phase 2 — the application / platform role split.
--
-- WHY THIS FILE IS NOT A PRISMA MIGRATION
--
-- Roles are cluster-level objects, not database-level ones. A Prisma migration
-- runs once per database against a cluster that may host several, so a bare
-- `CREATE ROLE` would fail on the second database with "role already exists",
-- and worse, cannot carry a password without writing a secret into version
-- control. This file is therefore run by an operator, with psql, once per
-- cluster:
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/rls-roles.sql
--
-- It is idempotent: re-running it converges an existing cluster rather than
-- failing, and it CORRECTS the attributes of roles that already exist, because
-- the failure mode that matters most is not "role missing" but "role present
-- and quietly a superuser".
--
-- WHAT THIS FIXES
--
-- Every compose file in this repo connects the backend as `POSTGRES_USER`,
-- which the official image makes the initdb superuser. PostgreSQL exempts
-- superusers — and roles with BYPASSRLS — from row-level security entirely.
-- `FORCE ROW LEVEL SECURITY` binds the table owner; it does NOT bind a
-- superuser. So every policy in 20261012210000_rls_tenant_isolation was
-- installed, correct, and never consulted. Demonstrated in
-- `scripts/rls-semantics.test.mjs`.
--
-- THE SPLIT
--
--   flowops_app       app.rls_strict = 'on'   every tenant query, fail-closed
--   flowops_platform  app.rls_strict = 'off'  the ~114 operations that cannot
--                                             have a tenant context
--
-- `app_tenant_guard()` reads `current_setting('app.rls_strict', true)`, which
-- honours role-level defaults, so connections as the app role get fail-closed
-- RLS while connections as the platform role keep today's behaviour. The
-- cross-tenant operations enumerated in `PLATFORM_SCOPE`
-- (`scripts/tenant-scope-policy.mjs`) — owner, auth, paystack callbacks,
-- webhooks, alerting, platform sweeps — carry on working with no application
-- change.
--
-- PASSWORDS
--
-- The roles are created with LOGIN and no password. On a trust-auth local
-- container that is sufficient; anywhere else, set one before pointing traffic
-- at them:
--
--     ALTER ROLE flowops_app      PASSWORD '<from secrets>';
--     ALTER ROLE flowops_platform PASSWORD '<from secrets>';
--
-- A role with no password cannot authenticate under scram/md5, so this fails
-- closed rather than open.
--
-- Requires a superuser to run (it creates roles and grants privileges).

\set ON_ERROR_STOP on

-- ── 1. The roles ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowops_app') THEN
    CREATE ROLE flowops_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowops_platform') THEN
    CREATE ROLE flowops_platform LOGIN;
  END IF;
END
$$;

-- Not conditional, and not redundant. If either role already existed with the
-- wrong attributes — created by hand during an incident, or by an earlier draft
-- of this file — the conditional block above would have skipped it and left a
-- superuser in place. Silently. This is the assertion that prevents that.
ALTER ROLE flowops_app      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE flowops_platform NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- ── 2. The flag: the whole point of the split ───────────────────────────────

ALTER ROLE flowops_app      SET app.rls_strict = 'on';
ALTER ROLE flowops_platform SET app.rls_strict = 'off';

-- ── 3. Privileges ───────────────────────────────────────────────────────────

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO flowops_app', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO flowops_platform', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO flowops_app, flowops_platform;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO flowops_app, flowops_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO flowops_app, flowops_platform;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO flowops_app, flowops_platform;

-- Tables created by later Prisma migrations must be covered too, or the app
-- loses access on the next deploy. This applies to objects created by the role
-- running it, so run it as the role that runs migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flowops_app, flowops_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO flowops_app, flowops_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO flowops_app, flowops_platform;

-- ── 4. Report, so the operator sees the result rather than assuming it ───────

SELECT rolname,
       rolsuper,
       rolbypassrls,
       (SELECT setting FROM pg_db_role_setting s
          JOIN pg_roles r2 ON r2.oid = s.setrole
         WHERE r2.rolname = pg_roles.rolname
           AND s.setconfig::text LIKE '%app.rls_strict%') AS rls_strict
  FROM pg_roles
 WHERE rolname IN ('flowops_app', 'flowops_platform')
 ORDER BY rolname;

-- Both rows must show rolsuper = f, rolbypassrls = f, and an rls_strict value
-- of {app.rls_strict=on} / {app.rls_strict=off} respectively. A missing
-- rls_strict means step 2 did not apply and the split is not in effect.
