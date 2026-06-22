'use strict';
/**
 * FlowOps Stress Test Seed
 * Creates: 100 companies | 700 workers | 2000 drivers | 10000 collections
 * Run: node scripts/stress_seed.js  (from ~/FlowOps-Logistics/backend)
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

// ── Constants ─────────────────────────────────────────────────────────────
const BATCH = 50;        // rows per createMany batch
const COMPANIES = 100;
const WORKERS_PER_CO = 7;   // one per role → 700 total
const DRIVERS_PER_CO = 20;  // 20 × 100 → 2 000 total
const COLL_PER_CO    = 100; // 100 × 100 → 10 000 total

// ── SA data ───────────────────────────────────────────────────────────────
const CITIES = [
  { name:'Johannesburg',  lat:-26.2041, lng:28.0473 },
  { name:'Cape Town',     lat:-33.9249, lng:18.4241 },
  { name:'Durban',        lat:-29.8587, lng:31.0218 },
  { name:'Pretoria',      lat:-25.7479, lng:28.2293 },
  { name:'Port Elizabeth',lat:-33.9608, lng:25.6022 },
  { name:'Bloemfontein',  lat:-29.1210, lng:26.2150 },
  { name:'East London',   lat:-33.0153, lng:27.9116 },
  { name:'Nelspruit',     lat:-25.4753, lng:30.9694 },
  { name:'Polokwane',     lat:-23.9045, lng:29.4689 },
  { name:'Kimberley',     lat:-28.7323, lng:24.7623 },
];

const CO_TYPES = ['Logistics','Couriers','Freight','Express','Delivery','Transport','Distribution','Supply Chain'];
const CO_PREFIXES = [
  'Apex','Blue Sky','Cape','Delta','Eagle','Fast','Gold','Horizon',
  'Icon','Jet','Kite','Link','Metro','Nexus','Orbit','Peak',
  'Quick','Rapid','Swift','Tiger','Ultra','Vantage','Wave','Xcel',
  'Yellow','Zenith','Ace','Bold','Clear','Drive','Elite','Force',
  'Green','Hub','Inland','Jump','Key','Lux','Mint','Nord',
  'Open','Plus','Prime','Quad','Red','Star','Top','Union',
  'Vast','Win','X-Press','Your','Zone','Alpha','Beta','Core',
  'Data','Echo','Flex','Go','Hyper','Inno','Just','King',
  'Loop','Main','Net','One','Power','Quest','Run','Safe',
  'Tech','Up','Via','Work','Xtreme','You','Zeal','Bright',
  'Cloud','Dura','Extra','Fresh','Good','High','Info','Jazz',
  'Keen','Light','Move','New','Over','Precise','Quality','Rise',
  'South','Trans','Unite','Value','Wide','Xtra','Yield','Zoom',
];

const STREETS = [
  'Jan Smuts Ave','Oxford Rd','Empire Rd','William Nicol Dr','Rivonia Rd',
  'Long Street','Adderley Street','Main Road','Beach Road','Victoria Street',
  'Smith Street','West Street','Marine Parade','Aliwal Street','Bram Fischer',
  'Church Square','Paul Kruger Street','Vermeulen Street','Proes Street',
  'Russell Street','Voortrekker Road','Adderley Street','Buitenkant Street',
];

const VEHICLE_TYPES = ['motorbike','car','van','bakkie','truck'];
const DRIVER_STATUSES = ['AVAILABLE','AVAILABLE','AVAILABLE','ON_ROUTE','ON_ROUTE','OFFLINE'];
const COLL_STATUSES = ['PENDING','PENDING','PENDING','ASSIGNED','ASSIGNED','IN_PROGRESS','IN_PROGRESS','COLLECTED','FAILED','CANCELLED'];
const PLANS = ['starter','starter','starter','professional','professional','enterprise'];

const ROLES = ['ADMIN','MANAGER','DISPATCH','WAREHOUSE','AGENT','DRIVER','VIEWER'];

// ── Helpers ───────────────────────────────────────────────────────────────
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const jitter = (v, range=0.05) => v + (Math.random() - 0.5) * range;
const phone = () => `+27${randInt(60,89)}${String(randInt(1000000,9999999))}`;
const slug = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
const pad = (n,w) => String(n).padStart(w,'0');

async function batch(arr, size, fn) {
  for (let i = 0; i < arr.length; i += size) {
    await fn(arr.slice(i, i + size), i);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FlowOps Stress-Test Seed');
  console.log(`  Target: ${COMPANIES} companies | ${COMPANIES*WORKERS_PER_CO} workers | `
            + `${COMPANIES*DRIVERS_PER_CO} drivers | ${COMPANIES*COLL_PER_CO} collections`);
  console.log('═══════════════════════════════════════════════════════════');
  const t0 = Date.now();

  // ── 1. Pre-hash password (do it ONCE) ──────────────────────────────────
  process.stdout.write('\n[1/4] Pre-hashing shared password... ');
  const passwordHash = await bcrypt.hash('Stress@Test2026!', 10);
  console.log('done');

  // ── 2. Create 100 companies ────────────────────────────────────────────
  process.stdout.write('[2/4] Creating 100 companies... ');
  const coRows = [];
  const usedNames = new Set();
  for (let i = 0; i < COMPANIES; i++) {
    let name;
    do { name = `${CO_PREFIXES[i]} ${rand(CO_TYPES)}`; } while (usedNames.has(name));
    usedNames.add(name);
    const city = CITIES[i % CITIES.length];
    coRows.push({
      name,
      tradingName: name,
      email: `admin@${slug(name)}.co.za`,
      phone: phone(),
      address: `${randInt(1,999)} ${rand(STREETS)}, ${city.name}`,
      city: city.name,
      country: 'ZA',
      plan: rand(PLANS),
      isActive: true,
      primaryColor: `#${Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')}`,
      brandName: name,
      slaBreachMinutes: rand([30,60,90,120]),
    });
  }
  await prisma.company.createMany({ data: coRows, skipDuplicates: true });
  const companies = await prisma.company.findMany({ where: { name: { in: coRows.map(r=>r.name) } }, select: { id:true, name:true, city:true } });
  console.log(`${companies.length} created`);

  // ── 3. Create workers (7 per company = 700) ────────────────────────────
  process.stdout.write('[3/4] Creating workers (7 × 100 = 700)... ');
  const userRows = [];
  for (const co of companies) {
    const city = CITIES.find(c => c.name === co.city) || CITIES[0];
    ROLES.forEach((role, ri) => {
      const uSlug = slug(co.name);
      const roleName = role.toLowerCase();
      userRows.push({
        email: `${roleName}.${uSlug.slice(0,12)}.${co.id.slice(-4)}@stress.flowops.local`,
        name:  `${role.charAt(0)+role.slice(1).toLowerCase()} - ${co.name.slice(0,20)}`,
        passwordHash,
        role,
        isActive: true,
        companyId: co.id,
      });
    });
  }
  let userCount = 0;
  await batch(userRows, BATCH*7, async slice => {
    await prisma.user.createMany({ data: slice, skipDuplicates: true });
    userCount += slice.length;
  });
  console.log(`${userCount} created`);

  // ── 4. Create drivers (20 per company = 2 000) ─────────────────────────
  process.stdout.write('[4/5] Creating drivers (20 × 100 = 2 000)... ');
  const driverRows = [];
  const driverVehicleRegs = new Set();
  for (const co of companies) {
    const city = CITIES.find(c => c.name === co.city) || CITIES[0];
    for (let d = 0; d < DRIVERS_PER_CO; d++) {
      let reg;
      do { reg = `${rand(['GP','WC','KZN','NW','MP','LP','EC','NC','FS'])}${pad(randInt(10000,99999),5)}`; }
      while (driverVehicleRegs.has(reg));
      driverVehicleRegs.add(reg);
      const status = rand(DRIVER_STATUSES);
      driverRows.push({
        name: `Driver-${co.id.slice(-4)}-${d+1}`,
        phone: phone(),
        vehicleType: rand(VEHICLE_TYPES),
        vehicleReg: reg,
        status,
        companyId: co.id,
        isActive: true,
        lastSeen: new Date(),
        lastLat: jitter(city.lat),
        lastLng: jitter(city.lng),
      });
    }
  }
  let driverCount = 0;
  await batch(driverRows, BATCH, async slice => {
    await prisma.driver.createMany({ data: slice, skipDuplicates: true });
    driverCount += slice.length;
  });
  // Fetch driver IDs per company for collections
  const driversByCompany = {};
  const allDrivers = await prisma.driver.findMany({ where: { companyId: { in: companies.map(c=>c.id) } }, select: { id:true, companyId:true } });
  for (const dr of allDrivers) {
    if (!driversByCompany[dr.companyId]) driversByCompany[dr.companyId] = [];
    driversByCompany[dr.companyId].push(dr.id);
  }
  console.log(`${driverCount} created`);

  // ── 5. Create collections (100 per company = 10 000) ───────────────────
  process.stdout.write('[5/5] Creating collections (100 × 100 = 10 000)... ');
  const collRows = [];
  for (const co of companies) {
    const city = CITIES.find(c => c.name === co.city) || CITIES[0];
    const drivers = driversByCompany[co.id] || [];
    for (let k = 0; k < COLL_PER_CO; k++) {
      const status = rand(COLL_STATUSES);
      const needsDriver = ['ASSIGNED','IN_PROGRESS','COLLECTED'].includes(status);
      const driverId = (needsDriver && drivers.length) ? rand(drivers) : null;
      const daysAgo = randInt(0, 30);
      const created = new Date(Date.now() - daysAgo * 86400000);
      collRows.push({
        companyId: co.id,
        clientName: `Client-${co.id.slice(-4)}-${k+1}`,
        clientPhone: phone(),
        clientEmail: `client${k+1}@${slug(co.name).slice(0,10)}.co.za`,
        pickupAddress: `${randInt(1,999)} ${rand(STREETS)}, ${city.name}`,
        pickupLat: jitter(city.lat),
        pickupLng: jitter(city.lng),
        notes: k%5===0 ? 'Fragile — handle with care' : k%7===0 ? 'Call before arriving' : null,
        status,
        driverId,
        createdAt: created,
        updatedAt: new Date(),
        scheduledAt: new Date(created.getTime() + randInt(3600000, 86400000)),
      });
    }
  }
  let collCount = 0;
  await batch(collRows, BATCH*2, async slice => {
    await prisma.collection.createMany({ data: slice, skipDuplicates: true });
    collCount += slice.length;
  });
  console.log(`${collCount} created`);

  // ── Summary ───────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const totals = await Promise.all([
    prisma.company.count(),
    prisma.user.count(),
    prisma.driver.count(),
    prisma.collection.count(),
  ]);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Stress-test seed COMPLETE');
  console.log(`  Time: ${elapsed}s`);
  console.log('─────────────────────────────────────────────────────────');
  console.log(`  Companies  : ${totals[0].toLocaleString()}`);
  console.log(`  Users      : ${totals[1].toLocaleString()}`);
  console.log(`  Drivers    : ${totals[2].toLocaleString()}`);
  console.log(`  Collections: ${totals[3].toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Login to any stress-test company:');
  console.log('  Email format: admin.<companyname>.<id>@stress.flowops.local');
  console.log('  Password: Stress@Test2026!');
  console.log('');
}

main()
  .catch(e => { console.error('\nFAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
