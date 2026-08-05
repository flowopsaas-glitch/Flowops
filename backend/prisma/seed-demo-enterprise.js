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
