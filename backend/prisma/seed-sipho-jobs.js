'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('FlowOps — Seed Jobs for Sipho Dlamini');
  console.log('--------------------------------------------------');

  // ── Find Sipho ────────────────────────────────────────────────────────────
  const company = await prisma.company.findFirst({
    where: { name: 'FlowOps Demo Couriers' },
  });
  if (!company) { console.log('Run seed-demo-company.js first'); return; }
  const cid = company.id;

  const sipho = await prisma.driver.findFirst({
    where: { companyId: cid, name: { contains: 'Sipho' } },
  });
  if (!sipho) { console.log('Sipho not found — run seed-full-data.js first'); return; }
  console.log(`Driver: ${sipho.name}  (${sipho.id})`);

  // ── 1. Mark Sipho ON_ROUTE ─────────────────────────────────────────────────
  await prisma.driver.update({
    where: { id: sipho.id },
    data: { status: 'ON_ROUTE', lastLat: -25.8553, lastLng: 28.1882, lastSeen: new Date() },
  });
  console.log('✓ Driver status → ON_ROUTE');

  // ── 2. Assign two PENDING collections to Sipho ────────────────────────────
  const pendingCols = await prisma.collection.findMany({
    where: { companyId: cid, status: 'PENDING', driverId: null },
    take: 2,
  });
  for (const col of pendingCols) {
    await prisma.collection.update({
      where: { id: col.id },
      data: { driverId: sipho.id, status: 'ASSIGNED' },
    });
    console.log(`✓ Collection assigned: ${col.clientName ?? col.id}`);
  }

  // ── 3. Create a fresh collection if none were available ───────────────────
  if (pendingCols.length === 0) {
    const fresh = await prisma.collection.create({
      data: {
        companyId: cid,
        driverId: sipho.id,
        status: 'ASSIGNED',
        clientName: 'Cape Town Cargo Co.',
        clientPhone: '+27 21 555 0100',
        pickupAddress: '1 Heerengracht, Cape Town City Centre',
        pickupLat: -33.9221,
        pickupLng: 18.4231,
        notes: 'Fragile electronics — handle with care',
        scheduledAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    console.log(`✓ Created new collection: ${fresh.clientName}`);
  }

  // ── 4. Create active delivery shipments for Sipho ─────────────────────────
  // Use existing waybills that are IN_TRANSIT / OUT_FOR_DELIVERY (or COLLECTED)
  const deliveryWbs = await prisma.waybill.findMany({
    where: {
      companyId: cid,
      status: { in: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'COLLECTED'] },
    },
    take: 3,
  });

  let shipmentsCreated = 0;
  for (const wb of deliveryWbs) {
    // Upsert the shipment — update if exists, create if not
    const existing = await prisma.shipment.findFirst({ where: { waybillId: wb.id } });
    if (existing) {
      await prisma.shipment.update({
        where: { id: existing.id },
        data: { driverId: sipho.id, status: 'IN_TRANSIT',
          currentLat: sipho.lastLat, currentLng: sipho.lastLng },
      });
    } else {
      await prisma.shipment.create({
        data: {
          companyId: cid, waybillId: wb.id, driverId: sipho.id,
          status: 'IN_TRANSIT',
          currentLat: sipho.lastLat, currentLng: sipho.lastLng,
        },
      });
    }
    shipmentsCreated++;
    console.log(`✓ Shipment for waybill ${wb.trackingNumber} → Sipho`);
  }

  // If no waybills were in the right state, create a fresh one
  if (shipmentsCreated === 0) {
    const wb = await prisma.waybill.create({
      data: {
        companyId: cid,
        trackingNumber: 'FO-DEMO-01',
        status: 'OUT_FOR_DELIVERY',
        senderName: 'FlowOps Warehouse',
        senderPhone: '+27 11 000 0001',
        senderAddress: 'JHB Warehouse, Johannesburg',
        recipientName: 'Demo Customer',
        recipientPhone: '+27 83 000 0001',
        recipientAddress: '5 Nelson Mandela Square, Sandton',
        recipientLat: -26.1070, recipientLng: 28.0567,
        weight: 2.5, totalAmount: 450,
      },
    });
    await prisma.shipment.create({
      data: {
        companyId: cid, waybillId: wb.id, driverId: sipho.id,
        status: 'IN_TRANSIT',
        currentLat: sipho.lastLat, currentLng: sipho.lastLng,
      },
    });
    console.log(`✓ Created demo waybill + shipment for Sipho`);
  }

  // ── 5. Update Sipho's location to something realistic (Johannesburg) ───────
  await prisma.driver.update({
    where: { id: sipho.id },
    data: { lastLat: -26.0865, lastLng: 28.0562, lastSeen: new Date() },
  });

  console.log('\n====================================');
  console.log('  Done! Refresh the driver portal.');
  console.log('  http://localhost:4001');
  console.log('====================================\n');
  console.log('  Sipho now has:');
  console.log(`  • ${Math.min(pendingCols.length, 2) || 1} collection pickup(s)`);
  console.log(`  • ${shipmentsCreated || 1} active delivery/deliveries`);
  console.log('  • Status: ON_ROUTE\n');
}

main()
  .catch(e => { console.error('FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
