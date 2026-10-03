/**
 * Rail reference-data seeder (operator script).
 *
 * Loads the platform-wide corridor / yard / Annexure 20b cancellation-code reference rows from the
 * typed catalogs that ship in the compiled app (dist/rail/catalog). It is idempotent, never downgrades
 * a VERIFIED row, never revives a deactivated cancellation code, and refuses to write anything if a
 * catalog entry fails validation.
 *
 *   node prisma/seed-rail-reference.js --plan     read-only: what WOULD be created / updated
 *   node prisma/seed-rail-reference.js --apply    performs the writes
 *
 * Run inside the API container (it needs only DATABASE_URL, which the container already has).
 * It prints counts only — never the connection string. Part of the gated deployment checklist:
 * docs/RAIL-RASA-DEPLOYMENT-CHECKLIST-2026-10-02.md.
 */
'use strict';
const path = require('path');

const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--plan') ? 'plan' : null;
if (!mode) {
  console.error('Usage: node prisma/seed-rail-reference.js --plan | --apply');
  process.exit(2);
}

const { PrismaClient } = require('@prisma/client');
const { seedRailReference } = require(path.join(__dirname, '..', 'dist', 'rail', 'catalog', 'seed-rail-reference'));

(async () => {
  const prisma = new PrismaClient();
  try {
    const summary = await seedRailReference(prisma, { dryRun: mode === 'plan' });
    console.log(mode === 'plan' ? 'PLAN (nothing written):' : 'APPLIED:');
    for (const t of summary.tables) {
      console.log(`  ${t.table}: catalog ${t.catalogRows} | create ${t.created} | update ${t.updated} | unchanged ${t.unchanged} | skipped (already VERIFIED) ${t.skippedVerified}`);
      for (const note of t.notes || []) console.log(`    ! ${note}`);
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((err) => {
  console.error('Seeding failed:', err && err.message ? err.message : err);
  process.exit(1);
});
