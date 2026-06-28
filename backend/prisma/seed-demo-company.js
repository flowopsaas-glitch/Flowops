/**
 * FlowOps — Demo Company Seed
 *
 * Creates "FlowOps Demo Couriers" with one fully-configured user per department.
 * Safe to run multiple times (idempotent — skips existing records).
 *
 * Usage:
 *   cd /opt/Flowops/backend
 *   node prisma/seed-demo-company.js
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// ── Demo company details ──────────────────────────────────────────────────

const COMPANY = {
  name:         'FlowOps Demo Couriers',
  tradingName:  'FlowOps Demo',
  email:        'admin@demo.flowops.local',
  phone:        '+27 11 000 0000',
  address:      '1 Courier Lane, Sandton',
  city:         'Johannesburg',
  country:      'ZA',
  plan:         'professional',
  isActive:     true,
  primaryColor: '#3b82f6',
  brandName:    'FlowOps Demo Couriers',
  slaBreachMinutes: 60,
  whatsappNumber: '+27 82 000 0000',
};

// ── Department users ──────────────────────────────────────────────────────
//
// Permissions follow the role templates in tenantUserPermissions.ts.
// Each user gets a role + explicit permission set so the dashboard
// shows the correct persona view on first login.

const USERS = [
  {
    name:         'Admin User',
    email:        'admin@demo.flowops.local',
    password:     'Demo@Admin123!',
    role:         'ADMIN',
    department:   'Administration',
    permissions: {
      dashboard: true, collections: true, shipments: true, waybills: true,
      waybillInbox: true, clients: true, podDeliveries: true, driverDispatch: true,
      branches: true, manifests: true, whatsapp: true, email: true,
      rateCards: true, billingBatches: true, invoices: true, quotes: true,
      creditControl: true, risksExceptions: true, notifications: true,
      aiControlTower: true, highRiskQueue: true, usersRoles: true, settings: true,
    },
  },
  {
    name:         'Company Admin',
    email:        'companyadmin@demo.flowops.local',
    password:     'Demo@CompAdmin123!',
    role:         'COMPANY_ADMIN',
    department:   'Management',
    permissions: {
      dashboard: true, collections: true, shipments: true, waybills: true,
      waybillInbox: true, clients: true, podDeliveries: true, driverDispatch: true,
      branches: true, manifests: true, whatsapp: true, email: true,
      rateCards: true, billingBatches: true, invoices: true, quotes: true,
      creditControl: true, risksExceptions: true, notifications: true,
      aiControlTower: true, highRiskQueue: true, usersRoles: true, settings: true,
    },
  },
  {
    name:         'Operations Manager',
    email:        'manager@demo.flowops.local',
    password:     'Demo@Manager123!',
    role:         'MANAGER',
    department:   'Operations Management',
    permissions: {
      dashboard: true, collections: true, shipments: true, waybills: true,
      waybillInbox: true, clients: true, podDeliveries: true, driverDispatch: true,
      branches: true, manifests: true, whatsapp: true, email: true,
      rateCards: true, billingBatches: true, invoices: true, quotes: true,
      creditControl: true, risksExceptions: true, notifications: true,
      aiControlTower: true, highRiskQueue: true, usersRoles: false, settings: false,
    },
  },
  {
    name:         'Dispatch Controller',
    email:        'dispatch@demo.flowops.local',
    password:     'Demo@Dispatch123!',
    role:         'DISPATCH',
    department:   'Dispatch & Routing',
    permissions: {
      dashboard: true, collections: true, shipments: true, waybills: true,
      waybillInbox: true, clients: true, podDeliveries: true, driverDispatch: true,
      branches: true, manifests: true, whatsapp: true, email: true,
      rateCards: false, billingBatches: false, invoices: false, quotes: true,
      creditControl: false, risksExceptions: true, notifications: true,
      aiControlTower: false, highRiskQueue: true, usersRoles: false, settings: false,
    },
  },
  {
    name:         'Warehouse Clerk',
    email:        'warehouse@demo.flowops.local',
    password:     'Demo@Warehouse123!',
    role:         'WAREHOUSE',
    department:   'Warehouse & Hub',
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
    name:         'Sales Agent',
    email:        'agent@demo.flowops.local',
    password:     'Demo@Agent123!',
    role:         'AGENT',
    department:   'Customer Service & Sales',
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
    name:         'Field Driver',
    email:        'driver@demo.flowops.local',
    password:     'Demo@Driver123!',
    role:         'DRIVER',
    department:   'Field Delivery',
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
    name:         'Finance Viewer',
    email:        'viewer@demo.flowops.local',
    password:     'Demo@Viewer123!',
    role:         'VIEWER',
    department:   'Finance & Reporting',
    permissions: {
      dashboard: true, collections: false, shipments: false, waybills: false,
      waybillInbox: false, clients: false, podDeliveries: false, driverDispatch: false,
      branches: false, manifests: false, whatsapp: false, email: false,
      // Full billing/finance access — the Finance persona sees all money pages
      rateCards: true, billingBatches: true, invoices: true, quotes: true,
      creditControl: true, risksExceptions: false, notifications: true,
      aiControlTower: false, highRiskQueue: false, usersRoles: false, settings: false,
    },
  },
  {
    name:         'Procurement Officer',
    email:        'procurement@demo.flowops.local',
    password:     'Demo@Procure123!',
    role:         'MANAGER',
    department:   'Procurement & Carrier Relations',
    permissions: {
      dashboard: true, collections: false, shipments: true, waybills: false,
      waybillInbox: false, clients: true, podDeliveries: false, driverDispatch: false,
      branches: false, manifests: false, whatsapp: false, email: true,
      // rateCards gates Carriers & Procurement + Rate Cards/Shopping
      rateCards: true, billingBatches: false, invoices: false, quotes: true,
      creditControl: false, risksExceptions: false, notifications: true,
      aiControlTower: false, highRiskQueue: false, usersRoles: false, settings: false,
    },
  },
];

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 FlowOps Demo Company Seed\n' + '─'.repeat(50));

  // 1. Upsert the demo company
  let company = await prisma.company.findFirst({
    where: { email: COMPANY.email },
  });

  if (company) {
    console.log(`ℹ️  Company already exists: "${company.name}" (id: ${company.id})`);
  } else {
    company = await prisma.company.create({ data: COMPANY });
    console.log(`✅ Created company: "${company.name}" (id: ${company.id})`);
  }

  const companyId = company.id;

  // 2. Create users (skip if email already exists for this company)
  const results = [];

  for (const u of USERS) {
    const existing = await prisma.user.findFirst({
      where: { email: u.email, companyId },
    });

    if (existing) {
      console.log(`   ⏭  Skipped (exists): ${u.email}`);
      results.push({ ...u, status: 'existed' });
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, 12);
    await prisma.user.create({
      data: {
        name:         u.name,
        email:        u.email.toLowerCase(),
        passwordHash,
        role:         u.role,
        permissions:  u.permissions,
        isActive:     true,
        companyId,
      },
    });

    console.log(`   ✅ Created: ${u.email} (${u.role})`);
    results.push({ ...u, status: 'created' });
  }

  // 3. Print credentials table
  const newUsers = results.filter(r => r.status === 'created');
  const existing = results.filter(r => r.status === 'existed');

  console.log('\n' + '═'.repeat(72));
  console.log('  FlowOps Demo Company — Login Credentials');
  console.log('═'.repeat(72));
  console.log(`  Company:  ${COMPANY.name}`);
  console.log(`  Plan:     ${COMPANY.plan}`);
  console.log(`  Login:    http://localhost:5173  →  "Tenant Login"`);
  console.log('─'.repeat(72));
  console.log(
    '  ' +
    'Department'.padEnd(28) +
    'Email'.padEnd(36) +
    'Password'
  );
  console.log('─'.repeat(72));

  for (const u of USERS) {
    console.log(
      '  ' +
      u.department.padEnd(28) +
      u.email.padEnd(36) +
      u.password
    );
  }

  console.log('─'.repeat(72));
  console.log(`  ${newUsers.length} user(s) created, ${existing.length} already existed.`);
  console.log('═'.repeat(72));
  console.log('\n  ⚠️  These are dev/demo credentials — change before going live.\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seed failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
