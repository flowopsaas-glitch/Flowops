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
import { pathToFileURL } from "node:url";

const ROOT = join(process.cwd(), "src");

/**
 * Replace comment content with spaces, preserving every offset and newline.
 * Decorator scanning must never treat prose ("…@Roles() is required here")
 * as metadata.
 */
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}
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

/**
 * The decorator block directly above a route decorator: every contiguous line
 * between the blank line that separates it from the previous member and the
 * route decorator itself.
 *
 * (An earlier version looked back a fixed 300 characters, which leaked the
 * *previous* method's @Roles/@Public into routes that carry neither.)
 */
function decoratorBlockAbove(source, index) {
  const cut = source.lastIndexOf("\n", index);
  const lines = source.slice(0, cut === -1 ? index : cut).split("\n");
  const block = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.trim() === "") break;
    block.unshift(line);
    if (block.join("\n").length > 500) break;
  }
  return block.join("\n");
}

function analyze(file) {
  const source = blankComments(readFileSync(file, "utf8"));
  // Class-level @Roles means a decorator block directly ABOVE the class
  // declaration. (An earlier version of this scan looked 400 chars past the
  // declaration, which mis-counted method decorators as class-wide.)
  const classIndex = source.search(/export class\s+\w*Controller/);
  const classBlock =
    classIndex > -1
      ? source.slice(Math.max(0, classIndex - 800), classIndex)
      : "";
  const classHasRoles = /@Roles\s*\(/.test(classBlock);
  const classHasPublic = /@Public\s*\(/.test(classBlock);
  const routes = [];

  for (const match of source.matchAll(HTTP_DECORATORS)) {
    // Find the method name that follows this decorator, skipping any further
    // decorators in the same block (an @ApiOperation placed *below* the HTTP
    // verb used to be mistaken for the handler name).
    const tail = source.slice(match.index + match[0].length, match.index + 400);
    let depth = 1; // the HTTP decorator's own opening paren
    let handler = "(unknown)";
    for (const raw of tail.split("\n")) {
      const line = raw.trim();
      if (line === "") continue;
      if (depth > 0) {
        depth += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
        continue;
      }
      if (line.startsWith("@")) {
        depth += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
        continue;
      }
      const found = /^(?:async\s+)?(\w+)\s*\(/.exec(line);
      if (found) handler = found[1];
      break;
    }
    const block = decoratorBlockAbove(source, match.index);
    const handlerHasRoles = /@Roles\s*\(/.test(block);
    const isPublic = /@Public\s*\(/.test(block);
    routes.push({
      method: match[1].toUpperCase(),
      handler,
      roles: handlerHasRoles || classHasRoles,
      public: isPublic || classHasPublic,
      classHasRoles,
      classHasPublic,
    });
  }
  return { file: relative(process.cwd(), file), classHasRoles, routes };
}

/** Analyze every controller under `rootDir` (default: ./src). */
export function collectRouteInventory(rootDir = ROOT) {
  const controllers = walk(rootDir)
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

  return { controllers, allRoutes, unrole, publicRoutes, summary };
}

const isCli =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const { controllers, allRoutes, summary } = collectRouteInventory();

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
}
