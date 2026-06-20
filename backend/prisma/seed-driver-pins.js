'use strict';

/**
 * seed-driver-pins.js
 * Sets a 4-digit PIN for every seeded driver so they can log in to the
 * FlowOps Driver Portal (http://localhost:4001).
 *
 * Run AFTER: npx prisma db push (adds the driverPin column)
 *
 * Usage:  node prisma/seed-driver-pins.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

// Default PIN assigned to all demo drivers
// Phone numbers match what was seeded in seed-full-data.js
const DRIVERS = [
  { name: 'Sipho Dlamini',   phone: '+27683788843', pin: '1234' },
  { name: 'Thandi Molefe',   phone: '+27831703085', pin: '2345' },
  { name: 'Kgosi Sithole',   phone: '+27831703086', pin: '3456' },
  { name: 'Bongani Zulu',    phone: '+27831703087', pin: '4567' },
  { name: 'Lerato Mokoena',  phone: '+27831703088', pin: '5678' },
];

async function main() {
  console.log('FlowOps Driver PIN Seed');
  console.log('--------------------------------------------------');

  const company = await prisma.company.findFirst({
    where: { name: 'FlowOps Demo Couriers' },
  });

  if (!company) {
    console.log('Company not found. Run seed-demo-company.js first.');
    return;
  }

  // Also look up all drivers by company in case phones differ
  const allDrivers = await prisma.driver.findMany({
    where: { companyId: company.id },
  });

  console.log(`Found ${allDrivers.length} drivers in FlowOps Demo Couriers`);
  console.log('');

  let updated = 0;
  for (const d of allDrivers) {
    // Find a matching PIN config by first name (case-insensitive)
    const cfg = DRIVERS.find(c =>
      d.name.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())
    );
    const pin   = cfg ? cfg.pin   : '1234';
    const phone = cfg ? cfg.phone : d.phone;  // update to known number if matched

    const hashedPin = await bcrypt.hash(pin, 12);

    await prisma.driver.update({
      where: { id: d.id },
      data: {
        driverPin: hashedPin,
        // Set the phone to the expected value so credentials are always
        // predictable regardless of what phone() generated during seeding.
        ...(phone && phone !== d.phone ? { phone } : {}),
      },
    });
    updated++;
    console.log(`  OK:  ${d.name.padEnd(22)} phone: ${phone.padEnd(18)} PIN: ${pin}`);
  }

  console.log('');
  console.log('====================================================================');
  console.log('  FlowOps Driver Portal Credentials');
  console.log('  URL: http://localhost:4001');
  console.log('====================================================================');
  console.log('  Driver                  Phone                   PIN');
  console.log('--------------------------------------------------------------------');
  for (const d of allDrivers) {
    const cfg = DRIVERS.find(c =>
      d.name.toLowerCase().includes(c.name.split(' ')[0].toLowerCase())
    );
    const pin   = cfg ? cfg.pin   : '1234';
    const phone = cfg ? cfg.phone : (d.phone || 'N/A');
    console.log(`  ${d.name.padEnd(24)}${phone.padEnd(24)}${pin}`);
  }
  console.log('--------------------------------------------------------------------');
  console.log(`  ${updated} driver(s) updated with PINs`);
  console.log('====================================================================');
  console.log('');
  console.log('  NOTE: All demo drivers default to PIN 1234 if not listed above.');
  console.log('');
}

main()
  .catch(e => { console.error('FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
