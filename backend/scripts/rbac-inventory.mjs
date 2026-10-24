#!/usr/bin/env node
/**
 * RBAC inventory — lists every HTTP route and whether it has @Roles metadata.
 *
 * RolesGuard allows any authenticated role when a route has no @Roles. That is
 * the current production behaviour; this script is the work list for closing
 * it. It is a static, read-only scan: no server, no database, no imports.
 *
 * Usage: node scripts/rbac-inventory.mjs [--format table|json|summary] [--check]
 *
 * --check exits 1 while any route has NO access decision at all: no @Roles,
 * no @AnyAuthenticated, no @Public, no @OwnerOnly. That empty list is the
 * precondition for running the API with RBAC_STRICT=true.
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
function decoratorBlockAbove(source, rawSource, index) {
  const cut = source.lastIndexOf("\n", index);
  const lines = source.slice(0, cut === -1 ? index : cut).split("\n");
  const rawLines = rawSource.slice(0, cut === -1 ? index : cut).split("\n");
  const block = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.trim() === "") {
      // blankComments() turns comment lines into whitespace. A comment line
      // sitting BETWEEN decorators (e.g. "@Public()" then an explanatory
      // "// ..." then the verb) is part of the decorator block, not a
      // separator — check the raw line before giving up.
      const raw = (rawLines[i] ?? "").trim();
      if (raw.startsWith("//") || raw.startsWith("*") || raw.startsWith("/*")) {
        continue;
      }
      break;
    }
    block.unshift(line);
    if (block.join("\n").length > 500) break;
  }
  return block.join("\n");
}

function analyze(file) {
  const rawSource = readFileSync(file, "utf8");
  const source = blankComments(rawSource);
  // Class-level @Roles means a decorator block directly ABOVE the class
  // declaration. (An earlier version of this scan looked 400 chars past the
  // declaration, which mis-counted method decorators as class-wide.) Blocks
  // are resolved per route against the nearest class declared above it, so
  // a file hosting more than one controller is still classified correctly.
  const classIndexes = [...source.matchAll(/export class\s+\w*Controller/g)].map(
    (m) => m.index,
  );
  const classBlockFor = (routeIndex) => {
    let nearest = -1;
    for (const ci of classIndexes) {
      if (ci < routeIndex) nearest = ci;
      else break;
    }
    // The decorator block directly above the class declaration (contiguous
    // decorator/comment lines) — an arbitrary character window would bleed
    // the PREVIOUS class's decorators into this one in multi-class files.
    return nearest > -1 ? decoratorBlockAbove(source, rawSource, nearest) : "";
  };
  const classBlock = classBlockFor(Number.POSITIVE_INFINITY);
  const classHasRoles = /@Roles\s*\(/.test(classBlock);
  const classHasPublic = /@Public\s*\(/.test(classBlock);
  const routes = [];

  for (const match of source.matchAll(HTTP_DECORATORS)) {
    // Find the method name that follows this decorator, skipping any further
    // decorators in the same block (an @ApiOperation placed *below* the HTTP
    // verb used to be mistaken for the handler name). Decorators may also sit
    // BELOW the verb (`@Post('x')` then `@Roles(...)`) — Nest applies them to
    // the same handler, so that block is collected as well.
    const tail = source.slice(match.index + match[0].length, match.index + 400);
    let depth = 1; // the HTTP decorator's own opening paren
    let pastHttpDecorator = false;
    let handler = "(unknown)";
    const belowLines = [];
    for (const raw of tail.split("\n")) {
      const line = raw.trim();
      if (line === "") continue;
      const depthBefore = depth;
      depth += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
      if (!pastHttpDecorator) {
        if (depth === 0) pastHttpDecorator = true;
        continue;
      }
      if (line.startsWith("@") || depthBefore > 0) {
        belowLines.push(raw);
        continue;
      }
      const found = /^(?:async\s+)?(\w+)\s*\(/.exec(line);
      if (found) handler = found[1];
      break;
    }
    const block = decoratorBlockAbove(source, rawSource, match.index);
    const below = belowLines.join("\n");
    const routeClassBlock = classBlockFor(match.index);
    const hasDec = (re) => re.test(block) || re.test(below);
    const classDec = (re) => re.test(routeClassBlock);
    routes.push({
      method: match[1].toUpperCase(),
      handler,
      roles: hasDec(/@Roles\s*\(/) || classDec(/@Roles\s*\(/),
      public: hasDec(/@Public\s*\(/) || classDec(/@Public\s*\(/),
      owner: hasDec(/@OwnerOnly\s*\(/) || classDec(/@OwnerOnly\s*\(/),
      anyAuth:
        hasDec(/@AnyAuthenticated\s*\(/) || classDec(/@AnyAuthenticated\s*\(/),
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
  // A route is DECIDED when it carries any deliberate access decision:
  // @Roles, @AnyAuthenticated, @Public, or @OwnerOnly. `unrole` is the
  // undecided remainder — the list RBAC_STRICT would reject, and the list
  // `--check` fails on.
  const unrole = allRoutes.filter(
    (r) => !r.roles && !r.public && !r.owner && !r.anyAuth,
  );
  const publicRoutes = allRoutes.filter((r) => r.public);

  const summary = {
    controllers: controllers.length,
    routes: allRoutes.length,
    routesWithRoles: allRoutes.filter((r) => r.roles && !r.public).length,
    publicRoutes: publicRoutes.length,
    routesOwnerOnly: allRoutes.filter((r) => r.owner && !r.public).length,
    routesAnyAuthenticated: allRoutes.filter(
      (r) => r.anyAuth && !r.roles && !r.public && !r.owner,
    ).length,
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
  const { controllers, allRoutes, unrole, summary } = collectRouteInventory();

  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const format =
    (argv[argv.indexOf("--format") + 1] && argv.includes("--format")
      ? argv[argv.indexOf("--format") + 1]
      : null) ?? "table";

  if (check) {
    if (unrole.length > 0) {
      console.error(
        `RBAC coverage: ${unrole.length} route(s) have no access decision (@Roles / @AnyAuthenticated / @Public / @OwnerOnly):`,
      );
      for (const r of unrole) {
        console.error(`  ${r.method.padEnd(6)} ${r.file}#${r.handler}`);
      }
      process.exit(1);
    }
    console.log(
      `RBAC coverage: all ${summary.routes} routes carry a deliberate access decision.`,
    );
  } else if (format === "json") {
    console.log(JSON.stringify({ summary, controllers }, null, 2));
  } else if (format === "summary") {
    console.log(summary);
  } else {
    console.log("Route".padEnd(66) + "Method  Kind");
    console.log("─".repeat(88));
    for (const r of allRoutes) {
      const kind = r.public
        ? "public"
        : r.owner
          ? "owner"
          : r.roles
            ? "roles"
            : r.anyAuth
              ? "any-auth"
              : "NO DECISION";
      const route = `${r.file.replace(/^src\//, "")}#${r.handler}`;
      console.log(`${route.padEnd(66).slice(0, 66)}${r.method.padEnd(8)}${kind}`);
    }
    console.log("─".repeat(88));
    console.log(summary);
    console.log(
      "\nEvery route needs one deliberate access decision: @Roles(...) (restricted), " +
        "@AnyAuthenticated() (any signed-in role), @Public() (no tenant JWT), or @OwnerOnly() (platform owner).",
    );
    console.log(
      "RBAC_STRICT=true rejects undecided routes at runtime; `node scripts/rbac-inventory.mjs --check` fails CI while any remain.",
    );
  }
}
