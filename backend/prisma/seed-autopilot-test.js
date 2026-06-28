/**
 * FlowOps — CLAW Autopilot test seed.
 *
 * Creates deterministic, triggering conditions so you can SEE Autopilot detect
 * AND auto-act, then verify the result. Idempotent: re-running cleans up its own
 * previous test rows first (everything it makes is tagged AUTOPILOT-TEST).
 *
 * What it sets up on the demo tenant:
 *   1. Enterprise plan + Autopilot ENABLED + aggression HIGH (so it auto-executes)
 *   2. One AVAILABLE driver  ("Autopilot Test Driver")
 *   3. UNASSIGNED_COLLECTION — an overdue pickup with no driver  → AUTO-ASSIGNED
 *   4. SLA_BREACH           — a shipment open well past the SLA   → escalation
 *   5. COD_MISMATCH         — a delivered waybill, COD uncollected → escalation
 *
 * Run (inside the api container on the VPS, or backend dir on the dev box):
 *   node prisma/seed-autopilot-test.js
 *
 * Then: log in as admin@demo.flowops.local, open AI ▸ CLAW Autopilot, hit
 * "Scan now". Expect 3 signals, all auto-executed; the pickup now shows a
 * driver; the activity log shows three AUTOPILOT_* entries.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TAG = 'AUTOPILOT-TEST';
const minsAgo = (m) => new Date(Date.now() - m * 60_000);

async function main() {
  // ── 1. Find the demo company (fallback: first active company) ──────────────
  let company =
    (await prisma.company.findFirst({ where: { name: 'FlowOps Demo Couriers' } })) ||
    (await prisma.company.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }));
  if (!company) throw new Error('No company found — run the demo seed first.');
  console.log(`→ Target company: ${company.name} (${company.id})`);

  // ── 2. Make sure Autopilot can run + will auto-execute ─────────────────────
  await prisma.company.update({
    where: { id: company.id },
    data: { plan: 'enterprise', autopilotEnabled: true, autopilotAggression: 'HIGH' },
  });
  console.log('✓ Company set to enterprise + Autopilot ENABLED + aggression HIGH');

  // ── 3. Ensure an AVAILABLE active driver to assign to ──────────────────────
  let driver = await prisma.driver.findFirst({
    where: { companyId: company.id, name: `${TAG} Driver` },
  });
  if (!driver) {
    driver = await prisma.driver.create({
      data: {
        companyId: company.id,
        name: `${TAG} Driver`,
        phone: '+27710000999',
        vehicleType: 'motorbike',
        status: 'AVAILABLE',
        isActive: true,
      },
    });
  } else {
    await prisma.driver.update({ where: { id: driver.id }, data: { status: 'AVAILABLE', isActive: true } });
  }
  console.log(`✓ Available driver ready: ${driver.name}`);

  // ── 4. Clean up any previous test rows (idempotent re-runs) ────────────────
  await prisma.collection.deleteMany({ where: { companyId: company.id, clientName: { startsWith: TAG } } });
  // shipments reference waybills (FK) — delete shipments before their waybills
  const oldWaybills = await prisma.waybill.findMany({
    where: { companyId: company.id, trackingNumber: { startsWith: TAG } },
    select: { id: true },
  });
  if (oldWaybills.length) {
    await prisma.shipment.deleteMany({ where: { waybillId: { in: oldWaybills.map((w) => w.id) } } });
    await prisma.waybill.deleteMany({ where: { id: { in: oldWaybills.map((w) => w.id) } } });
  }
  console.log('✓ Cleared previous test rows');

  // ── 5. UNASSIGNED_COLLECTION — overdue pickup, no driver (auto-assignable) ──
  const pickup = await prisma.collection.create({
    data: {
      companyId: company.id,
      clientName: `${TAG} Unassigned Pickup`,
      clientPhone: '+27710000111',
      pickupAddress: '12 Test Road, Sandton, Johannesburg',
      status: 'PENDING',
      driverId: null,
      scheduledAt: minsAgo(120), // 2h overdue → confidence 0.92, fires immediately
      createdAt: minsAgo(120),
    },
  });
  console.log(`✓ Created overdue unassigned pickup (${pickup.id.slice(-8)})`);

  // ── 6. SLA_BREACH — shipment open far past the breach threshold ────────────
  try {
    const slaWaybill = await prisma.waybill.create({
      data: {
        companyId: company.id,
        trackingNumber: `${TAG}-SLA-${Date.now()}`,
        senderName: 'Test Sender', senderPhone: '+27710000222', senderAddress: '1 Origin St, JHB',
        recipientName: 'Test Recipient', recipientPhone: '+27710000333', recipientAddress: '99 Dest Ave, PTA',
        status: 'PENDING',
      },
    });
    await prisma.shipment.create({
      data: {
        companyId: company.id,
        waybillId: slaWaybill.id,
        status: 'PENDING',
        createdAt: minsAgo(180), // 3h open — well past the 60-min default breach
        updatedAt: minsAgo(180),
      },
    });
    console.log('✓ Created SLA-breached shipment');
  } catch (e) {
    console.log(`! Skipped SLA shipment (${e.message})`);
  }

  // ── 7. COD_MISMATCH — delivered waybill with uncollected COD ───────────────
  try {
    await prisma.waybill.create({
      data: {
        companyId: company.id,
        trackingNumber: `${TAG}-COD-${Date.now()}`,
        senderName: 'Test Sender', senderPhone: '+27710000444', senderAddress: '2 Origin St, JHB',
        recipientName: 'COD Recipient', recipientPhone: '+27710000555', recipientAddress: '50 Cash Rd, CPT',
        status: 'DELIVERED',
        codAmount: 250,
        codCollected: false,
      },
    });
    console.log('✓ Created delivered waybill with uncollected COD');
  } catch (e) {
    console.log(`! Skipped COD waybill (${e.message})`);
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('CLAW Autopilot test data seeded. Now:');
  console.log('  1. Log in as admin@demo.flowops.local (Demo@Admin123!)');
  console.log('  2. AI ▸ CLAW Autopilot — it should show ENABLED, aggression HIGH');
  console.log('  3. Hit "Scan now"');
  console.log('Expect: ~3 signals, all auto-executed. The pickup is now assigned');
  console.log(`to "${TAG} Driver", and the activity log shows AUTOPILOT_* entries.`);
  console.log('──────────────────────────────────────────────');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
