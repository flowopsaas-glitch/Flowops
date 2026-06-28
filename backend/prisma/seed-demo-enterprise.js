/**
 * Enterprise demo tenant seed.
 *
 * Creates a SEPARATE tenant ("FlowOps Demo Global") on the **enterprise** plan,
 * with its own per-department logins on the @demo-ent.flowops.local domain — so
 * the full Enterprise experience (Freight Forwarding, Customs/SARS EDI, CLAW
 * Autopilot, SSO, Courier Management, Carriers & Procurement) is visible without
 * mixing it into the Professional demo tenant.
 *
 *   node prisma/seed-demo-enterprise.js
 *
 * Idempotent: skips users that already exist for this company.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const COMPANY = {
  name:         'FlowOps Demo Global',
  tradingName:  'FlowOps Demo Global',
  email:        'admin@demo-ent.flowops.local',
  phone:        '+27 11 000 1111',
  address:      '1 Harbour View, Durban',
  city:         'Durban',
  country:      'ZA',
  plan:         'enterprise',
  isActive:     true,
  primaryColor: '#6366f1',
  brandName:    'FlowOps Demo Global',
  slaBreachMinutes: 60,
  whatsappNumber: '+27 82 000 1111',
};

// Full permission set — used by admin-tier personas.
const FULL = {
  dashboard: true, collections: true, shipments: true, waybills: true,
  waybillInbox: true, clients: true, podDeliveries: true, driverDispatch: true,
  branches: true, manifests: true, whatsapp: true, email: true,
  rateCards: true, billingBatches: true, invoices: true, quotes: true,
  creditControl: true, risksExceptions: true, notifications: true,
  aiControlTower: true, highRiskQueue: true, usersRoles: true, settings: true,
};

// ── Department users (Enterprise tenant) ───────────────────────────────────
const USERS = [
  {
    name: 'Enterprise Admin', email: 'admin@demo-ent.flowops.local',
    password: 'Demo@Admin123!', role: 'ADMIN', department: 'Administration',
    permissions: { ...FULL },
  },
  {
    name: 'Group Management', email: 'companyadmin@demo-ent.flowops.local',
    password: 'Demo@CompAdmin123!', role: 'COMPANY_ADMIN', department: 'Management',
    permissions: { ...FULL },
  },
  {
    // Freight Forwarding nav is admin-gated, so the Clearing & Forwarding desk
    // lead is an admin-tier role to see the import/export + customs modules.
    name: 'Forwarding & Customs Lead', email: 'forwarding@demo-ent.flowops.local',
    password: 'Demo@Forward123!', role: 'COMPANY_ADMIN', department: 'Clearing & Forwarding',
    permissions: { ...FULL },
  },
  {
    name: 'Procurement Officer', email: 'procurement@demo-ent.flowops.local',
    password: 'Demo@Procure123!', role: 'MANAGER', department: 'Procurement & Carriers',
    permissions: {
      ...FULL, billingBatches: false, invoices: false, creditControl: false,
      usersRoles: false, settings: false, aiControlTower: false,
      // rateCards gates Carriers & Procurement
    },
  },
  {
    name: 'Operations Manager', email: 'manager@demo-ent.flowops.local',
    password: 'Demo@Manager123!', role: 'MANAGER', department: 'Operations Management',
    permissions: { ...FULL, usersRoles: false, settings: false },
  },
  {
    name: 'Dispatch Controller', email: 'dispatch@demo-ent.flowops.local',
    password: 'Demo@Dispatch123!', role: 'DISPATCH', department: 'Dispatch & Routing',
    permissions: {
      ...FULL, rateCards: false, billingBatches: false, invoices: false,
      creditControl: false, aiControlTower: false, usersRoles: false, settings: false,
    },
  },
  {
    name: 'Warehouse Clerk', email: 'warehouse@demo-ent.flowops.local',
    password: 'Demo@Warehouse123!', role: 'WAREHOUSE', department: 'Warehouse & Hub',
    permissions: {
      dashboard: true, collections: false, shipments: false, waybills: true,
      waybillInbox: true, clients: false, podDeliveries: true, driverDispatch: false,
      branches: true, manifests: true, whatsapp: false, email: false,
      rateCards: false, billingBatches: false, invoices: false, quotes: false,
      creditControl: false, risksExceptions: true, notifications: true,
      aiControlTower: false, highRiskQueue: false, usersRoles: false, settings: false,
    },
  },
  {
    name: 'Customer Service Agent', email: 'agent@demo-ent.flowops.local',
    password: 'Demo@Agent123!', role: 'AGENT', department: 'Customer Service & Sales',
    permissions: {
      dashboard: true, collections: true, shipments: true, waybills: true,
      waybillInbox: true, clients: true, podDeliveries: false, driverDispatch: false,
      branches: false, manifests: false, whatsapp: true, email: true,
      rateCards: false, billingBatches: false, invoices: true, quotes: true,
      creditControl: false, risksExceptions: false, notifications: true,
      aiControlTower: false, highRiskQueue: false, usersRoles: false, settings: false,
    },
  },
  {
    name: 'Field Driver', email: 'driver@demo-ent.flowops.local',
    password: 'Demo@Driver123!', role: 'DRIVER', department: 'Field Delivery',
    permissions: {
      dashboard: true, collections: false, shipments: false, waybills: false,
      waybillInbox: false, clients: false, podDeliveries: true, driverDispatch: true,
      branches: false, manifests: true, whatsapp: false, email: false,
      rateCards: false, billingBatches: false, invoices: false, quotes: false,
      creditControl: false, risksExceptions: false, notifications: true,
      aiControlTower: false, highRiskQueue: false, usersRoles: false, settings: false,
    },
  },
  {
    name: 'Finance Controller', email: 'finance@demo-ent.flowops.local',
    password: 'Demo@Finance123!', role: 'VIEWER', department: 'Finance & Reporting',
    permissions: {
      dashboard: true, collections: false, shipments: false, waybills: false,
      waybillInbox: false, clients: false, podDeliveries: false, driverDispatch: false,
      branches: false, manifests: false, whatsapp: false, email: false,
      rateCards: true, billingBatches: true, invoices: true, quotes: true,
      creditControl: true, risksExceptions: false, notifications: true,
      aiControlTower: false, highRiskQueue: false, usersRoles: false, settings: false,
    },
  },
];

// ── Forwarding demo data (makes the control tower + customs come alive) ─────
async function seedForwardingData(companyId) {
  const existing = await prisma.shipmentFile.count({ where: { companyId } });
  if (existing > 0) {
    console.log(`   ⏭  Forwarding data already present (${existing} files) — skipped.`);
    return;
  }

  const now = Date.now();
  const day = 86_400_000;
  const d = (offset) => new Date(now + offset * day);

  // [fileNumber, mode, direction, loadType, status, etaOffsetDays, pol, pod, consignee, goods,
  //  containers[{no,iso,freeDays,availFromDaysAgo}], cargo[{desc,hs,value,duty}],
  //  charges[{desc,cost,sell}], decl{status,mrn}]
  const FILES = [
    ['IMP-2026-0001','OCEAN','IMPORT','FCL','ARRIVED',3,'CNSHA','ZADUR','Cape Electronics (Pty) Ltd','Consumer electronics',
      [{no:'MSCU2310455',iso:'40HC',freeDays:7,availDaysAgo:6}], [{desc:'LED televisions',hs:'8528.72',value:480000,duty:10}],
      [{desc:'Ocean freight',cost:38000,sell:52000},{desc:'Customs clearance',cost:2500,sell:4500}], {status:'SUBMITTED'}],
    ['IMP-2026-0002','OCEAN','IMPORT','FCL','CUSTOMS_CLEARED',-2,'CNSHA','ZADUR','Highveld Retail Group','Apparel & textiles',
      [{no:'TGHU6654120',iso:'40GP',freeDays:5,availDaysAgo:1}], [{desc:'Cotton garments',hs:'6109.10',value:215000,duty:45}],
      [{desc:'Ocean freight',cost:31000,sell:43000},{desc:'Duty & VAT disbursement',cost:96750,sell:99000}], {status:'RELEASED',mrn:'MRN-ZA-884211'}],
    ['EXP-2026-0007','OCEAN','EXPORT','LCL','DEPARTED',14,'ZADUR','NLRTM','Stellar Wines BV','Bottled wine',
      [], [{desc:'Bottled wine 750ml',hs:'2204.21',value:130000,duty:0}],
      [{desc:'LCL freight',cost:14000,sell:21000},{desc:'Export docs',cost:1200,sell:2800}], {status:'DRAFT'}],
    ['IMP-2026-0003','AIR','IMPORT','AIR','ARRIVED',-1,'HKG','ZAJNB','MedTech SA','Medical devices',
      [], [{desc:'Diagnostic equipment',hs:'9018.19',value:620000,duty:0}],
      [{desc:'Air freight',cost:54000,sell:71000},{desc:'Customs clearance',cost:2500,sell:4800}], {status:'QUERY'}],
    ['IMP-2026-0004','OCEAN','IMPORT','FCL','BOOKED',20,'INNSA','ZADUR','Karoo Auto Parts','Automotive components',
      [{no:'CMAU7781290',iso:'20GP',freeDays:7,availDaysAgo:null}], [{desc:'Brake assemblies',hs:'8708.30',value:175000,duty:20}],
      [{desc:'Ocean freight',cost:22000,sell:31000}], {status:'DRAFT'}],
    ['EXP-2026-0008','ROAD','EXPORT','ROAD','LOADED',4,'Johannesburg','Gaborone','Botswana Mining Supplies','Industrial spares',
      [], [{desc:'Conveyor parts',hs:'8431.39',value:88000,duty:0}],
      [{desc:'Cross-border road',cost:9000,sell:14500}], {status:'DRAFT'}],
    ['IMP-2026-0005','OCEAN','IMPORT','FCL','DELIVERED',-12,'SGSIN','ZACPT','Table Bay Foods','Packaged foods',
      [{no:'OOLU1199883',iso:'40RF',freeDays:10,availDaysAgo:14}], [{desc:'Frozen seafood',hs:'0306.17',value:340000,duty:0}],
      [{desc:'Reefer ocean freight',cost:47000,sell:63000},{desc:'Port handling',cost:6000,sell:9500}], {status:'RELEASED',mrn:'MRN-ZA-871002'}],
  ];

  let made = 0;
  for (const f of FILES) {
    const [fileNumber, mode, direction, loadType, status, etaOff, pol, pod, consignee, goods, containers, cargo, charges, decl] = f;
    const file = await prisma.shipmentFile.create({
      data: {
        companyId, fileNumber, mode, direction, loadType, status,
        incoterm: direction === 'IMPORT' ? 'CIF' : 'FOB',
        consigneeName: consignee, shipperName: direction === 'IMPORT' ? 'Overseas Supplier Co.' : consignee,
        goodsDescription: goods, pol, pod,
        etd: d(etaOff - 25), eta: d(etaOff),
        aiRiskScore: status === 'ARRIVED' && etaOff < 0 ? 72 : (containers.some(c => c.availDaysAgo != null) ? 48 : 12),
        packages: 1 + Math.floor(Math.random() * 400),
        grossWeightKg: 500 + Math.floor(Math.random() * 18000),
        containers: containers.length ? {
          create: containers.map(c => ({
            containerNo: c.no, isoType: c.iso, freeDays: c.freeDays, perDiemRate: 850,
            availableFrom: c.availDaysAgo != null ? d(-c.availDaysAgo) : null,
          })),
        } : undefined,
        cargo: { create: cargo.map(c => ({ description: c.desc, hsCode: c.hs, customsValue: c.value, dutyRatePct: c.duty, pieces: 100, weightKg: 1200 })) },
        charges: { create: charges.map(c => ({ description: c.desc, currency: 'ZAR', cost: c.cost, sell: c.sell, invoiceTo: consignee })) },
      },
    });

    if (decl) {
      const customsValue = cargo.reduce((s, c) => s + (c.value || 0), 0);
      const duty = cargo.reduce((s, c) => s + (c.value || 0) * (c.duty || 0) / 100, 0);
      const vat = (customsValue + duty) * 0.15;
      await prisma.customsDeclaration.create({
        data: {
          fileId: file.id, companyId, type: direction, status: decl.status,
          lrn: `${fileNumber}-SAD`, mrn: decl.mrn || null,
          customsValueTotal: customsValue, dutyTotal: Math.round(duty), vatTotal: Math.round(vat),
          submittedAt: decl.status === 'DRAFT' ? null : new Date(),
          payload: { generated: true, source: 'enterprise-demo-seed' },
          lodgementProvider: decl.mrn ? 'CLEARING_AGENT_HANDOFF' : null,
        },
      });
    }
    made++;
  }
  console.log(`   ✅ Forwarding demo: ${made} shipment files (containers, cargo, charges, customs).`);
}

async function main() {
  console.log('\n🚀 FlowOps Enterprise Demo Seed\n' + '─'.repeat(50));

  let company = await prisma.company.findFirst({ where: { email: COMPANY.email } });
  if (company) {
    console.log(`ℹ️  Company already exists: "${company.name}" (id: ${company.id})`);
    if (company.plan !== 'enterprise') {
      company = await prisma.company.update({ where: { id: company.id }, data: { plan: 'enterprise' } });
      console.log('   ↳ plan corrected to "enterprise".');
    }
  } else {
    company = await prisma.company.create({ data: COMPANY });
    console.log(`✅ Created company: "${company.name}" (id: ${company.id})`);
  }

  const companyId = company.id;
  const results = [];

  for (const u of USERS) {
    const existing = await prisma.user.findFirst({ where: { email: u.email, companyId } });
    if (existing) {
      console.log(`   ⏭  Skipped (exists): ${u.email}`);
      results.push({ ...u, status: 'existed' });
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email.toLowerCase(),
        passwordHash,
        role: u.role,
        permissions: u.permissions,
        isActive: true,
        emailVerified: true,
        companyId,
      },
    });
    console.log(`   ✅ Created: ${u.email} (${u.role})`);
    results.push({ ...u, status: 'created' });
  }

  // Seed forwarding demo data so the control tower + customs pages are alive.
  await seedForwardingData(companyId);

  const newUsers = results.filter((r) => r.status === 'created');
  const existed = results.filter((r) => r.status === 'existed');

  console.log('\n' + '═'.repeat(76));
  console.log('  FlowOps ENTERPRISE Demo — Login Credentials');
  console.log('═'.repeat(76));
  console.log(`  Company:  ${COMPANY.name}`);
  console.log(`  Plan:     ${COMPANY.plan}  (all Enterprise modules visible)`);
  console.log('─'.repeat(76));
  console.log('  ' + 'Department'.padEnd(30) + 'Email'.padEnd(40) + 'Password');
  console.log('─'.repeat(76));
  for (const u of USERS) {
    console.log('  ' + u.department.padEnd(30) + u.email.padEnd(40) + u.password);
  }
  console.log('─'.repeat(76));
  console.log(`  ${newUsers.length} user(s) created, ${existed.length} already existed.`);
  console.log('═'.repeat(76));
  console.log('\n  ⚠️  Dev/demo credentials — never reuse for a production tenant.\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Enterprise seed failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
