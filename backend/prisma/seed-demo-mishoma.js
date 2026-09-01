/**
 * FlowOps — Mishoma Holdings Demo Seed (Cross-Border Mining Freight)
 *
 * Tailored for a demo with Peniel Mishoma (Mishoma Holdings) whose world is
 * DRC / Copperbelt cross-border freight — copper, cobalt, mining supply into
 * and out of the DRC, Zambia and Zimbabwe via the North-South corridor.
 *
 * Creates a realistic, busy cross-border logistics operation:
 * - 4 branches (JHB gateway, Musina/Beitbridge, Kasumbalesa, Lubumbashi)
 * - 20 long-haul drivers across the corridor
 * - 15 clients (mining / trading / freight-style names)
 * - 80+ waybills across all statuses (copper, cobalt, mining inputs)
 * - 12 active shipments with GPS along the North-South corridor
 * - 15 collections in various states
 * - 12 invoices (USD-scale cross-border values shown in ZAR)
 * - 8 rate cards for cross-border corridors
 * - 10 AI events (corridor intelligence: Beitbridge, Kasumbalesa, docs)
 * - 6 quotes (pipeline)
 * - WhatsApp threads showing cross-border customer comms
 *
 * Reuses the EXACT same Prisma patterns as seed-demo-chf.js
 * (company:{connect}, sentAt, UPPERCASE enums, riskLevel omit-if-unset).
 *
 * Usage (inside API container):
 *   docker cp backend/prisma/seed-demo-mishoma.js flowops-api-1:/app/prisma/seed-demo-mishoma.js
 *   docker exec -it flowops-api-1 node prisma/seed-demo-mishoma.js
 *
 * Safe to re-run: clears existing demo data for the tenant first.
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Corridor branches (gateway → borders → Copperbelt) ─────────────────────
const BRANCHES = [
  { name: 'Johannesburg Gateway', city: 'Johannesburg', address: '14 Freight Road, City Deep',        lat: -26.2185, lng: 28.0675 },
  { name: 'Musina / Beitbridge',  city: 'Musina',       address: 'Beitbridge Border Post, Musina',    lat: -22.2050, lng: 29.9866 },
  { name: 'Kasumbalesa Border',   city: 'Kasumbalesa',  address: 'Kasumbalesa Border Post (DRC/Zambia)', lat: -12.2456, lng: 27.7931 },
  { name: 'Lubumbashi Depot',     city: 'Lubumbashi',   address: 'Route de Kipushi, Lubumbashi, DRC',  lat: -11.6647, lng: 27.4794 },
];

// Long-haul drivers positioned along the North-South corridor
// (JHB → Musina/Beitbridge → Harare → Lusaka → Kasumbalesa → Lubumbashi)
const DRIVERS = [
  { name: 'Sipho Dlamini',      vehicleType: 'truck', vehicleReg: 'GP 234 NWP', status: 'ON_ROUTE',  lat: -24.1234, lng: 29.4567, branch: 0 }, // N1 north to Musina
  { name: 'Tendai Moyo',        vehicleType: 'truck', vehicleReg: 'ZW 891 HRE', status: 'ON_ROUTE',  lat: -20.0637, lng: 30.8277, branch: 1 }, // Zimbabwe, past Beitbridge
  { name: 'Kgosi Sithole',      vehicleType: 'truck', vehicleReg: 'GP 445 RBG', status: 'AVAILABLE', lat: -26.2041, lng: 28.0473, branch: 0 },
  { name: 'Chanda Mwila',       vehicleType: 'truck', vehicleReg: 'ZM 112 LUN', status: 'ON_ROUTE',  lat: -15.4167, lng: 28.2833, branch: 2 }, // Lusaka
  { name: 'Lerato Mokoena',     vehicleType: 'truck', vehicleReg: 'GP 667 PTA', status: 'AVAILABLE', lat: -25.7479, lng: 28.2293, branch: 0 },
  { name: 'Blessing Ncube',     vehicleType: 'truck', vehicleReg: 'ZW 789 BYO', status: 'ON_ROUTE',  lat: -21.7500, lng: 29.7500, branch: 1 }, // near Beitbridge
  { name: 'Joseph Kabila',      vehicleType: 'truck', vehicleReg: 'CD 334 LSH', status: 'ON_ROUTE',  lat: -12.5000, lng: 27.8500, branch: 3 }, // Copperbelt
  { name: 'Sbu Shabalala',      vehicleType: 'truck', vehicleReg: 'GP 556 PMB', status: 'AVAILABLE', lat: -26.1076, lng: 28.0567, branch: 0 },
  { name: 'Mumba Kalusha',      vehicleType: 'truck', vehicleReg: 'ZM 901 KIT', status: 'ON_ROUTE',  lat: -12.8024, lng: 28.2132, branch: 2 }, // Kitwe/Copperbelt
  { name: 'Dineo Moagi',        vehicleType: 'van',   vehicleReg: 'GP 123 SNT', status: 'AVAILABLE', lat: -26.1076, lng: 28.0567, branch: 0 },
  { name: 'Farai Chikwenhere',  vehicleType: 'truck', vehicleReg: 'ZW 445 MSV', status: 'ON_ROUTE',  lat: -19.4514, lng: 29.8149, branch: 1 }, // Gweru, ZW
  { name: 'Mandla Nkomo',       vehicleType: 'truck', vehicleReg: 'GP 278 BRK', status: 'ON_ROUTE',  lat: -23.9045, lng: 29.4685, branch: 0 }, // Polokwane
  { name: 'Grace Ilunga',       vehicleType: 'truck', vehicleReg: 'CD 890 LSH', status: 'AVAILABLE', lat: -11.6647, lng: 27.4794, branch: 3 },
  { name: 'Kagiso Modise',      vehicleType: 'truck', vehicleReg: 'NW 334 RST', status: 'ON_ROUTE',  lat: -13.1339, lng: 27.8493, branch: 2 }, // near Kasumbalesa
  { name: 'Palesa Mokoena',     vehicleType: 'car',   vehicleReg: 'FS 112 BFN', status: 'OFFLINE',   lat: -29.0852, lng: 26.1596, branch: 0 },
  { name: 'Thabo Mkhize',       vehicleType: 'truck', vehicleReg: 'GP 556 MID', status: 'ON_ROUTE',  lat: -25.4890, lng: 28.1567, branch: 0 },
  { name: 'Patience Banda',     vehicleType: 'truck', vehicleReg: 'ZM 778 NDO', status: 'AVAILABLE', lat: -12.9587, lng: 28.6366, branch: 2 }, // Ndola
  { name: 'Vusi Maseko',        vehicleType: 'truck', vehicleReg: 'MP 445 NLS', status: 'ON_ROUTE',  lat: -22.9576, lng: 30.4744, branch: 1 }, // Musina approach
  { name: 'Emmanuel Tshibangu', vehicleType: 'truck', vehicleReg: 'CD 223 LSH', status: 'ON_ROUTE',  lat: -12.1000, lng: 27.6500, branch: 3 }, // DRC Copperbelt
  { name: 'Tumelo Phetla',      vehicleType: 'van',   vehicleReg: 'GP 990 JHB', status: 'AVAILABLE', lat: -26.1890, lng: 28.0234, branch: 0 },
];

// Mining / trading / freight-style clients for the corridor
const CLIENTS = [
  { name: 'Kamoa Copper SA',          tradingName: 'Kamoa Copper',      billingType: 'CONTRACT', paymentTerms: 30, email: 'logistics@kamoacopper.cd' },
  { name: 'Glencore Katanga',         tradingName: 'Glencore Katanga',  billingType: 'CONTRACT', paymentTerms: 30, email: 'freight@glencore-kat.cd' },
  { name: 'CMOC Tenke Fungurume',     tradingName: 'CMOC TFM',          billingType: 'CONTRACT', paymentTerms: 30, email: 'supply@tfm.cd' },
  { name: 'First Quantum Minerals',   tradingName: 'FQM',               billingType: 'CONTRACT', paymentTerms: 30, email: 'transport@fqml.com' },
  { name: 'Trafigura DRC',            tradingName: 'Trafigura',         billingType: 'CONTRACT', paymentTerms: 14, email: 'ops@trafigura.cd' },
  { name: 'Chambishi Copper Smelter', tradingName: 'Chambishi',        billingType: 'CONTRACT', paymentTerms: 30, email: 'logistics@chambishi.zm' },
  { name: 'Konkola Copper Mines',     tradingName: 'KCM',               billingType: 'CONTRACT', paymentTerms: 30, email: 'freight@kcm.zm' },
  { name: 'Bazano Group',             tradingName: 'Bazano',            billingType: 'PREPAID',  paymentTerms: 7,  email: 'export@bazano.cd' },
  { name: 'Somika SPRL',              tradingName: 'Somika',            billingType: 'CONTRACT', paymentTerms: 30, email: 'logistics@somika.cd' },
  { name: 'Ivanhoe Mines',            tradingName: 'Ivanhoe',           billingType: 'CONTRACT', paymentTerms: 30, email: 'supplychain@ivanhoe.com' },
  { name: 'Sino-Congolaise des Mines', tradingName: 'Sicomines',       billingType: 'CONTRACT', paymentTerms: 30, email: 'freight@sicomines.cd' },
  { name: 'Mishoma Holdings',         tradingName: 'Mishoma',           billingType: 'CONTRACT', paymentTerms: 30, email: 'ops@mishoma.co.za' },
  { name: 'Manica Africa',            tradingName: 'Manica',            billingType: 'CONTRACT', paymentTerms: 30, email: 'clearing@manica.co.za' },
  { name: 'Bolloré Logistics DRC',    tradingName: 'Bollore',          billingType: 'CONTRACT', paymentTerms: 30, email: 'corridor@bollore.cd' },
  { name: 'Access World Copperbelt',  tradingName: 'Access World',      billingType: 'CONTRACT', paymentTerms: 30, email: 'warehousing@accessworld.zm' },
];

// North-South corridor routes (the real freight lanes Peniel runs)
const ROUTES = {
  jhb_beitbridge:   { from: '14 Freight Road, City Deep, Johannesburg', to: 'Beitbridge Border Post, Musina',        fromLat: -26.2185, fromLng: 28.0675, toLat: -22.2050, toLng: 29.9866 },
  beitbridge_lusaka:{ from: 'Beitbridge Border Post, Musina',           to: 'Lusaka Dry Port, Zambia',                fromLat: -22.2050, fromLng: 29.9866, toLat: -15.4167, toLng: 28.2833 },
  lusaka_kasumbalesa:{from: 'Lusaka Dry Port, Zambia',                  to: 'Kasumbalesa Border Post (DRC/Zambia)',   fromLat: -15.4167, fromLng: 28.2833, toLat: -12.2456, toLng: 27.7931 },
  kasumbalesa_lubumbashi:{from:'Kasumbalesa Border Post (DRC/Zambia)',  to: 'Route de Kipushi, Lubumbashi, DRC',       fromLat: -12.2456, fromLng: 27.7931, toLat: -11.6647, toLng: 27.4794 },
  lubumbashi_durban:{ from: 'Route de Kipushi, Lubumbashi, DRC',        to: '8 Bayhead Road, Durban Port',            fromLat: -11.6647, fromLng: 27.4794, toLat: -29.8833, toLng: 31.0350 },
  jhb_lubumbashi:   { from: '14 Freight Road, City Deep, Johannesburg', to: 'Route de Kipushi, Lubumbashi, DRC',       fromLat: -26.2185, fromLng: 28.0675, toLat: -11.6647, toLng: 27.4794 },
  durban_lubumbashi:{ from: '8 Bayhead Road, Durban Port',              to: 'Route de Kipushi, Lubumbashi, DRC',       fromLat: -29.8833, fromLng: 31.0350, toLat: -11.6647, toLng: 27.4794 },
  copperbelt_durban:{ from: 'Kitwe Copperbelt, Zambia',                 to: '8 Bayhead Road, Durban Port',            fromLat: -12.8024, fromLng: 28.2132, toLat: -29.8833, toLng: 31.0350 },
};

const DESCRIPTIONS = [
  'Copper Cathodes - 25MT', 'Cobalt Hydroxide - Sealed Drums', 'Copper Blister - Palletised',
  'Mining Reagents - Hazardous', 'Sulphuric Acid - Tanker', 'Grinding Media - Steel Balls',
  'Mining Equipment - Oversized', 'Copper Concentrate - Bulk Bags', 'Cobalt Metal - Bonded',
  'Spare Parts - Crusher', 'Lime - Bulk', 'Diesel Generators - Site Power',
  'Conveyor Components', 'Drill Rods & Consumables', 'Copper Wire Rod', 'HDPE Pipe - Mining',
];

// ── Helpers (identical patterns to working seed) ───────────────────────────
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function hoursAgo(n) { const d = new Date(); d.setHours(d.getHours() - n); return d; }
function phone() { return `+27 ${randInt(60, 89)} ${randInt(100, 999)} ${randInt(1000, 9999)}`; }
function waybillNum(n) { return `MSH-${String(n).padStart(5, '0')}`; }

async function main() {
  console.log('\n=== FlowOps Mishoma Holdings Demo Seed (Cross-Border Mining Freight) ===');
  console.log('Building corridor demo data...\n');

  const company = await prisma.company.findFirst({ where: { name: 'FlowOps Demo Couriers' } });
  if (!company) {
    console.log('ERROR: Run seed-demo-company.js first!');
    process.exit(1);
  }
  const cid = company.id;
  console.log(`Company: ${company.name} (${cid})`);

  // ── CLEAR existing demo data (safe re-run) ────────────────────────────────
  console.log('\nClearing existing demo data...');
  await prisma.whatsAppMessage.deleteMany({ where: { thread: { companyId: cid } } });
  await prisma.whatsAppThread.deleteMany({ where: { companyId: cid } });
  await prisma.aiEvent.deleteMany({ where: { companyId: cid } });
  await prisma.notification.deleteMany({ where: { companyId: cid } });
  await prisma.shipment.deleteMany({ where: { companyId: cid } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { companyId: cid } } });
  await prisma.invoice.deleteMany({ where: { companyId: cid } });
  await prisma.quote.deleteMany({ where: { companyId: cid } });
  await prisma.collection.deleteMany({ where: { companyId: cid } });
  await prisma.waybill.deleteMany({ where: { companyId: cid } });
  await prisma.rateCard.deleteMany({ where: { companyId: cid } });
  await prisma.client.deleteMany({ where: { companyId: cid } });
  await prisma.driver.deleteMany({ where: { companyId: cid } });
  await prisma.branch.deleteMany({ where: { companyId: cid } });
  console.log('  Cleared.\n');

  // ── 1. BRANCHES ──────────────────────────────────────────────────────────
  const branches = [];
  for (const b of BRANCHES) {
    const created = await prisma.branch.create({ data: { companyId: cid, name: b.name, address: b.address, city: b.city, lat: b.lat, lng: b.lng } });
    branches.push(created);
  }
  console.log(`  Created ${branches.length} branches`);

  // ── 2. DRIVERS ───────────────────────────────────────────────────────────
  const drivers = [];
  for (const d of DRIVERS) {
    const created = await prisma.driver.create({ data: {
      companyId: cid, branchId: branches[d.branch].id,
      name: d.name, vehicleType: d.vehicleType, vehicleReg: d.vehicleReg,
      status: d.status, phone: phone(), email: d.name.toLowerCase().replace(/ /g, '.') + '@mishoma.co.za',
      lastLat: d.lat, lastLng: d.lng, lastSeen: hoursAgo(randInt(0, 2)),
      isActive: true,
    }});
    drivers.push(created);
  }
  console.log(`  Created ${drivers.length} drivers (${drivers.filter(d => d.status === 'ON_ROUTE').length} active on corridor)`);

  // ── 3. CLIENTS ───────────────────────────────────────────────────────────
  const clients = [];
  for (const c of CLIENTS) {
    const created = await prisma.client.create({ data: {
      companyId: cid, name: c.name, tradingName: c.tradingName,
      email: c.email, phone: phone(), billingType: c.billingType,
      paymentTerms: c.paymentTerms, address: rand(['Lubumbashi, DRC', 'Kitwe, Zambia', 'Johannesburg', 'Ndola, Zambia', 'Durban']),
    }});
    clients.push(created);
  }
  console.log(`  Created ${clients.length} clients`);

  // ── 4. RATE CARDS (cross-border corridors) ────────────────────────────────
  const rateCardDefs = [
    { name: 'JHB → Beitbridge',          fromZone: 'Gauteng',   toZone: 'Zimbabwe Border', minWeight: 0, maxWeight: 300, basePrice: 9500,  pricePerKg: 22 },
    { name: 'JHB → Lubumbashi (DRC)',    fromZone: 'Gauteng',   toZone: 'DRC Copperbelt',  minWeight: 0, maxWeight: 300, basePrice: 42000, pricePerKg: 34 },
    { name: 'Durban → Lubumbashi (DRC)', fromZone: 'KZN Port',  toZone: 'DRC Copperbelt',  minWeight: 0, maxWeight: 300, basePrice: 48000, pricePerKg: 38 },
    { name: 'Copperbelt → Durban Export',fromZone: 'DRC/Zambia',toZone: 'KZN Port',        minWeight: 0, maxWeight: 300, basePrice: 46000, pricePerKg: 36 },
    { name: 'Lusaka → Kasumbalesa',      fromZone: 'Zambia',    toZone: 'DRC Border',      minWeight: 0, maxWeight: 300, basePrice: 12000, pricePerKg: 15 },
    { name: 'Beitbridge → Lusaka',       fromZone: 'Zim Border',toZone: 'Zambia',          minWeight: 0, maxWeight: 300, basePrice: 18000, pricePerKg: 19 },
    { name: 'Copper Cathode Export (per MT)', fromZone: 'DRC',  toZone: 'Durban Port',     minWeight: 0, maxWeight: 300, basePrice: 40000, pricePerKg: 32 },
    { name: 'Cobalt Bonded Transit',     fromZone: 'DRC',       toZone: 'Durban Port',     minWeight: 0, maxWeight: 200, basePrice: 52000, pricePerKg: 45 },
  ];
  for (const rc of rateCardDefs) {
    await prisma.rateCard.create({ data: { companyId: cid, ...rc, currency: 'ZAR' } });
  }
  console.log(`  Created ${rateCardDefs.length} rate cards`);

  // ── 5. WAYBILLS (80+) ────────────────────────────────────────────────────
  const waybillDistribution = [
    ...Array(30).fill('DELIVERED'),
    ...Array(12).fill('IN_TRANSIT'),
    ...Array(8).fill('OUT_FOR_DELIVERY'),
    ...Array(10).fill('PENDING'),
    ...Array(6).fill('COLLECTED'),
    ...Array(4).fill('AT_ORIGIN_HUB'),
    ...Array(3).fill('AT_DESTINATION_HUB'),
    ...Array(4).fill('FAILED_DELIVERY'),
    ...Array(3).fill('CANCELLED'),
  ];

  const routeKeys = Object.keys(ROUTES);
  const waybills = [];

  for (let i = 0; i < waybillDistribution.length; i++) {
    const status = waybillDistribution[i];
    const route = ROUTES[rand(routeKeys)];
    const client = rand(clients);
    const weight = parseFloat((Math.random() * 250 + 20).toFixed(1)); // heavy mining loads
    const totalAmount = parseFloat((weight * randInt(30, 50) + randInt(8000, 40000)).toFixed(2));
    const createdAt = daysAgo(randInt(0, 30));

    let podDeliveredAt = null;
    let codAmount = null;
    let riskLevel = undefined;

    if (status === 'DELIVERED') {
      podDeliveredAt = daysAgo(randInt(0, 14));
    }
    if (i % 6 === 0) {
      codAmount = parseFloat((totalAmount * 0.3).toFixed(2));
    }
    if (status === 'FAILED_DELIVERY' || (status === 'IN_TRANSIT' && i % 7 === 0)) {
      riskLevel = rand(['HIGH', 'CRITICAL']);
    }

    const wbData = {
      company: { connect: { id: cid } },
      trackingNumber: waybillNum(i + 1),
      status,
      senderName: client.tradingName,
      senderPhone: phone(),
      senderAddress: route.from,
      senderLat: route.fromLat,
      senderLng: route.fromLng,
      recipientName: rand(CLIENTS).tradingName + ' - ' + rand(['Mine Site', 'Smelter', 'Bonded Warehouse', 'Head Office', 'Export Yard']),
      recipientPhone: phone(),
      recipientAddress: route.to,
      recipientLat: route.toLat,
      recipientLng: route.toLng,
      weight,
      description: rand(DESCRIPTIONS),
      totalAmount,
      codAmount,
      podDeliveredAt,
      createdAt,
      updatedAt: new Date(),
    };
    if (riskLevel) wbData.riskLevel = riskLevel;
    const wb = await prisma.waybill.create({ data: wbData });
    waybills.push(wb);
  }
  console.log(`  Created ${waybills.length} waybills (${waybillDistribution.filter(s => s === 'IN_TRANSIT').length} in transit, ${waybillDistribution.filter(s => s === 'DELIVERED').length} delivered)`);

  // ── 6. SHIPMENTS (active, GPS along corridor) ─────────────────────────────
  const activeWaybills = waybills.filter(w => ['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(w.status));
  const onRouteDrivers = drivers.filter(d => d.status === 'ON_ROUTE');
  let shipmentCount = 0;

  for (let i = 0; i < Math.min(activeWaybills.length, 12); i++) {
    const wb = activeWaybills[i];
    const driver = onRouteDrivers[i % onRouteDrivers.length];
    await prisma.shipment.create({ data: {
      company: { connect: { id: cid } },
      waybill: { connect: { id: wb.id } },
      driver: { connect: { id: driver.id } },
      status: 'IN_TRANSIT',
      currentLat: driver.lastLat + (Math.random() * 0.02 - 0.01),
      currentLng: driver.lastLng + (Math.random() * 0.02 - 0.01),
      estimatedDelivery: daysFromNow(randInt(1, 5)),
      createdAt: hoursAgo(randInt(1, 48)),
      updatedAt: new Date(),
    }});
    shipmentCount++;
  }
  console.log(`  Created ${shipmentCount} active shipments with GPS tracking`);

  // ── 7. COLLECTIONS ────────────────────────────────────────────────────────
  const colStatuses = ['PENDING', 'PENDING', 'PENDING', 'ASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'COLLECTED', 'COLLECTED', 'COLLECTED', 'COLLECTED', 'FAILED', 'PENDING', 'IN_PROGRESS'];
  for (let i = 0; i < colStatuses.length; i++) {
    const client = rand(clients);
    const loc = BRANCHES[randInt(0, 3)];
    const driver = colStatuses[i] !== 'PENDING' ? rand(onRouteDrivers) : null;
    const colData = {
      company: { connect: { id: cid } },
      status: colStatuses[i],
      clientName: client.tradingName,
      clientPhone: phone(),
      clientEmail: client.email,
      pickupAddress: rand([loc.address, 'Kamoa-Kakula Mine, DRC', 'Kolwezi Mine Gate 2, DRC', 'Kitwe Load Point, Zambia', 'City Deep Consolidation, JHB']),
      pickupLat: loc.lat + (Math.random() * 0.05 - 0.025),
      pickupLng: loc.lng + (Math.random() * 0.05 - 0.025),
      notes: rand(['Bonded cargo - seal intact', 'Copper cathode, 25MT', 'Requires SAD500 + transit bond', 'Escort required to border', 'Weighbridge cert attached', null]),
      scheduledAt: daysFromNow(randInt(0, 3)),
      createdAt: daysAgo(randInt(0, 3)),
      updatedAt: new Date(),
    };
    if (driver) colData.driver = { connect: { id: driver.id } };
    await prisma.collection.create({ data: colData });
  }
  console.log(`  Created ${colStatuses.length} collections`);

  // ── 8. INVOICES (cross-border scale revenue) ──────────────────────────────
  const invoiceDefs = [
    { client: 0,  total: 342000, status: 'PAID',    paidAt: daysAgo(5) },
    { client: 1,  total: 288500, status: 'PAID',    paidAt: daysAgo(3) },
    { client: 2,  total: 196800, status: 'SENT',    dueDate: daysFromNow(14) },
    { client: 3,  total: 154200, status: 'SENT',    dueDate: daysFromNow(7) },
    { client: 4,  total: 231500, status: 'PAID',    paidAt: daysAgo(12) },
    { client: 5,  total: 176700, status: 'OVERDUE', dueDate: daysAgo(8) },
    { client: 6,  total: 128900, status: 'SENT',    dueDate: daysFromNow(21) },
    { client: 7,  total: 98500,  status: 'PAID',    paidAt: daysAgo(1) },
    { client: 8,  total: 142300, status: 'SENT',    dueDate: daysFromNow(10) },
    { client: 9,  total: 205600, status: 'OVERDUE', dueDate: daysAgo(3) },
    { client: 10, total: 87100,  status: 'DRAFT',   dueDate: daysFromNow(30) },
    { client: 11, total: 119800, status: 'PAID',    paidAt: daysAgo(7) },
  ];

  for (let i = 0; i < invoiceDefs.length; i++) {
    const def = invoiceDefs[i];
    const client = clients[def.client];
    const subtotal = parseFloat((def.total / 1.15).toFixed(2));
    const tax = parseFloat((def.total - subtotal).toFixed(2));
    const numItems = randInt(3, 8);
    const itemTotal = subtotal / numItems;

    await prisma.invoice.create({ data: {
      company: { connect: { id: cid } },
      invoiceNumber: `INV-2026-${String(i + 1).padStart(4, '0')}`,
      clientName: client.name,
      clientEmail: client.email,
      status: def.status,
      subtotal,
      tax,
      total: def.total,
      dueDate: def.dueDate || daysFromNow(30),
      paidAt: def.paidAt || null,
      sentAt: def.status !== 'DRAFT' ? daysAgo(randInt(10, 25)) : null,
      notes: 'Cross-border freight. Net 30. EFT to FNB 627-432-8891.',
      createdAt: daysAgo(randInt(15, 30)),
      updatedAt: new Date(),
      items: { create: Array.from({ length: numItems }, (_, j) => ({
        description: `Corridor Freight - ${rand(['JHB-Lubumbashi', 'Durban-Copperbelt', 'Beitbridge Transit', 'Kasumbalesa Clearing', 'Copper Export'])} - Load ${j + 1}`,
        quantity: randInt(1, 10),
        unitPrice: parseFloat((itemTotal / randInt(1, 10)).toFixed(2)),
        total: parseFloat(itemTotal.toFixed(2)),
      }))},
    }});
  }
  const totalRevenue = invoiceDefs.reduce((s, d) => s + d.total, 0);
  console.log(`  Created ${invoiceDefs.length} invoices (R${(totalRevenue / 1000).toFixed(0)}K total revenue)`);

  // ── 9. QUOTES (pipeline) ──────────────────────────────────────────────────
  const quoteDefs = [
    { from: 'Johannesburg', to: 'Lubumbashi (DRC)',  weight: 250, price: 50500, accepted: true },
    { from: 'Durban Port',  to: 'Kolwezi (DRC)',     weight: 280, price: 58640, accepted: true },
    { from: 'Kitwe',        to: 'Durban Port',       weight: 260, price: 49360, accepted: false },
    { from: 'Johannesburg', to: 'Beitbridge',        weight: 300, price: 16100, accepted: false },
    { from: 'Lusaka',       to: 'Kasumbalesa',       weight: 240, price: 15600, accepted: false },
    { from: 'Lubumbashi',   to: 'Durban Port (Cobalt)', weight: 180, price: 60100, accepted: true },
  ];
  for (const q of quoteDefs) {
    await prisma.quote.create({ data: {
      company: { connect: { id: cid } },
      fromAddress: q.from,
      toAddress: q.to,
      clientName: rand(clients).tradingName,
      weight: q.weight,
      price: q.price,
      currency: 'ZAR',
      breakdown: { base: 42000, perKg: parseFloat(((q.price - 42000) / q.weight).toFixed(2)), total: q.price },
      accepted: q.accepted,
      expiresAt: q.accepted ? daysAgo(2) : daysFromNow(5),
      createdAt: daysAgo(randInt(1, 10)),
    }});
  }
  console.log(`  Created ${quoteDefs.length} quotes (${quoteDefs.filter(q => q.accepted).length} accepted)`);

  // ── 10. AI EVENTS (Corridor Intelligence Layer) ───────────────────────────
  const aiEvents = [
    { type: 'BORDER_DELAY', title: 'Beitbridge: 14-Hour Queue Northbound', body: 'FESARTA reports ~14-hour average queue at Beitbridge northbound. Drivers Sipho Dlamini and Vusi Maseko are 3 hours out. Recommend holding at Musina overnight to avoid idle-at-border demurrage.', severity: 'critical' },
    { type: 'CORRIDOR_INTEL', title: 'Kasumbalesa: Pre-Clearance Required', body: 'DRC customs now requires declarations pre-lodged before truck arrival at Kasumbalesa. 4 shipments in pipeline affected. Auto-generating SAD500 + transit bond docs to avoid 2-3 day hold.', severity: 'warning' },
    { type: 'SLA_BREACH_RISK', title: 'SLA Risk: MSH-00034 (Kamoa Copper)', body: 'Copper cathode load MSH-00034 has been in transit 6 days on JHB-Lubumbashi. Client SLA is 7 days. One border hold from breach. Escalate to corridor controller.', severity: 'critical' },
    { type: 'PAYMENT_RISK', title: 'Overdue: KCM R176,700', body: 'Invoice INV-2026-0006 for R176,700 is 8 days overdue. Client has not responded to 2 reminders. Escalate to collections before next load release.', severity: 'critical' },
    { type: 'DOC_COMPLIANCE', title: 'Missing Transit Bond: 2 Loads', body: '2 DRC-bound loads are missing valid transit bonds. Cannot clear Kasumbalesa without them. Flagged before dispatch to prevent border rejection.', severity: 'warning' },
    { type: 'FUEL_ALERT', title: 'Diesel +R3.09/l from 3 September', body: 'CEF data indicates diesel rising ~R3/l from 3 September. Long-haul DRC runs (2,600km+) most exposed. Estimated impact: +R210,000/month across corridor fleet. Re-quote affected rate cards now.', severity: 'warning' },
    { type: 'CORRIDOR_INTEL', title: 'Lobito Corridor Diverting Copper Volume', body: 'DRC copper increasingly routing west via Lobito rail. Monitor southbound volumes on North-South corridor — potential shift in available backhaul cargo from Copperbelt.', severity: 'info' },
    { type: 'DRIVER_PERFORMANCE', title: 'Driver Rating: Joseph Kabila 4.9/5', body: 'Joseph completed 18 cross-border runs this quarter with 0 border rejections and full doc compliance. Recommend for high-value cobalt bonded loads.', severity: 'info' },
    { type: 'DELIVERY_SUCCESS', title: 'Corridor On-Time Rate: 91%', body: 'Cross-border on-time delivery reached 91% this month despite border volatility — 4 points above target. Strong doc pre-clearance is the driver.', severity: 'info' },
    { type: 'COD_RECONCILIATION', title: 'COD Mismatch: R18,400 Unreconciled', body: '2 COD collections from Copperbelt runs not yet banked. Total outstanding: R18,400. Drivers: Mumba Kalusha, Chanda Mwila.', severity: 'warning' },
  ];
  for (const e of aiEvents) {
    await prisma.aiEvent.create({ data: { company: { connect: { id: cid } }, ...e, resolved: e.severity === 'info', createdAt: daysAgo(randInt(0, 3)) } });
  }
  console.log(`  Created ${aiEvents.length} AI events (${aiEvents.filter(e => e.severity === 'critical').length} critical)`);

  // ── 11. NOTIFICATIONS ─────────────────────────────────────────────────────
  const notifs = [
    { title: 'New Cross-Border Load', body: 'Kamoa Copper requested transport of 250MT copper cathode JHB → Lubumbashi.', type: 'info' },
    { title: 'Border Cleared', body: 'MSH-00042 cleared Beitbridge northbound. Transit bond validated. Continuing to Lusaka.', type: 'success' },
    { title: 'Invoice Paid', body: 'Glencore Katanga paid INV-2026-0002 (R288,500) via EFT.', type: 'success' },
    { title: 'Delivery Completed', body: 'MSH-00028 delivered to Kolwezi mine site. POD signed. Bonded seal verified.', type: 'success' },
    { title: 'SLA Warning', body: 'MSH-00034 approaching 7-day SLA. One border hold from breach.', type: 'warning' },
    { title: 'Quote Accepted', body: 'Trafigura accepted quote for Lubumbashi → Durban cobalt (180MT, R60,100).', type: 'success' },
  ];
  for (const n of notifs) {
    await prisma.notification.create({ data: { company: { connect: { id: cid } }, ...n, createdAt: hoursAgo(randInt(0, 12)) } });
  }
  console.log(`  Created ${notifs.length} notifications`);

  // ── 12. WHATSAPP THREADS ──────────────────────────────────────────────────
  const waThreads = [
    { name: 'Kamoa Copper Logistics', messages: [
      { content: 'We have 250MT copper cathode ready at Kamoa-Kakula for Durban export. When can you load?', direction: 'INBOUND' },
      { content: 'Confirmed. Allocating 10 trucks from Lubumbashi depot. First load dispatches tomorrow 06:00. Transit bonds pre-lodged for Kasumbalesa. Tracking: MSH-00042 onwards.', direction: 'OUTBOUND' },
      { content: 'Excellent. Please ensure bonded seals and weighbridge certs on each.', direction: 'INBOUND' },
    ]},
    { name: 'Trafigura DRC', messages: [
      { content: 'Status on cobalt load MSH-00034?', direction: 'INBOUND' },
      { content: 'MSH-00034 is in transit, currently past Lusaka heading to Kasumbalesa. Driver: Joseph Kabila. All transit docs valid. ETA Lubumbashi: 2 days. Live tracking link sent.', direction: 'OUTBOUND' },
      { content: 'Good. Flag me immediately if there is any border hold.', direction: 'INBOUND' },
      { content: 'Will do. Our system alerts us the moment a load stalls at a border — you will know before we even call.', direction: 'OUTBOUND' },
    ]},
    { name: 'Konkola Copper Mines', messages: [
      { content: 'Invoice INV-2026-0006 — we need a copy of the SAD500 and proof of border clearance attached.', direction: 'INBOUND' },
      { content: 'Sending now. All customs docs are stored against the shipment record, so I can pull them instantly. Attaching SAD500, transit bond, and Beitbridge clearance stamp.', direction: 'OUTBOUND' },
    ]},
    { name: 'Ivanhoe Mines Supply', messages: [
      { content: 'Need to schedule 5 loads of mining reagents from Durban to Kamoa next week.', direction: 'INBOUND' },
      { content: 'Noted. Allocating trucks for next week ex-Durban. Pre-clearing DRC import docs now so there is no delay at Kasumbalesa. Confirmation to your ops team shortly.', direction: 'OUTBOUND' },
    ]},
  ];
  for (const t of waThreads) {
    const thread = await prisma.whatsAppThread.create({ data: {
      company: { connect: { id: cid } }, phone: phone(), name: t.name, lastMessageAt: new Date(),
    }});
    for (let i = 0; i < t.messages.length; i++) {
      await prisma.whatsAppMessage.create({ data: {
        threadId: thread.id, content: t.messages[i].content,
        direction: t.messages[i].direction, status: 'DELIVERED',
        sentAt: hoursAgo(t.messages.length - i),
      }});
    }
  }
  console.log(`  Created ${waThreads.length} WhatsApp conversation threads`);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(64));
  console.log('  DEMO READY: FlowOps Mishoma Holdings (Cross-Border Mining)');
  console.log('='.repeat(64));
  const counts = await Promise.all([
    prisma.branch.count({ where: { companyId: cid } }),
    prisma.driver.count({ where: { companyId: cid } }),
    prisma.client.count({ where: { companyId: cid } }),
    prisma.rateCard.count({ where: { companyId: cid } }),
    prisma.waybill.count({ where: { companyId: cid } }),
    prisma.shipment.count({ where: { companyId: cid } }),
    prisma.collection.count({ where: { companyId: cid } }),
    prisma.invoice.count({ where: { companyId: cid } }),
    prisma.quote.count({ where: { companyId: cid } }),
    prisma.aiEvent.count({ where: { companyId: cid } }),
  ]);
  const labels = ['Branches', 'Drivers', 'Clients', 'Rate Cards', 'Waybills', 'Shipments', 'Collections', 'Invoices', 'Quotes', 'AI Events'];
  labels.forEach((l, i) => console.log(`  ${l.padEnd(16)} ${counts[i]}`));
  console.log('='.repeat(64));
  console.log(`  Total Monthly Revenue: R${(totalRevenue / 1000).toFixed(0)}K`);
  console.log(`  Active Drivers on Corridor: ${drivers.filter(d => d.status === 'ON_ROUTE').length}`);
  console.log(`  Cross-Border On-Time Rate: ~91%`);
  console.log('='.repeat(64));
  console.log('\n  Login: app.flowop.work');
  console.log('  User:  admin@demo.flowops.local');
  console.log('  Pass:  Demo@Admin123!\n');
  console.log('  Dashboard now shows a BUSY cross-border mining freight operation.');
  console.log('  Tailored for Tuesday demo with Peniel Mishoma (DRC corridor).\n');
}

main()
  .catch((e) => { console.error('FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
