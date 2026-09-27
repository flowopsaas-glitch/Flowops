import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { preparePlan, main } from "./prepare-ci-schema.mjs";

const ci = {
  CI: "true",
  NODE_ENV: "test",
  DATABASE_URL:
    "postgresql://flowops_test:synthetic@localhost:5432/flowops_test",
};
function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), "flowops-ci-plan-unit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function addMigration(root) {
  const dir = join(root, "prisma/migrations/20260927120000_fixture");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "migration.sql"), "CREATE TABLE fixture (id text);"); // file only; never executed
}

test("backend runtime is application-only, with no schema mutation shell", () => {
  const file = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const commands = file.split("\n").filter((line) => /^CMD\s/.test(line));
  assert.equal(commands.length, 1);
  assert.deepEqual(JSON.parse(commands[0].slice(4)), ["node", "dist/main"]);
  assert.ok(!/^ENTRYPOINT\s/m.test(file));
});
test("CI does not use migrate dev as a fallback and runs the regression suite", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.ok(!/migrate deploy\s*\|\|/.test(workflow));
  assert.ok(workflow.includes("npm run release:safety:test"));
  assert.ok(workflow.includes("node scripts/prepare-ci-schema.mjs"));
});
test("image smoke fixture is explicit and the application role lacks schema ownership", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const fixture = workflow.indexOf(
    "flowops-backend:smoke-test db push --skip-generate",
  );
  const restricted = workflow.indexOf("CREATE ROLE smoke_app LOGIN");
  const application = workflow.indexOf("--name flowops-backend-smoke");
  assert.ok(fixture > 0 && fixture < restricted && restricted < application);
  assert.ok(workflow.includes("NOSUPERUSER NOCREATEDB NOCREATEROLE"));
  assert.ok(workflow.includes("REVOKE CREATE ON SCHEMA public FROM PUBLIC"));
  assert.ok(
    workflow.includes(
      "postgresql://smoke_app:smoke_app@smoke-postgres:5432/smoke",
    ),
  );
  assert.ok(workflow.includes("trap cleanup EXIT"));
});
for (const override of [
  { CI: "false" },
  { NODE_ENV: "production" },
  { DATABASE_URL: "not a url" },
  {
    DATABASE_URL:
      "postgresql://flowops_test:synthetic@localhost:5432/staging_clone",
  },
  {
    DATABASE_URL:
      "postgresql://flowops_test:synthetic@other-host:5432/flowops_test",
  },
  { DATABASE_URL: "postgresql://owner:synthetic@localhost:5432/flowops_test" },
  {
    DATABASE_URL:
      "postgresql://flowops_test:synthetic@localhost:5432/flowops_test?host=production",
  },
]) {
  test(`CI fixture helper refuses non-approved context ${Object.keys(override)[0]} case ${JSON.stringify(override).length}`, (t) => {
    assert.throws(() => preparePlan({ ...ci, ...override }, workspace(t)));
  });
}
test("missing migration history is clearly fixture-only, not migration evidence", (t) => {
  const plan = preparePlan(ci, workspace(t));
  assert.deepEqual(plan.args, ["db", "push", "--skip-generate"]);
  assert.match(plan.evidence, /not migration\/adoption evidence/);
});
test("empty or incomplete migration directories fail instead of falling back to db push", (t) => {
  const root = workspace(t);
  mkdirSync(join(root, "prisma/migrations"), { recursive: true });
  assert.throws(() => preparePlan(ci, root), /empty or incomplete/);
  mkdirSync(join(root, "prisma/migrations/20260927120000_fixture"));
  assert.throws(() => preparePlan(ci, root), /empty or incomplete/);
});
test("existing migrations select migrate deploy only", (t) => {
  const root = workspace(t);
  addMigration(root);
  assert.deepEqual(preparePlan(ci, root).args, ["migrate", "deploy"]);
});
test("failed deploy is returned without invoking any fallback command", (t) => {
  const root = workspace(t);
  addMigration(root);
  const calls = [];
  const exit = main(ci, root, (...args) => {
    calls.push(args);
    return { status: 17 };
  });
  assert.equal(exit, 17);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1].slice(-2), ["migrate", "deploy"]);
});
test("terminated schema preparation is a failure, not success or fallback", (t) => {
  const root = workspace(t);
  addMigration(root);
  let calls = 0;
  assert.throws(
    () =>
      main(ci, root, () => {
        calls++;
        return { status: null, signal: "SIGTERM" };
      }),
    /did not complete/,
  );
  assert.equal(calls, 1);
});
test("invalid CI target never starts a child process", (t) => {
  let calls = 0;
  assert.throws(() =>
    main({ ...ci, NODE_ENV: "production" }, workspace(t), () => {
      calls++;
    }),
  );
  assert.equal(calls, 0);
});
