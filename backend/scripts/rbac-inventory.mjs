#!/usr/bin/env node
/**
 * RBAC inventory — lists every HTTP route and whether it has @Roles metadata.
 *
 * RolesGuard allows any authenticated role when a route has no @Roles. That is
 * the current production behaviour; this script is the work list for closing
 * it. It is a static, read-only scan: no server, no database, no imports.
 *
 * Usage: node scripts/rbac-inventory.mjs [--format table|json|summary]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");
const HTTP_DECORATORS = /@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".controller.ts")) out.push(full);
  }
  return out;
}

/** Does a decorator block (the text before a route decorator) contain @Roles? */
function hasRolesBefore(source, index) {
  const before = source.slice(Math.max(0, index - 300), index);
  return /@Roles\s*\(/.test(before);
}

function analyze(file) {
  const source = readFileSync(file, "utf8");
  const classHasRoles = /@Roles\s*\(/.test(
    source.slice(0, source.search(/export class\s+\w*Controller/) + 1) === -1
      ? source
      : source.slice(
          source.search(/@Controller/),
          source.search(/export class/) + 400,
        ),
  );
  const routes = [];

  for (const match of source.matchAll(HTTP_DECORATORS)) {
    // Find the method name that follows this decorator.
    const after = source.slice(match.index, match.index + 200);
    const name = /\)?\s*\n?\s*(?:async\s+)?(\w+)\s*\(/.exec(
      after.slice(match[0].length),
    );
    const handlerHasRoles = hasRolesBefore(source, match.index);
    const isPublic = /@Public\s*\(\)/.test(
      source.slice(Math.max(0, match.index - 300), match.index),
    );
    routes.push({
      method: match[1].toUpperCase(),
      handler: name ? name[1] : "(unknown)",
      roles: handlerHasRoles || classHasRoles,
      public: isPublic,
    });
  }
  return { file: relative(process.cwd(), file), classHasRoles, routes };
}

const controllers = walk(ROOT)
  .map(analyze)
  .filter((c) => c.routes.length > 0)
  .sort((a, b) => a.file.localeCompare(b.file));

const allRoutes = controllers.flatMap((c) =>
  c.routes.map((r) => ({ ...r, file: c.file })),
);
const unrole = allRoutes.filter((r) => !r.roles && !r.public);
const publicRoutes = allRoutes.filter((r) => r.public);

const summary = {
  controllers: controllers.length,
  routes: allRoutes.length,
  routesWithRoles: allRoutes.length - unrole.length - publicRoutes.length,
  publicRoutes: publicRoutes.length,
  routesWithNoRoles: unrole.length,
  controllersWithNoRolesAtAll: controllers.filter((c) => !c.classHasRoles)
    .length,
};

const format =
  (process.argv[2] === "--format" ? process.argv[3] : null) ?? "table";

if (format === "json") {
  console.log(JSON.stringify({ summary, controllers }, null, 2));
} else if (format === "summary") {
  console.log(summary);
} else {
  console.log("Route".padEnd(66) + "Method  Kind");
  console.log("─".repeat(88));
  for (const r of allRoutes) {
    const kind = r.public ? "public" : r.roles ? "roles" : "NO ROLES";
    const route = `${r.file.replace(/^src\//, "")}#${r.handler}`;
    console.log(`${route.padEnd(66).slice(0, 66)}${r.method.padEnd(8)}${kind}`);
  }
  console.log("─".repeat(88));
  console.log(summary);
  console.log(
    "\nSet RBAC_STRICT=true to reject routes with no @Roles once this list is empty.",
  );
}
