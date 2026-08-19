/**
 * FlowOps — CHF Global Demo Seed (World-Class Presentation Data)
 *
 * Creates a realistic, busy logistics operation resembling CHF Global Logistics:
 * - 4 branches (JHB, CPT, DBN, PTA)
 * - 20 drivers across SA
 * - 15 clients (real company-style names)
 * - 80+ waybills across all statuses with realistic financials
 * - 12 active shipments with GPS positions along real SA highways
 * - 15 collections in various states
 * - 12 invoices with line items (R450K+ monthly revenue)
 * - 8 rate cards for different zones
 * - 10 AI events (shows the intelligence layer working)
 * - 6 quotes (pipeline)
 * - WhatsApp threads showing customer communication
 *
 * This makes the dashboard look ALIVE for a sales demo.
 *
 * Usage:
 *   cd /opt/Flowops/backend
 *   node prisma/seed-demo-chf.js
 *
 * Safe to re-run: clears existing demo data first, then recreates.
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Realistic SA Locations with highway GPS points ─────────────────────────
const BRANCHES = [
  { name: 'Johannesburg Hub',   city: 'Johannesburg', address: '14 Freight Road, City Deep',          lat: -26.2185, lng: 28.0675 },
  { name: 'Cape Town Depot',    city: 'Cape Town',    address: '22 Marine Drive, Paarden Eiland',     lat: -33.9062, lng: 18.5010 },
  { name: 'Durban Operations',  city: 'Durban',       address: '8 Bayhead Road, Durban Port',         lat: -29.8833, lng: 31.0350 },
  { name: 'Pretoria Warehouse', city: 'Pretoria',     address: '45 Struben Street, Pretoria Central', lat: -25.7461, lng: 28.1881 },
];

// Realistic driver names & positions along SA highways (N1, N3, N2, N12)
const DRIVERS = [
  { name: 'Sipho Dlamini',      vehicleType: 'truck',     vehicleReg: 'GP 234 NWP', status: 'ON_ROUTE',  lat: -26.0412, lng: 28.1234, branch: 0 },
  { name: 'Thandi Molefe',      vehicleType: 'truck',     vehicleReg: 'GP 891 JHB', status: 'ON_ROUTE',  lat: -27.4521, lng: 28.7612, branch: 0 },  // N1 south
  { name: 'Kgosi Sithole',      vehicleType: 'van',       vehicleReg: 'GP 445 RBG', status: 'AVAILABLE', lat: -26.2041, lng: 28.0473, branch: 0 },
  { name: 'Bongani Zulu',       vehicleType: 'truck',     vehicleReg: 'KZN 112 DBN', status: 'ON_ROUTE', lat: -28.7345, lng: 29.8721, branch: 2 },  // N3 midlands
  { name: 'Lerato Mokoena',     vehicleType: 'van',       vehicleReg: 'GP 667 PTA', status: 'AVAILABLE', lat: -25.7479, lng: 28.2293, branch: 3 },
  { name: 'Tshepo Mahlangu',    vehicleType: 'truck',     vehicleReg: 'GP 789 CEN', status: 'ON_ROUTE',  lat: -29.1234, lng: 26.2145, branch: 0 },  // N1 towards BFN
  { name: 'Zanele Ndlovu',      vehicleType: 'truck',     vehicleReg: 'WC 334 CPT', status: 'ON_ROUTE',  lat: -32.3456, lng: 22.5678, branch: 1 },  // N1 Karoo
  { name: 'Sbu Shabalala',      vehicleType: 'van',       vehicleReg: 'KZN 556 PMB', status: 'AVAILABLE', lat: -29.5890, lng: 30.3794, branch: 2 },
  { name: 'Mmabatho Letsatsi',  vehicleType: 'truck',     vehicleReg: 'GP 901 EKU', status: 'ON_ROUTE',  lat: -26.3456, lng: 28.2345, branch: 0 },
  { name: 'Dineo Moagi',        vehicleType: 'car',       vehicleReg: 'GP 123 SNT', status: 'AVAILABLE', lat: -26.1076, lng: 28.0567, branch: 0 },
  { name: 'Lebo Matlala',       vehicleType: 'truck',     vehicleReg: 'LP 445 PLK', status: 'ON_ROUTE',  lat: -24.1234, lng: 29.4567, branch: 3 },  // N1 north towards Musina
  { name: 'Mandla Nkomo',       vehicleType: 'truck',     vehicleReg: 'GP 278 BRK', status: 'ON_ROUTE',  lat: -25.4890, lng: 28.1567, branch: 3 },
  { name: 'Nokuthula Zwane',    vehicleType: 'van',       vehicleReg: 'KZN 890 HIL', status: 'AVAILABLE', lat: -29.8587, lng: 31.0218, branch: 2 },
  { name: 'Kagiso Modise',      vehicleType: 'truck',     vehicleReg: 'NW 334 RST', status: 'ON_ROUTE',  lat: -26.7123, lng: 27.0987, branch: 0 },  // N12 west
  { name: 'Palesa Mokoena',     vehicleType: 'car',       vehicleReg: 'FS 112 BFN', status: 'OFFLINE',   lat: -29.0852, lng: 26.1596, branch: 0 },
  { name: 'Thabo Mkhize',       vehicleType: 'truck',     vehicleReg: 'GP 556 MID', status: 'ON_ROUTE',  lat: -26.0234, lng: 28.1890, branch: 0 },
  { name: 'Nomsa Dube',         vehicleType: 'van',       vehicleReg: 'WC 778 BEL', status: 'AVAILABLE', lat: -33.8912, lng: 18.6234, branch: 1 },
  { name: 'Vusi Maseko',        vehicleType: 'truck',     vehicleReg: 'MP 445 NLS', status: 'ON_ROUTE',  lat: -25.9234, lng: 29.2345, branch: 3 },  // N4 east
  { name: 'Ayanda Khumalo',     vehicleType: 'truck',     vehicleReg: 'KZN 223 RCB', status: 'ON_ROUTE', lat: -27.7654, lng: 30.1234, branch: 2 },  // N3
  { name: 'Tumelo Phetla',      vehicleType: 'van',       vehicleReg: 'GP 990 JHB', status: 'AVAILABLE', lat: -26.1890, lng: 28.0234, branch: 0 },
];

// Realistic client names representing SA logistics customers
const CLIENTS = [
  { name: 'Shoprite Holdings',       tradingName: 'Shoprite',          billingType: 'CONTRACT', paymentTerms: 30, email: 'logistics@shoprite.co.za' },
  { name: 'Bidvest Group',           tradingName: 'Bidvest',           billingType: 'CONTRACT', paymentTerms: 30, email: 'transport@bidvest.co.za' },
  { name: 'Tiger Brands',            tradingName: 'Tiger Brands',      billingType: 'CONTRACT', paymentTerms: 30, email: 'supply@tigerbrands.co.za' },
  { name: 'Woolworths SA',           tradingName: 'Woolworths',        billingType: 'CONTRACT', paymentTerms: 14, email: 'freight@woolworths.co.za' },
  { name: 'Pioneer Foods',           tradingName: 'Pioneer Foods',     billingType: 'CONTRACT', paymentTerms: 30, email: 'logistics@pioneerfoods.co.za' },
  { name: 'Massmart Holdings',       tradingName: 'Massmart',          billingType: 'CONTRACT', paymentTerms: 30, email: 'distribution@massmart.co.za' },
  { name: 'RCL Foods',               tradingName: 'RCL Foods',         billingType: 'CONTRACT', paymentTerms: 30, email: 'freight@rclfoods.co.za' },
  { name: 'Distell Group',           tradingName: 'Distell',           billingType: 'PREPAID',  paymentTerms: 7,  email: 'logistics@distell.co.za' },
  { name: 'Mpact Limited',           tradingName: 'Mpact',             billingType: 'CONTRACT', paymentTerms: 30, email: 'transport@mpact.co.za' },
  { name: 'Clover Industries',       tradingName: 'Clover',            billingType: 'CONTRACT', paymentTerms: 14, email: 'coldchain@clover.co.za' },
  { name: 'Nampak Ltd',              tradingName: 'Nampak',            billingType: 'CONTRACT', paymentTerms: 30, email: 'supply@nampak.co.za' },
  { name: 'MJ World Logistics',      tradingName: 'MJ World',          billingType: 'COD',      paymentTerms: 0,  email: 'ops@mjworld.co.za' },
  { name: 'Unitrans Supply Chain',   tradingName: 'Unitrans',          billingType: 'CONTRACT', paymentTerms: 30, email: 'planning@unitrans.co.za' },
  { name: 'Barloworld Logistics',    tradingName: 'Barloworld',        billingType: 'CONTRACT', paymentTerms: 30, email: 'fleet@barloworld.co.za' },
  { name: 'Cargo Carriers Ltd',      tradingName: 'Cargo Carriers',    billingType: 'CONTRACT', paymentTerms: 30, email: 'dispatch@cargocarriers.co.za' },
];

// SA Route corridors for realistic addresses
const ROUTES = {
  jhb_cpt: { from: '14 Freight Road, City Deep, Johannesburg', to: '22 Marine Drive, Paarden Eiland, Cape Town', fromLat: -26.2185, fromLng: 28.0675, toLat: -33.9062, toLng: 18.5010 },
  jhb_dbn: { from: '14 Freight Road, City Deep, Johannesburg', to: '8 Bayhead Road, Durban Port, Durban', fromLat: -26.2185, fromLng: 28.0675, toLat: -29.8833, toLng: 31.0350 },
  jhb_pta: { from: '14 Freight Road, City Deep, Johannesburg', to: '45 Struben Street, Pretoria Central', fromLat: -26.2185, fromLng: 28.0675, toLat: -25.7461, toLng: 28.1881 },
  cpt_jhb: { from: '22 Marine Drive, Paarden Eiland, Cape Town', to: '14 Freight Road, City Deep, Johannesburg', fromLat: -33.9062, fromLng: 18.5010, toLat: -26.2185, toLng: 28.0675 },
  dbn_jhb: { from: '8 Bayhead Road, Durban Port, Durban', to: '14 Freight Road, City Deep, Johannesburg', fromLat: -29.8833, fromLng: 31.0350, toLat: -26.2185, toLng: 28.0675 },
  jhb_bfn: { from: '14 Freight Road, City Deep, Johannesburg', to: '12 Hoffman Square, Bloemfontein', fromLat: -26.2185, fromLng: 28.0675, toLat: -29.0852, toLng: 26.1596 },
  jhb_musina: { from: '14 Freight Road, City Deep, Johannesburg', to: 'Beitbridge Border Post, Musina', fromLat: -26.2185, fromLng: 28.0675, toLat: -22.3285, toLng: 29.9869 },
  jhb_maputo: { from: '14 Freight Road, City Deep, Johannesburg', to: 'Lebombo Border Post, Komatipoort', fromLat: -26.2185, fromLng: 28.0675, toLat: -25.4321, toLng: 31.9876 },
};

const DESCRIPTIONS = [
  'FMCG - Mixed Pallets', 'Electronics - Fragile', 'Auto Parts - Heavy', 'Pharmaceutical - Temperature Controlled',
  'Construction Materials', 'Retail Clothing', 'Agricultural Inputs', 'Mining Equipment',
  'Fresh Produce - Cold Chain', 'Beverages - Palletised', 'Paper Products', 'Chemical - Hazardous',
  'Furniture - Oversized', 'Medical Supplies', 'Textile Rolls', 'Packaging Materials',
];

// ── Helpers ────────────────────────────────────────────────────────────────
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function hoursAgo(n) { const d = new Date(); d.setHours(d.getHours() - n); return d; }
function phone() { return `+27 ${randInt(60, 89)} ${randInt(100, 999)} ${randInt(1000, 9999)}`; }
function waybillNum(n) { return `CHF-${String(n).padStart(5, '0')}`; }

async function main() {
  console.log('\n=== FlowOps CHF Global Demo Seed ===');
  console.log('Building world-class demo data...\n');

  // Find demo company
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
      status: d.status, phone: phone(), email: d.name.toLowerCase().replace(' ', '.') + '@chfglobal.co.za',
      lastLat: d.lat, lastLng: d.lng, lastSeen: hoursAgo(randInt(0, 2)),
      isActive: true,
    }});
    drivers.push(created);
  }
  console.log(`  Created ${drivers.length} drivers (${drivers.filter(d => d.status === 'ON_ROUTE').length} active on road)`);

  // ── 3. CLIENTS ───────────────────────────────────────────────────────────
  const clients = [];
  for (const c of CLIENTS) {
    const created = await prisma.client.create({ data: {
      companyId: cid, name: c.name, tradingName: c.tradingName,
      email: c.email, phone: phone(), billingType: c.billingType,
      paymentTerms: c.paymentTerms, address: rand(['Johannesburg', 'Cape Town', 'Durban', 'Pretoria']),
    }});
    clients.push(created);
  }
  console.log(`  Created ${clients.length} clients`);

  // ── 4. RATE CARDS ────────────────────────────────────────────────────────
  const rateCardDefs = [
    { name: 'JHB → CPT Standard',    fromZone: 'Gauteng',    toZone: 'Western Cape',   minWeight: 0,  maxWeight: 100,  basePrice: 2500, pricePerKg: 15 },
    { name: 'JHB → CPT Express',     fromZone: 'Gauteng',    toZone: 'Western Cape',   minWeight: 0,  maxWeight: 50,   basePrice: 4200, pricePerKg: 28 },
    { name: 'JHB → DBN Standard',    fromZone: 'Gauteng',    toZone: 'KwaZulu-Natal',  minWeight: 0,  maxWeight: 100,  basePrice: 1800, pricePerKg: 12 },
    { name: 'JHB → PTA Same Day',    fromZone: 'Gauteng',    toZone: 'Gauteng',        minWeight: 0,  maxWeight: 30,   basePrice: 450,  pricePerKg: 8  },
    { name: 'JHB → BFN Standard',    fromZone: 'Gauteng',    toZone: 'Free State',     minWeight: 0,  maxWeight: 100,  basePrice: 1400, pricePerKg: 10 },
    { name: 'Cross-Border: Beitbridge', fromZone: 'Gauteng', toZone: 'Zimbabwe',       minWeight: 0,  maxWeight: 200,  basePrice: 8500, pricePerKg: 22 },
    { name: 'Cross-Border: Lebombo',  fromZone: 'Gauteng',   toZone: 'Mozambique',     minWeight: 0,  maxWeight: 200,  basePrice: 6800, pricePerKg: 18 },
    { name: 'CPT → JHB Standard',    fromZone: 'Western Cape', toZone: 'Gauteng',      minWeight: 0,  maxWeight: 100,  basePrice: 2500, pricePerKg: 15 },
  ];
  for (const rc of rateCardDefs) {
    await prisma.rateCard.create({ data: { companyId: cid, ...rc, currency: 'ZAR' } });
  }
  console.log(`  Created ${rateCardDefs.length} rate cards`);

  // ── 5. WAYBILLS (80+) ────────────────────────────────────────────────────
  // Distribution: gives a realistic dashboard — most delivered, some active, some pending
  const waybillDistribution = [
    // 30 DELIVERED (shows history and good KPIs)
    ...Array(30).fill('DELIVERED'),
    // 12 IN_TRANSIT (shows active operations)
    ...Array(12).fill('IN_TRANSIT'),
    // 8 OUT_FOR_DELIVERY (imminent deliveries)
    ...Array(8).fill('OUT_FOR_DELIVERY'),
    // 10 PENDING (incoming work)
    ...Array(10).fill('PENDING'),
    // 6 COLLECTED (at hub)
    ...Array(6).fill('COLLECTED'),
    // 4 AT_ORIGIN_HUB
    ...Array(4).fill('AT_ORIGIN_HUB'),
    // 3 AT_DESTINATION_HUB
    ...Array(3).fill('AT_DESTINATION_HUB'),
    // 4 FAILED_DELIVERY (shows exception handling)
    ...Array(4).fill('FAILED_DELIVERY'),
    // 3 CANCELLED
    ...Array(3).fill('CANCELLED'),
  ];

  const routeKeys = Object.keys(ROUTES);
  const waybills = [];

  for (let i = 0; i < waybillDistribution.length; i++) {
    const status = waybillDistribution[i];
    const route = ROUTES[rand(routeKeys)];
    const client = rand(clients);
    const weight = parseFloat((Math.random() * 80 + 2).toFixed(1));
    const totalAmount = parseFloat((weight * randInt(12, 35) + randInt(500, 3000)).toFixed(2));
    const createdAt = daysAgo(randInt(0, 30));
    
    let podDeliveredAt = null;
    let codAmount = null;
    let riskLevel = null;
    
    if (status === 'DELIVERED') {
      podDeliveredAt = daysAgo(randInt(0, 14));
    }
    if (i % 5 === 0) {
      codAmount = parseFloat((totalAmount * 0.3).toFixed(2));
    }
    if (status === 'FAILED_DELIVERY' || (status === 'IN_TRANSIT' && i % 7 === 0)) {
      riskLevel = rand(['HIGH', 'CRITICAL']);
    }

    const wb = await prisma.waybill.create({ data: {
      companyId: cid,
      trackingNumber: waybillNum(i + 1),
      status,
      senderName: client.tradingName,
      senderPhone: phone(),
      senderAddress: route.from,
      senderLat: route.fromLat,
      senderLng: route.fromLng,
      recipientName: rand(CLIENTS).tradingName + ' - ' + rand(['Warehouse', 'DC', 'Store', 'Head Office', 'Factory']),
      recipientPhone: phone(),
      recipientAddress: route.to,
      recipientLat: route.toLat,
      recipientLng: route.toLng,
      weight,
      description: rand(DESCRIPTIONS),
      totalAmount,
      codAmount,
      podDeliveredAt,
      riskLevel,
      createdAt,
      updatedAt: new Date(),
    }});
    waybills.push(wb);
  }
  console.log(`  Created ${waybills.length} waybills (${waybillDistribution.filter(s => s === 'IN_TRANSIT').length} in transit, ${waybillDistribution.filter(s => s === 'DELIVERED').length} delivered)`);

  // ── 6. SHIPMENTS (active deliveries with GPS) ─────────────────────────────
  const activeWaybills = waybills.filter(w => ['IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(w.status));
  const onRouteDrivers = drivers.filter(d => d.status === 'ON_ROUTE');
  let shipmentCount = 0;

  for (let i = 0; i < Math.min(activeWaybills.length, 12); i++) {
    const wb = activeWaybills[i];
    const driver = onRouteDrivers[i % onRouteDrivers.length];
    await prisma.shipment.create({ data: {
      companyId: cid,
      waybillId: wb.id,
      driverId: driver.id,
      status: 'IN_TRANSIT',
      currentLat: driver.lastLat + (Math.random() * 0.02 - 0.01),
      currentLng: driver.lastLng + (Math.random() * 0.02 - 0.01),
      estimatedDelivery: daysFromNow(randInt(0, 2)),
      createdAt: hoursAgo(randInt(1, 24)),
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
    await prisma.collection.create({ data: {
      companyId: cid,
      status: colStatuses[i],
      clientName: client.tradingName,
      clientPhone: phone(),
      clientEmail: client.email,
      pickupAddress: rand([loc.address, '88 Main Road, Sandton', '15 Commissioner St, JHB', '34 Beach Road, Durban', '7 Voortrekker Road, Cape Town']),
      pickupLat: loc.lat + (Math.random() * 0.05 - 0.025),
      pickupLng: loc.lng + (Math.random() * 0.05 - 0.025),
      notes: rand(['Fragile - handle with care', '3 pallets ready at dock', 'Gate code: 4532#', 'Ask for warehouse manager', 'Temperature controlled', null]),
      scheduledAt: daysFromNow(randInt(0, 2)),
      driverId: driver?.id ?? null,
      createdAt: daysAgo(randInt(0, 3)),
      updatedAt: new Date(),
    }});
  }
  console.log(`  Created ${colStatuses.length} collections`);

  // ── 8. INVOICES (R450K+ monthly revenue) ──────────────────────────────────
  const invoiceDefs = [
    { client: 0,  total: 85000,  status: 'PAID',    paidAt: daysAgo(5) },
    { client: 1,  total: 62500,  status: 'PAID',    paidAt: daysAgo(3) },
    { client: 2,  total: 44800,  status: 'SENT',    dueDate: daysFromNow(14) },
    { client: 3,  total: 38200,  status: 'SENT',    dueDate: daysFromNow(7) },
    { client: 4,  total: 31500,  status: 'PAID',    paidAt: daysAgo(12) },
    { client: 5,  total: 56700,  status: 'OVERDUE', dueDate: daysAgo(8) },
    { client: 6,  total: 28900,  status: 'SENT',    dueDate: daysFromNow(21) },
    { client: 7,  total: 19500,  status: 'PAID',    paidAt: daysAgo(1) },
    { client: 8,  total: 42300,  status: 'SENT',    dueDate: daysFromNow(10) },
    { client: 9,  total: 35600,  status: 'OVERDUE', dueDate: daysAgo(3) },
    { client: 10, total: 22100,  status: 'DRAFT',   dueDate: daysFromNow(30) },
    { client: 11, total: 15800,  status: 'PAID',    paidAt: daysAgo(7) },
  ];

  for (let i = 0; i < invoiceDefs.length; i++) {
    const def = invoiceDefs[i];
    const client = clients[def.client];
    const subtotal = parseFloat((def.total / 1.15).toFixed(2));
    const tax = parseFloat((def.total - subtotal).toFixed(2));
    const numItems = randInt(3, 8);
    const itemTotal = subtotal / numItems;

    await prisma.invoice.create({ data: {
      companyId: cid,
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
      notes: 'Net 30 payment terms. EFT to FNB 627-432-8891.',
      createdAt: daysAgo(randInt(15, 30)),
      updatedAt: new Date(),
      items: { create: Array.from({ length: numItems }, (_, j) => ({
        description: `Freight Services - ${rand(['JHB-CPT', 'JHB-DBN', 'JHB-PTA', 'CPT-JHB', 'Cross-Border'])} - Week ${j + 1}`,
        quantity: randInt(5, 25),
        unitPrice: parseFloat((itemTotal / randInt(5, 25)).toFixed(2)),
        total: parseFloat(itemTotal.toFixed(2)),
      }))},
    }});
  }
  const totalRevenue = invoiceDefs.reduce((s, d) => s + d.total, 0);
  console.log(`  Created ${invoiceDefs.length} invoices (R${(totalRevenue / 1000).toFixed(0)}K total revenue)`);

  // ── 9. QUOTES (pipeline) ──────────────────────────────────────────────────
  const quoteDefs = [
    { from: 'JHB', to: 'Cape Town', weight: 45, price: 3175, accepted: true },
    { from: 'JHB', to: 'Durban',    weight: 22, price: 2064, accepted: true },
    { from: 'JHB', to: 'Beitbridge', weight: 80, price: 10260, accepted: false },
    { from: 'Cape Town', to: 'JHB', weight: 35, price: 3025, accepted: false },
    { from: 'JHB', to: 'Maputo',    weight: 60, price: 7880, accepted: false },
    { from: 'JHB', to: 'Bloemfontein', weight: 15, price: 1550, accepted: true },
  ];
  for (const q of quoteDefs) {
    await prisma.quote.create({ data: {
      companyId: cid,
      fromAddress: q.from,
      toAddress: q.to,
      clientName: rand(clients).tradingName,
      weight: q.weight,
      price: q.price,
      currency: 'ZAR',
      breakdown: { base: 2500, perKg: (q.price - 2500) / q.weight, total: q.price },
      accepted: q.accepted,
      expiresAt: q.accepted ? daysAgo(2) : daysFromNow(5),
      createdAt: daysAgo(randInt(1, 10)),
    }});
  }
  console.log(`  Created ${quoteDefs.length} quotes (${quoteDefs.filter(q => q.accepted).length} accepted)`);

  // ── 10. AI EVENTS (Intelligence Layer) ────────────────────────────────────
  const aiEvents = [
    { type: 'ROUTE_DEVIATION', title: 'Route Deviation: N1 South', body: 'Driver Thandi Molefe deviated 18km from assigned route near Vaal River. Possible roadblock or accident. ETA impact: +45 min.', severity: 'critical' },
    { type: 'SLA_BREACH_RISK', title: 'SLA Risk: CHF-00034 (Woolworths)', body: 'Shipment CHF-00034 has been in transit for 28 hours. Woolworths SLA is 30 hours JHB-CPT. Immediate escalation required.', severity: 'critical' },
    { type: 'PAYMENT_RISK', title: 'Overdue: Massmart R56,700', body: 'Invoice INV-2026-0006 for R56,700 is 8 days overdue. Client has not responded to 2 automated reminders. Escalate to collections team.', severity: 'critical' },
    { type: 'CAPACITY_ALERT', title: 'Durban Hub: Capacity Warning', body: 'Durban Operations has 8 pending collections with only 2 available drivers. Recommend re-allocating 1 driver from Johannesburg Hub.', severity: 'warning' },
    { type: 'DELIVERY_SUCCESS', title: 'Monthly Target: 85% Achieved', body: 'On-time delivery rate has reached 94.2% this month — exceeding the 85% target. 247 of 262 deliveries completed within SLA.', severity: 'info' },
    { type: 'FUEL_ALERT', title: 'Diesel Price Alert: +R2.73/l in September', body: 'FESARTA & DoE data indicates diesel will increase by R2.73/l from 3 September. Current route costing will need adjustment. Estimated monthly impact: +R89,000 across fleet.', severity: 'warning' },
    { type: 'BORDER_DELAY', title: 'Beitbridge: 12-Hour Queue Detected', body: 'FESARTA reports 12-hour average queue at Beitbridge northbound. Drivers CHF-00067 and CHF-00072 are 4 hours from the border. Recommend holding at Musina overnight.', severity: 'warning' },
    { type: 'CORRIDOR_INTEL', title: 'Botswana Pre-Clearance Now Required', body: 'Botswana customs now requires all declarations to be pre-cleared before truck arrival at Trans-Kalahari border. 3 shipments in pipeline affected. Auto-generating pre-clearance docs.', severity: 'warning' },
    { type: 'DRIVER_PERFORMANCE', title: 'Driver Rating: Sipho Dlamini 4.9/5', body: 'Sipho completed 34 deliveries this month with 0 failed attempts and 4.9 average customer rating. Recommend for premium client assignments.', severity: 'info' },
    { type: 'COD_RECONCILIATION', title: 'COD Mismatch: R2,340 Unreconciled', body: '3 COD collections from yesterday have not been banked. Total outstanding: R2,340. Drivers: Kagiso Modise (R1,200), Bongani Zulu (R1,140).', severity: 'warning' },
  ];
  for (const e of aiEvents) {
    await prisma.aiEvent.create({ data: { companyId: cid, ...e, resolved: e.severity === 'info', createdAt: daysAgo(randInt(0, 3)) } });
  }
  console.log(`  Created ${aiEvents.length} AI events (${aiEvents.filter(e => e.severity === 'critical').length} critical)`);

  // ── 11. NOTIFICATIONS ─────────────────────────────────────────────────────
  const notifs = [
    { title: 'New Collection Request', body: 'Shoprite has requested pickup of 3 pallets from Sandton DC.', type: 'info' },
    { title: 'Driver Checked In', body: 'Sipho Dlamini checked in at Johannesburg Hub at 06:15.', type: 'success' },
    { title: 'Invoice Paid', body: 'Bidvest Group paid INV-2026-0002 (R62,500) via EFT.', type: 'success' },
    { title: 'Delivery Completed', body: 'CHF-00028 delivered to Woolworths DC, Cape Town. POD signed.', type: 'success' },
    { title: 'SLA Warning', body: 'CHF-00034 approaching SLA breach window. 2 hours remaining.', type: 'warning' },
    { title: 'New Quote Accepted', body: 'Tiger Brands accepted quote for JHB-DBN (22kg, R2,064).', type: 'success' },
  ];
  for (const n of notifs) {
    await prisma.notification.create({ data: { companyId: cid, ...n, createdAt: hoursAgo(randInt(0, 12)) } });
  }
  console.log(`  Created ${notifs.length} notifications`);

  // ── 12. WHATSAPP THREADS ──────────────────────────────────────────────────
  const waThreads = [
    { name: 'Shoprite Logistics', messages: [
      { content: 'Hi, we have 3 pallets ready for collection at Sandton DC. Gate 4.', direction: 'inbound' },
      { content: 'Confirmed. Driver Sipho Dlamini dispatched. ETA 45 minutes. Tracking: CHF-00042', direction: 'outbound' },
      { content: 'Perfect, thank you. Gate code is 7721#', direction: 'inbound' },
    ]},
    { name: 'Tiger Brands Supply', messages: [
      { content: 'What is the status of our shipment CHF-00034?', direction: 'inbound' },
      { content: 'CHF-00034 is currently in transit on the N1. Driver: Zanele Ndlovu. ETA: Tomorrow 08:00. Live tracking link sent to your email.', direction: 'outbound' },
      { content: 'Thanks. Please ensure temperature stays below 8C.', direction: 'inbound' },
      { content: 'Confirmed. Temperature monitoring active. Current reading: 4.2C. Will alert if threshold exceeded.', direction: 'outbound' },
    ]},
    { name: 'Woolworths Freight', messages: [
      { content: 'Invoice query - INV-2026-0004 shows different rate than agreed. Can you check?', direction: 'inbound' },
      { content: 'Checking now. The rate applied was our standard JHB-CPT express (R28/kg). Your contract rate is R24/kg. Issuing credit note for the difference.', direction: 'outbound' },
      { content: 'Appreciated. Please send updated invoice.', direction: 'inbound' },
    ]},
    { name: 'Massmart Distribution', messages: [
      { content: 'We need to schedule 5 collections for next Monday from our Midrand DC.', direction: 'inbound' },
      { content: 'Noted. I have allocated 2 trucks for Monday morning. Collections scheduled for 06:00-10:00. Confirmation sent to your ops team.', direction: 'outbound' },
    ]},
  ];
  for (const t of waThreads) {
    const thread = await prisma.whatsAppThread.create({ data: {
      companyId: cid, phone: phone(), name: t.name, lastMessageAt: new Date(),
    }});
    for (let i = 0; i < t.messages.length; i++) {
      await prisma.whatsAppMessage.create({ data: {
        threadId: thread.id, content: t.messages[i].content,
        direction: t.messages[i].direction, status: 'delivered',
        createdAt: hoursAgo(t.messages.length - i),
      }});
    }
  }
  console.log(`  Created ${waThreads.length} WhatsApp conversation threads`);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(64));
  console.log('  DEMO READY: FlowOps CHF Global Presentation Data');
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
  console.log(`  Active Drivers on Road: ${drivers.filter(d => d.status === 'ON_ROUTE').length}`);
  console.log(`  On-Time Delivery Rate: ~94% (based on delivered waybills)`);
  console.log('='.repeat(64));
  console.log('\n  Login: app.flowop.work');
  console.log('  User:  admin@demo.flowops.local');
  console.log('  Pass:  Demo@Admin123!\n');
  console.log('  Dashboard will now show a BUSY, LIVE logistics operation.');
  console.log('  Ready for Tuesday demo with Neville (CHF Global).\n');
}

main()
  .catch((e) => { console.error('FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
