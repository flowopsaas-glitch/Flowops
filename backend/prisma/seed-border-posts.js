/**
 * WP3 Stage 0 seed: border posts + measurement geofences.
 *
 * Seeds border post reference data from the STATIC_REFERENCE table in
 * backend/src/forwarding/sadc-corridor.service.ts, and border geofences
 * from backend/src/driver-safety/safety-zones-data.ts (candidate references
 * only — provenance 'SEED', not validated dwell boundaries).
 *
 * Usage:  prisma db seed --seed prisma/seed-border-posts.js
 *         (requires `seed` configured in package.json prisma section)
 *
 * Each post is created for every tenant company that exists, because border
 * post reference data is tenant-scoped (companyId). Geofences inherit the
 * post's companyId.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── From sadc-corridor.service.ts (STATIC_REFERENCE) ─────────────────────
// Crossing → reference average wait hours and congestion band.
// These are reference figures compiled from operator handbooks, not measured.
const BORDER_POSTS = [
  {
    code: 'BEIT_BRIDGE',
    name: 'Beitbridge Border Post',
    countries: 'ZA,ZW',
    lat: -22.2167,
    lng: 29.9833,
    is24Hour: true,
    referenceAvgWaitHours: 6.0,
    referenceCongestion: 'high',
  },
  {
    code: 'CHIRUNDU',
    name: 'Chirundu Border Post',
    countries: 'ZM,ZW',
    lat: -15.7333,
    lng: 28.8500,
    is24Hour: false,
    referenceAvgWaitHours: 4.0,
    referenceCongestion: 'medium',
  },
  {
    code: 'KAZUNGULA',
    name: 'Kazungula Border Post',
    countries: 'BW,ZM',
    lat: -17.7900,
    lng: 25.2700,
    is24Hour: true,
    referenceAvgWaitHours: 3.0,
    referenceCongestion: 'medium',
  },
  {
    code: 'RESSANO_GARCIA',
    name: 'Ressano Garcia Border Post',
    countries: 'ZA,MZ',
    lat: -25.4167,
    lng: 31.9833,
    is24Hour: true,
    referenceAvgWaitHours: 2.0,
    referenceCongestion: 'low',
  },
  {
    code: 'PLUMTREE',
    name: 'Plumtree Border Post',
    countries: 'BW,ZW',
    lat: -20.4833,
    lng: 27.8167,
    is24Hour: false,
    referenceAvgWaitHours: 3.5,
    referenceCongestion: 'low',
  },
  {
    code: 'LEBOMBO',
    name: 'Lebombo Border Post',
    countries: 'SZ,ZA',
    lat: -25.9667,
    lng: 31.8167,
    is24Hour: true,
    referenceAvgWaitHours: 2.5,
    referenceCongestion: 'low',
  },
  {
    code: 'NAMAKAN',
    name: 'Namakan Border Post',
    countries: 'ZA,BW',
    lat: -22.0333,
    lng: 20.3500,
    is24Hour: false,
    referenceAvgWaitHours: 2.0,
    referenceCongestion: 'low',
  },
  {
    code: 'MACHIPANDA',
    name: 'Machipanda Border Post',
    countries: 'MZ,ZW',
    lat: -18.8500,
    lng: 32.8333,
    is24Hour: false,
    referenceAvgWaitHours: 3.0,
    referenceCongestion: 'low',
  },
  {
    code: 'GROBLERSBRUG',
    name: 'Groblersbrug Border Post',
    countries: 'ZA,BW',
    lat: -24.2500,
    lng: 29.7667,
    is24Hour: false,
    referenceAvgWaitHours: 2.0,
    referenceCongestion: 'low',
  },
  {
    code: 'MARTINS_DRIFT',
    name: 'Martins Drift Border Post',
    countries: 'ZA,BW',
    lat: -22.6500,
    lng: 27.3833,
    is24Hour: false,
    referenceAvgWaitHours: 1.5,
    referenceCongestion: 'low',
  },
];

// ── From safety-zones-data.ts (COMMUNITY-sourced safety zones) ────────────
// Geofences are candidate references only — NOT validated dwell boundaries.
// Provenance 'SEED' until an operator reviews them.
const GEOFENCES_BY_POST_CODE = {
  BEIT_BRIDGE: [
    {
      code: 'BEIT_BRIDGE_ZA',
      name: 'Beitbridge Border (SA side)',
      lat: -22.2167,
      lng: 29.9833,
      radiusM: 3000,
      side: 'EXPORT',
    },
    {
      code: 'BEIT_BRIDGE_ZW',
      name: 'Beitbridge Border (ZW side)',
      lat: -22.2167,
      lng: 29.9900,
      radiusM: 3000,
      side: 'IMPORT',
    },
  ],
  CHIRUNDU: [
    {
      code: 'CHIRUNDU',
      name: 'Chirundu Border',
      lat: -15.7333,
      lng: 28.8500,
      radiusM: 2000,
      side: 'BOTH',
    },
  ],
  KAZUNGULA: [
    {
      code: 'KAZUNGULA',
      name: 'Kazungula Border',
      lat: -17.7900,
      lng: 25.2700,
      radiusM: 2000,
      side: 'BOTH',
    },
  ],
  RESSANO_GARCIA: [
    {
      code: 'RESSANO_GARCIA',
      name: 'Ressano Garcia Border',
      lat: -25.4167,
      lng: 31.9833,
      radiusM: 2000,
      side: 'BOTH',
    },
  ],
  PLUMTREE: [
    {
      code: 'PLUMTREE',
      name: 'Plumtree Border',
      lat: -20.4833,
      lng: 27.8167,
      radiusM: 2000,
      side: 'BOTH',
    },
  ],
  LEBOMBO: [
    {
      code: 'LEBOMBO',
      name: 'Lebombo Border',
      lat: -25.9667,
      lng: 31.8167,
      radiusM: 2000,
      side: 'BOTH',
    },
  ],
};

async function main() {
  const companies = await prisma.company.findMany();
  if (companies.length === 0) {
    console.log('No companies found — nothing to seed (border posts are tenant-scoped).');
    return;
  }

  console.log(`Seeding border posts + geofences for ${companies.length} company(ies)...`);

  let postsCreated = 0;
  let geofencesCreated = 0;
  let postsSkipped = 0;

  for (const company of companies) {
    for (const postData of BORDER_POSTS) {
      const existing = await prisma.borderPost.findFirst({
        where: { companyId: company.id, code: postData.code },
      });
      if (existing) {
        postsSkipped++;
        continue;
      }

      const post = await prisma.borderPost.create({
        data: {
          companyId: company.id,
          ...postData,
          referenceCompiledAsOf: new Date('2026-11-01T00:00:00Z'),
        },
      });
      postsCreated++;

      const geofences = GEOFENCES_BY_POST_CODE[postData.code] ?? [];
      for (const gf of geofences) {
        await prisma.borderGeofence.create({
          data: {
            companyId: company.id,
            postId: post.id,
            ...gf,
            isActive: true,
            provenance: 'SEED',
          },
        });
        geofencesCreated++;
      }
    }
  }

  console.log(
    `Done. Posts created: ${postsCreated}, skipped: ${postsSkipped}, geofences created: ${geofencesCreated}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
