'use strict';

/**
 * Link the demo DRIVER user (driver@demo.flowops.local) to the first
 * available AVAILABLE driver in the same company (Sipho Dlamini).
 *
 * Run once after prisma db push adds the userId column:
 *   node prisma/seed-link-driver-user.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: 'FlowOps Demo Couriers' },
  });
  if (!company) { console.error('Run seed-demo-company.js first'); return; }

  const driverUser = await prisma.user.findFirst({
    where: { email: 'driver@demo.flowops.local', companyId: company.id },
  });
  if (!driverUser) { console.error('Demo driver user not found'); return; }

  // Pick the first available driver in the company
  const driver = await prisma.driver.findFirst({
    where: { companyId: company.id, userId: null },
    orderBy: { name: 'asc' },
  });
  if (!driver) { console.log('All drivers already linked or no drivers found'); return; }

  await prisma.driver.update({
    where: { id: driver.id },
    data: { userId: driverUser.id },
  });

  console.log('====================================================');
  console.log('  Driver scoping link created');
  console.log('====================================================');
  console.log('  User:   driver@demo.flowops.local');
  console.log('  Driver: ' + driver.name + ' (' + driver.vehicleReg + ')');
  console.log('  Status: ' + driver.status);
  console.log('====================================================');
  console.log('  Logging in as driver@demo.flowops.local will now');
  console.log('  show only ' + driver.name + "'s assigned deliveries.");
  console.log('====================================================');
}

main()
  .catch(e => { console.error('FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
