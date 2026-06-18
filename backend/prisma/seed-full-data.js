/**
 * FlowOps — Full Demo Data Seed
 *
 * Creates realistic operational data for the FlowOps Demo Couriers company:
 * branches, drivers, waybills, shipments, collections, invoices, quotes,
 * AI events, and WhatsApp messages — so every dashboard page shows live data.
 *
 * Usage:
 *   cd /opt/Flowops/backend
 *   node prisma/seed-full-data.js
 *
 * Safe to re-run: skips records that already exist (idempotent).
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── SA addresses & coords ──────────────────────────────────────────────────
const SA_LOCS = [
  { city: 'Johannesburg', lat: -26.2041, lng: 28.0473 },
  { city: 'Sandton',      lat: -26.1076, lng: 28.0567 },
  { city: 'Soweto',       lat: -26.2683, lng: 27.8543 },
  { city: 'Pretoria',     lat: -25.7479, lng: 28.2293 },
  { city: 'Cape Town',    lat: -33.9249, lng: 18.4241 },
  { city: 'Durban',       lat: -29.8587, lng: 31.0218 },
  { city: 'Port Elizabeth',lat:-33.9608, lng: 25.6022 },
  { city: 'Bloemfontein', lat: -29.0852, lng: 26.1596 },
];

const STREET_ADDRS = [
  '12 Jan Smuts Ave, Braamfontein',  '8 Sandton Drive, Sandton',
  '45 Long Street, Cape Town',       '77 Victoria Embankment, Durban',
  '3 Church Square, Pretoria',       '22 Rissik Street, Johannesburg',
  '14 Adderley Street, Cape Town',   '99 West Street, Durban',
  '16 Jorissen Street, Braamfontein','31 Oxford Road, Rosebank',
];

const NAMES = [
  'Sipho Dlamini','Thandi Molefe','Kgosi Sithole','Naledi Nkosi',
  'Bongani Zulu','Lerato Mokoena','Tshepo Mahlangu','Zanele Ndlovu',
  'Sbu Shabalala','Mmabatho Letsatsi','Dineo Moagi','Lebo Matlala',
];

function rand(arr)  { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function phone() { return `+27 ${randInt(60,89)} ${randInt(100,999)} ${randInt(1000,9999)}`; }
function email(name) { return name.toLowerCase().replace(' ', '.') + '@demo.flowops.local'; }
function waybillNum(n) { return `FO-${String(n).padStart(5,'0')}`; }

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('FlowOps Full Data Seed');
  console.log('--------------------------------------------------');

  // Find demo company
  const company = await prisma.company.findFirst({ where: { name: 'FlowOps Demo Couriers' } });
  if (!company) {
    console.log('ERROR: Run seed-demo-company.js first!');
    process.exit(1);
  }
  const cid = company.id;
  console.log('Company: ' + company.name + ' (' + cid + ')');

  // ── 1. Branches ──────────────────────────────────────────────────────────
  let jhbBranch = await prisma.branch.findFirst({ where: { companyId: cid, name: 'Johannesburg Hub' } });
  if (!jhbBranch) {
    jhbBranch = await prisma.branch.create({ data: { companyId: cid, name: 'Johannesburg Hub', address: '12 Jan Smuts Ave, Braamfontein, Johannesburg', city: 'Johannesburg', code: 'JHB-001' } });
    console.log('  Created branch: Johannesburg Hub');
  } else { console.log('  Skip branch: Johannesburg Hub'); }

  let ctBranch = await prisma.branch.findFirst({ where: { companyId: cid, name: 'Cape Town Hub' } });
  if (!ctBranch) {
    ctBranch = await prisma.branch.create({ data: { companyId: cid, name: 'Cape Town Hub', address: '45 Long Street, Cape Town', city: 'Cape Town', code: 'CPT-001' } });
    console.log('  Created branch: Cape Town Hub');
  } else { console.log('  Skip branch: Cape Town Hub'); }

  // ── 2. Drivers ───────────────────────────────────────────────────────────
  const driverDefs = [
    { name: 'Sipho Dlamini',    vehicleType: 'motorbike', vehicleReg: 'GP123456', status: 'AVAILABLE', lat: -26.2041, lng: 28.0473 },
    { name: 'Thandi Molefe',    vehicleType: 'car',       vehicleReg: 'WC987654', status: 'ON_ROUTE',   lat: -33.9249, lng: 18.4241 },
    { name: 'Kgosi Sithole',    vehicleType: 'van',       vehicleReg: 'KZN456789', status: 'AVAILABLE', lat: -29.8587, lng: 31.0218 },
    { name: 'Bongani Zulu',     vehicleType: 'truck',     vehicleReg: 'GP741852', status: 'OFFLINE',    lat: -26.1076, lng: 28.0567 },
    { name: 'Lerato Mokoena',   vehicleType: 'motorbike', vehicleReg: 'GP369258', status: 'ON_ROUTE',   lat: -25.7479, lng: 28.2293 },
  ];
  const drivers = [];
  for (const d of driverDefs) {
    const existing = await prisma.driver.findFirst({ where: { companyId: cid, name: d.name } });
    if (existing) { drivers.push(existing); console.log('  Skip driver: ' + d.name); continue; }
    const created = await prisma.driver.create({ data: { companyId: cid, ...d, phone: phone(), email: email(d.name), lastSeen: new Date(), lastLat: d.lat, lastLng: d.lng } });
    drivers.push(created);
    console.log('  Created driver: ' + d.name);
  }

  // ── 3. Waybills ──────────────────────────────────────────────────────────
  const waybillStatuses = ['PENDING','PENDING','PENDING','COLLECTED','IN_TRANSIT','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','DELIVERED','FAILED_DELIVERY'];
  const wbCount = await prisma.waybill.count({ where: { companyId: cid } });
  const waybills = [];
  if (wbCount === 0) {
    for (let i = 0; i < 10; i++) {
      const senderLoc = rand(SA_LOCS);
      const recpLoc   = rand(SA_LOCS);
      const status    = waybillStatuses[i];
      const createdAt = daysAgo(randInt(1, 30));
      const wb = await prisma.waybill.create({ data: {
        companyId: cid,
        trackingNumber: waybillNum(wbCount + i + 1),
        status,
        senderName:    rand(NAMES),
        senderPhone:   phone(),
        senderAddress: rand(STREET_ADDRS),
        senderLat:     senderLoc.lat,
        senderLng:     senderLoc.lng,
        recipientName:    rand(NAMES),
        recipientPhone:   phone(),
        recipientEmail:   email(rand(NAMES)),
        recipientAddress: rand(STREET_ADDRS),
        recipientLat:  recpLoc.lat,
        recipientLng:  recpLoc.lng,
        weight:        parseFloat((Math.random() * 10 + 0.5).toFixed(2)),
        description:   rand(['Electronics', 'Documents', 'Clothing', 'Food', 'Medicine', 'Auto Parts']),
        totalAmount:   parseFloat((Math.random() * 2000 + 200).toFixed(2)),
        codAmount:     i % 3 === 0 ? parseFloat((Math.random() * 500 + 100).toFixed(2)) : null,
        serviceLevel:  rand(['STANDARD', 'EXPRESS', 'OVERNIGHT']),
        podDeliveredAt: status === 'DELIVERED' ? daysAgo(randInt(1, 5)) : null,
        estimatedDelivery: daysFromNow(randInt(1, 3)),
        createdAt,
        updatedAt: new Date(),
      }});
      waybills.push(wb);
      console.log('  Created waybill: ' + wb.trackingNumber + ' [' + status + ']');
    }
  } else {
    const existing = await prisma.waybill.findMany({ where: { companyId: cid }, take: 10 });
    waybills.push(...existing);
    console.log('  Skip waybills (' + wbCount + ' exist)');
  }

  // ── 4. Shipments ─────────────────────────────────────────────────────────
  const inTransitWbs = waybills.filter(w => ['IN_TRANSIT','OUT_FOR_DELIVERY'].includes(w.status));
  for (const wb of inTransitWbs.slice(0, 3)) {
    const existing = await prisma.shipment.findFirst({ where: { waybillId: wb.id } });
    if (existing) { console.log('  Skip shipment for ' + wb.trackingNumber); continue; }
    const driver = rand(drivers.filter(d => d.status !== 'OFFLINE'));
    const driverLoc = { lat: driver.lastLat || -26.2041, lng: driver.lastLng || 28.0473 };
    await prisma.shipment.create({ data: {
      companyId:        cid,
      waybillId:        wb.id,
      driverId:         driver.id,
      status:           wb.status === 'OUT_FOR_DELIVERY' ? 'IN_TRANSIT' : 'IN_TRANSIT',
      currentLat:       driverLoc.lat + (Math.random() * 0.05 - 0.025),
      currentLng:       driverLoc.lng + (Math.random() * 0.05 - 0.025),
      estimatedDelivery: daysFromNow(1),
      createdAt:        new Date(),
      updatedAt:        new Date(),
    }});
    console.log('  Created shipment for ' + wb.trackingNumber);
  }

  // ── 5. Collections ────────────────────────────────────────────────────────
  const colCount = await prisma.collection.count({ where: { companyId: cid } });
  if (colCount === 0) {
    const colStatuses = ['PENDING','PENDING','IN_PROGRESS','IN_PROGRESS','COMPLETED'];
    for (let i = 0; i < 5; i++) {
      const loc = rand(SA_LOCS);
      const driver = i < 2 ? null : rand(drivers.filter(d => d.status !== 'OFFLINE'));
      await prisma.collection.create({ data: {
        companyId:    cid,
        status:       colStatuses[i],
        clientName:   rand(NAMES),
        clientPhone:  phone(),
        clientEmail:  email(rand(NAMES)),
        pickupAddress: rand(STREET_ADDRS),
        pickupLat:    loc.lat,
        pickupLng:    loc.lng,
        notes:        rand(['Fragile items', 'Heavy package', 'Multiple parcels', 'Same-day delivery', null]),
        scheduledAt:  daysFromNow(randInt(0, 3)),
        driverId:     driver?.id ?? null,
        createdAt:    daysAgo(randInt(0, 7)),
        updatedAt:    new Date(),
      }});
      console.log('  Created collection #' + (i + 1) + ' [' + colStatuses[i] + ']');
    }
  } else {
    console.log('  Skip collections (' + colCount + ' exist)');
  }

  // ── 6. Invoices ───────────────────────────────────────────────────────────
  const invCount = await prisma.invoice.count({ where: { companyId: cid } });
  if (invCount === 0) {
    const invDefs = [
      { clientName: 'Acme Logistics Pty Ltd',   clientEmail: 'billing@acme.co.za',    total: 2500,  tax: 326.09, subtotal: 2173.91, status: 'SENT',     dueDate: daysFromNow(14)  },
      { clientName: 'BlueSky Couriers',          clientEmail: 'accounts@bluesky.co.za', total: 1800,  tax: 234.78, subtotal: 1565.22, status: 'PAID',     paidAt: daysAgo(3)        },
      { clientName: 'SA Express Freight',        clientEmail: 'finance@saexpress.co.za',total: 3200,  tax: 417.39, subtotal: 2782.61, status: 'OVERDUE',  dueDate: daysAgo(5)       },
      { clientName: 'Cape Cargo Ltd',            clientEmail: 'payments@capecargo.co.za',total: 950,  tax: 123.91, subtotal: 826.09,  status: 'DRAFT',    dueDate: daysFromNow(30)  },
    ];
    for (let i = 0; i < invDefs.length; i++) {
      const def = invDefs[i];
      await prisma.invoice.create({ data: {
        companyId: cid,
        invoiceNumber: 'INV-' + new Date().getFullYear() + '-' + String(i + 1).padStart(4, '0'),
        ...def,
        sentAt: def.status !== 'DRAFT' ? daysAgo(randInt(5, 15)) : null,
        notes: 'Net 30 payment terms. EFT preferred.',
        createdAt: daysAgo(randInt(5, 20)),
        updatedAt: new Date(),
        items: { create: [
          { description: 'Courier Services - ' + rand(['Johannesburg', 'Cape Town', 'Durban']) + ' Zone', quantity: randInt(3, 15), unitPrice: parseFloat((def.subtotal / randInt(3,8)).toFixed(2)), total: def.subtotal },
        ]},
      }});
      console.log('  Created invoice: ' + def.clientName + ' [' + def.status + ']');
    }
  } else {
    console.log('  Skip invoices (' + invCount + ' exist)');
  }

  // ── 7. Quotes ─────────────────────────────────────────────────────────────
  const qCount = await prisma.quote.count({ where: { companyId: cid } });
  if (qCount === 0) {
    const quoteDefs = [
      { fromAddress: '22 Rissik St, Johannesburg', toAddress: '45 Long St, Cape Town',   weight: 5.5,  accepted: true  },
      { fromAddress: '3 Church Square, Pretoria',  toAddress: '77 Victoria Embankment, Durban', weight: 2.2,  accepted: false },
      { fromAddress: '8 Sandton Drive, Sandton',   toAddress: '12 Jan Smuts Ave, Johannesburg', weight: 8.0, accepted: false },
    ];
    for (const q of quoteDefs) {
      const price = 80 + 15 * q.weight;
      const expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + (q.accepted ? -12 : 48));
      await prisma.quote.create({ data: {
        companyId: cid, ...q, price,
        breakdown: { base: 80, perKg: 15 * q.weight, total: price },
        expiresAt,
        createdAt: daysAgo(randInt(0, 5)),
      }});
      console.log('  Created quote: ' + q.fromAddress.split(',')[0] + ' → ' + q.toAddress.split(',')[0] + ' [' + (q.accepted ? 'ACCEPTED' : 'PENDING') + ']');
    }
  } else {
    console.log('  Skip quotes (' + qCount + ' exist)');
  }

  // ── 8. AI Events ──────────────────────────────────────────────────────────
  const aiCount = await prisma.aiEvent.count({ where: { companyId: cid } });
  if (aiCount === 0) {
    const events = [
      { type: 'ROUTE_DEVIATION',    title: 'Route Deviation Detected',      body: 'Driver Sipho Dlamini deviated from assigned route by 12km near N1 highway. Potential delay of 45 minutes.', severity: 'critical', resolved: false },
      { type: 'SLA_BREACH_RISK',    title: 'SLA Breach Risk: FO-00003',     body: 'Waybill FO-00003 has been in transit for 26 hours and is at risk of breaching the 30-hour SLA commitment. Immediate action required.', severity: 'warning', resolved: false },
      { type: 'PAYMENT_RISK',       title: 'Invoice Overdue: SA Express Freight', body: 'Invoice INV-2026-0003 for R3,200 is 5 days overdue. Client has not responded to automated reminders. Escalate to collections.', severity: 'critical', resolved: false },
      { type: 'CAPACITY_ALERT',     title: 'Driver Capacity Warning',       body: 'Driver Kgosi Sithole has 8 active collections assigned. Recommend redistributing 2-3 jobs to prevent overload.', severity: 'warning', resolved: false },
      { type: 'DELIVERY_SUCCESS',   title: 'Delivery Milestone Achieved',   body: '100th delivery completed this month. On track to exceed monthly target by 15%.', severity: 'info', resolved: false },
    ];
    for (const e of events) {
      await prisma.aiEvent.create({ data: { companyId: cid, ...e, createdAt: daysAgo(randInt(0, 3)) } });
      console.log('  Created AI event: ' + e.title.slice(0,40));
    }
  } else {
    console.log('  Skip AI events (' + aiCount + ' exist)');
  }

  // ── 9. Notifications ──────────────────────────────────────────────────────
  const notifCount = await prisma.notification.count({ where: { companyId: cid } });
  if (notifCount === 0) {
    const notifs = [
      { title: 'New Waybill Created', body: 'Waybill FO-00001 has been created and is pending collection.', type: 'info' },
      { title: 'Driver Assigned', body: 'Sipho Dlamini has been assigned to 3 collections in Johannesburg.', type: 'success' },
      { title: 'Invoice Sent', body: 'Invoice INV-2026-0001 has been sent to Acme Logistics.', type: 'info' },
      { title: 'Delivery Completed', body: 'Waybill FO-00009 has been successfully delivered.', type: 'success' },
    ];
    for (const n of notifs) {
      await prisma.notification.create({ data: { companyId: cid, ...n, createdAt: daysAgo(randInt(0, 2)) } });
    }
    console.log('  Created ' + notifs.length + ' notifications');
  } else {
    console.log('  Skip notifications (' + notifCount + ' exist)');
  }

  // ── 10. WhatsApp Messages ─────────────────────────────────────────────────
  const waThrCount = await prisma.whatsAppThread.count({ where: { companyId: cid } });
  if (waThrCount === 0) {
    const clients = ['Acme Logistics', 'BlueSky Couriers', 'SA Express Freight'];
    for (const client of clients) {
      const thread = await prisma.whatsAppThread.create({ data: {
        companyId: cid,
        phone:     phone(),
        name:      client,
        lastMessageAt: new Date(),
      }});
      await prisma.whatsAppMessage.createMany({ data: [
        { companyId: cid, threadId: thread.id, content: 'Hi, when will my parcel arrive?', direction: 'inbound',  status: 'delivered', createdAt: daysAgo(1) },
        { companyId: cid, threadId: thread.id, content: 'Your parcel is out for delivery and will arrive by 3pm today.', direction: 'outbound', status: 'delivered', createdAt: daysAgo(1) },
        { companyId: cid, threadId: thread.id, content: 'Thank you!', direction: 'inbound', status: 'delivered', createdAt: new Date() },
      ]});
    }
    console.log('  Created WhatsApp threads for 3 clients');
  } else {
    console.log('  Skip WhatsApp threads (' + waThrCount + ' exist)');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  console.log('====================================================================');
  console.log('  Seed complete! FlowOps Demo Couriers now has:');
  const counts = await Promise.all([
    prisma.branch.count({ where: { companyId: cid } }),
    prisma.driver.count({ where: { companyId: cid } }),
    prisma.waybill.count({ where: { companyId: cid } }),
    prisma.shipment.count({ where: { companyId: cid } }),
    prisma.collection.count({ where: { companyId: cid } }),
    prisma.invoice.count({ where: { companyId: cid } }),
    prisma.quote.count({ where: { companyId: cid } }),
    prisma.aiEvent.count({ where: { companyId: cid } }),
  ]);
  const labels = ['Branches','Drivers','Waybills','Shipments','Collections','Invoices','Quotes','AI Events'];
  labels.forEach((l, i) => console.log('  ' + l.padEnd(16) + counts[i]));
  console.log('====================================================================');
  console.log('  Reload the app — the dashboard will now show live data.');
  console.log('');
}

main()
  .catch((e) => { console.error('FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
