/**
 * Tenant manual coverage — the anti-rot ratchet.
 *
 * docs/TENANT_USER_MANUAL.md is the only customer-facing documentation in the
 * repo. It went stale the usual way: features shipped, nobody updated it, and
 * nothing failed. This makes the omission loud.
 *
 * It answers the question a reviewer can never answer by reading: does the
 * manual describe what the product actually does?
 *
 * Three guarantees:
 *
 *  1. NO ROT   — a surface documented today is documented tomorrow.
 *  2. RATCHET  — the count of undocumented surfaces can fall, never rise.
 *  3. REQUIRED — surfaces that have shipped and that a tenant can reach must
 *                be documented. This is the one that fails the build when
 *                something new lands without a write-up.
 *
 * Coverage is judged on HEADINGS, not body text. A pricing matrix that happens
 * to print the words "Freight Forwarding" is not documentation, and matching
 * body text would have counted it as such — that false positive is why this
 * test reads headings only.
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';

const REPO = join(import.meta.dirname, '..', '..');
const MANUAL = join(REPO, 'docs', 'TENANT_USER_MANUAL.md');
const APP = join(REPO, 'frontend', 'src', 'App.tsx');
const BASELINE = join(import.meta.dirname, 'manual-coverage-baseline.json');

/**
 * Tenant-facing product surfaces.
 *
 * `routes`   — path prefixes that must exist in App.tsx. Exact paths, not the
 *              first segment: /forwarding/general-average is not the same
 *              surface as /forwarding.
 * `headings` — patterns matched against the manual's section headings. A
 *              surface is documented when it has a section of its own.
 */
const SURFACES = [
  // ── Documented today ──────────────────────────────────────────────────
  { id: 'waybills',        routes: ['/waybills'],                  headings: [/waybill/i] },
  { id: 'collections',     routes: ['/collections'],               headings: [/collection/i] },
  { id: 'dispatch',        routes: ['/dispatch'],                  headings: [/dispatch/i] },
  { id: 'manifests',       routes: ['/manifests'],                 headings: [/manifest/i] },
  { id: 'pod-deliveries',  routes: ['/pod-deliveries'],            headings: [/proof of delivery|\bpod\b/i] },
  { id: 'returns',         routes: ['/returns'],                   headings: [/return/i] },
  { id: 'clients',         routes: ['/clients'],                   headings: [/client/i] },
  { id: 'quotes',          routes: ['/quotes'],                    headings: [/quote/i] },
  { id: 'rate-cards',      routes: ['/rate-cards'],                headings: [/rate card/i] },
  { id: 'invoices',        routes: ['/invoices'],                  headings: [/invoic/i] },
  { id: 'cod',             routes: ['/cod'],                       headings: [/\bcod\b|cash on delivery/i] },
  { id: 'accounting',      routes: ['/accounting'],                headings: [/accounting/i] },
  { id: 'communications',  routes: ['/communications'],            headings: [/communicat|email|whatsapp/i] },
  { id: 'route-optimizer', routes: ['/route-optimizer'],           headings: [/route optimi/i] },
  { id: 'maintenance',     routes: ['/maintenance'],               headings: [/maintenance/i] },
  { id: 'copilot',         routes: ['/ask', '/copilot'],           headings: [/copilot|ask flowops|ai feature/i] },
  { id: 'track',           routes: ['/track'],                     headings: [/portal|track/i] },
  { id: 'settings',        routes: ['/settings'],                  headings: [/setting/i] },

  // ── Shipped and reachable, with no section at all ─────────────────────
  // The forwarding / maritime / trade-compliance product. This is the reason
  // the test exists.
  { id: 'forwarding',      routes: ['/forwarding'],                headings: [/forwarding|shipment file|bill of lading/i] },
  { id: 'general-average', routes: ['/forwarding/general-average'],headings: [/general average/i] },
  { id: 'landed-cost',     routes: ['/tools/landed-cost'],         headings: [/landed cost/i] },
  { id: 'hs-code',         routes: ['/tools/hs-codes'],            headings: [/hs code|tariff/i] },
  { id: 'disbursements',   routes: ['/disbursements'],             headings: [/disbursement/i] },
  { id: 'claims',          routes: ['/claims'],                    headings: [/claim/i] },
  { id: 'warehouse',       routes: ['/warehouse'],                 headings: [/warehouse/i] },
  { id: 'carriers',        routes: ['/carriers'],                  headings: [/carrier/i] },
  { id: 'delivery-notes',  routes: ['/delivery-notes'],            headings: [/delivery note/i] },
  { id: 'esg',             routes: ['/esg'],                       headings: [/\besg\b|carbon/i] },
  { id: 'digital-payments',routes: ['/digital-payments'],          headings: [/digital payment|proof of payment/i] },
  { id: 'credit-control',  routes: ['/credit-control'],            headings: [/credit control/i] },
];

