#!/usr/bin/env node
/**
 * Build-time bundle leak guard.
 *
 * Fails the production build if the compiled frontend would ship anything that
 * helps a cloner or leaks server secrets:
 *   1. Source maps (.map) — would expose readable source.
 *   2. Backend secret patterns accidentally inlined into client JS.
 *
 * Note: VITE_* values are *intentionally* public (baked into the client), so we
 * only look for the kinds of secrets that must never leave the server.
 *
 * Usage:  node scripts/check-bundle-leak.mjs [distDir]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const distDir = process.argv[2] || 'dist';

/** Recursively collect files under a directory. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(distDir);
} catch (e) {
  console.error(`[bundle-guard] cannot read ${distDir}: ${e.message}`);
  process.exit(1);
}

const failures = [];

// 1) No source maps in the shipped bundle.
const maps = files.filter((f) => f.endsWith('.map'));
if (maps.length) {
  failures.push(`source maps present (${maps.length}): ${maps.map((m) => m.replace(distDir + '/', '')).join(', ')}`);
}

// 2) Scan text assets for server-only secret shapes.
const SECRET_PATTERNS = [
  { name: 'Stripe/Paystack live secret', re: /sk_live_[0-9a-zA-Z]{10,}/ },
  { name: 'Paystack secret key', re: /sk_test_[0-9a-zA-Z]{10,}/ },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: 'Groq API key', re: /gsk_[0-9a-zA-Z]{20,}/ },
  { name: 'Generic bearer secret assignment', re: /(GROQ_API_KEY|PAYSTACK_SECRET|JWT_SECRET|DATABASE_URL|R2_SECRET)\s*[:=]\s*['"][^'"]{8,}/ },
];

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.txt', '.map']);
for (const f of files) {
  if (!TEXT_EXT.has(extname(f))) continue;
  let content;
  try {
    content = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(content)) {
      failures.push(`${name} found in ${f.replace(distDir + '/', '')}`);
    }
  }
}

if (failures.length) {
  console.error('\n[bundle-guard] ❌ Refusing to ship — potential leak detected:');
  for (const f of failures) console.error('  • ' + f);
  console.error('');
  process.exit(1);
}

console.log(`[bundle-guard] ✅ ${files.length} files scanned — no source maps and no server secrets in the bundle.`);
