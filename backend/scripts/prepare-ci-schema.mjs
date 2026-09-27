#!/usr/bin/env node
/**
 * ONLY prepares the disposable GitHub CI service database, never a staging clone.
 * This branch has no approved migration SQL from PR #436. With no migrations
 * directory, db push is explicitly fixture setup, not migration evidence.
 * Once migrations exist, a failed migrate deploy is fatal: no dev/push fallback.
 * No schema operation is ever triggered by application startup.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export function preparePlan(env, backendRoot) {
  if (env.CI !== "true" || env.NODE_ENV !== "test")
    throw new Error(
      "Schema fixture setup is restricted to the disposable CI test service.",
    );
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("Invalid CI database configuration.");
  }
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "localhost" ||
    url.port !== "5432" ||
    url.pathname !== "/flowops_test" ||
    url.username !== "flowops_test" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Refusing non-CI target. Do not point this helper at a staging clone or live database.",
    );
  }
  const dir = join(backendRoot, "prisma/migrations");
  if (!existsSync(dir))
    return {
      args: ["db", "push", "--skip-generate"],
      evidence:
        "FIXTURE ONLY: no migrations directory. This is not migration/adoption evidence.",
    };
  const migrations = readdirSync(dir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  if (
    !migrations.length ||
    migrations.some(
      (entry) =>
        !/^\d{14}_.+/.test(entry.name) ||
        !existsSync(join(dir, entry.name, "migration.sql")) ||
        !readFileSync(join(dir, entry.name, "migration.sql"), "utf8").trim(),
    )
  ) {
    throw new Error(
      "Migrations directory is empty or incomplete. Refusing all schema setup; no fallback.",
    );
  }
  return {
    args: ["migrate", "deploy"],
    evidence:
      "Fresh CI service database only; not existing-data adoption evidence.",
  };
}

export function main(
  env = process.env,
  backendRoot = process.cwd(),
  run = spawnSync,
) {
  const plan = preparePlan(env, backendRoot);
  console.log(plan.evidence);
  const result = run(
    process.execPath,
    [join(backendRoot, "node_modules/prisma/build/index.js"), ...plan.args],
    {
      cwd: backendRoot,
      env,
      stdio: "inherit",
    },
  );
  if (result.error || result.signal || result.status == null)
    throw new Error(
      "CI schema preparation did not complete. No fallback attempted.",
    );
  return result.status;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