/**
 * Surfaces that MUST be documented: shipped, tenant-reachable, and paid for.
 * Shipping without a write-up is exactly what made the manual stale.
 *
 * This list grows only when the corresponding section is written.
 */
const REQUIRED = [
  'waybills', 'collections', 'dispatch', 'manifests', 'pod-deliveries',
  'returns', 'clients', 'quotes', 'invoices', 'cod', 'accounting',
  'forwarding', 'general-average', 'landed-cost', 'hs-code',
  // Written 2026-11-10. These eight were shipped, routed and tenant-reachable
  // with no section at all -- the manual had gone stale the usual way. They are
  // listed here so that deleting a section fails the build, which is what NO
  // ROT means. Undocumented-total is now 0.
  'disbursements', 'claims', 'warehouse', 'carriers', 'delivery-notes',
  'esg', 'digital-payments', 'credit-control',
];

function appRoutes() {
  const src = readFileSync(APP, 'utf8');
  return [...src.matchAll(/path="\/([^"]*)"/g)].map((m) => `/${m[1]}`);
}

function manualHeadings() {
  return readFileSync(MANUAL, 'utf8')
    .split('\n')
    .filter((l) => /^#{2,4}\s+/.test(l))
    .map((l) => l.replace(/^#+\s+/, '').trim());
}

function coverage() {
  const routes = appRoutes();
  const headings = manualHeadings();
  const documented = [];
  const undocumented = [];
  const missingRoute = [];

  for (const s of SURFACES) {
    const hasRoute = s.routes.some((r) => routes.some((ar) => ar === r || ar.startsWith(`${r}/`)));
    if (!hasRoute) missingRoute.push(s.id);
    const hasSection = headings.some((h) => s.headings.some((re) => re.test(h)));
    (hasSection ? documented : undocumented).push(s.id);
  }
  return { documented, undocumented, missingRoute };
}

test('the manual exists and is substantial', () => {
  assert.ok(existsSync(MANUAL), 'docs/TENANT_USER_MANUAL.md is missing');
  const text = readFileSync(MANUAL, 'utf8');
  assert.ok(text.length > 10_000, `manual is only ${text.length} chars — that is not a manual`);
  assert.ok(manualHeadings().length >= 15, 'manual has too few sections to be a manual');
});

test('every tracked surface still has a route in App.tsx', () => {
  const { missingRoute } = coverage();
  assert.deepEqual(
    missingRoute,
    [],
    `SURFACES lists surfaces with no matching route in App.tsx: ${missingRoute.join(', ')}. ` +
      'Update `routes` or remove the surface.',
  );
});

test('NO ROT — every surface documented today is still documented', () => {
  assert.ok(
    existsSync(BASELINE),
    `missing scripts/manual-coverage-baseline.json. ` +
      'Re-record it only after coverage genuinely improved, and say how in the commit.',
  );
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { documented } = coverage();
  const lost = (baseline.documented ?? []).filter((a) => !documented.includes(a));
  assert.deepEqual(
    lost,
    [],
    `sections disappeared from the manual: ${lost.join(', ')}. ` +
      'If a feature was removed, remove it from SURFACES and say so in the commit.',
  );
});

test('RATCHET — undocumented surfaces never increase', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { undocumented } = coverage();
  assert.ok(
    undocumented.length <= baseline.undocumentedTotal,
    `undocumented surfaces rose from ${baseline.undocumentedTotal} to ${undocumented.length}. ` +
      `Undocumented now: ${undocumented.join(', ')}`,
  );
});

test('REQUIRED — shipped, tenant-reachable surfaces are documented', () => {
  const { documented } = coverage();
  const missing = REQUIRED.filter((a) => !documented.includes(a));
  assert.deepEqual(
    missing,
    [],
    `these shipped surfaces have no section in the manual: ${missing.join(', ')}\n` +
      'Write the section, or remove the surface from REQUIRED if it is not tenant-facing.',
  );
});

/**
 * Re-record the baseline: `node scripts/manual-coverage.test.mjs --update-baseline`
 *
 * Only run this after coverage genuinely IMPROVED. The file records the state
 * to hold the line at; recording a worse state would let rot through quietly.
 */
if (process.argv.includes('--update-baseline')) {
  const { documented, undocumented } = coverage();
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _why:
          'Which tenant-facing surfaces the manual documents, and how many it ' +
          'does not. NO ROT requires every id listed here to stay documented; ' +
          'RATCHET requires undocumentedTotal never to rise. Re-record only ' +
          'after coverage improved, and say how in the commit.',
        recorded: new Date().toISOString().slice(0, 10),
        documented,
        undocumentedTotal: undocumented.length,
        undocumented,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `baseline re-recorded: ${documented.length} documented, ${undocumented.length} undocumented`,
  );
}
