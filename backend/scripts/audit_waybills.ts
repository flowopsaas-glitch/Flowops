import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function auditWaybills() {
  const waybills = await prisma.waybill.findMany({
    where: { status: { in: ['NEEDS_REVIEW', 'READY_FOR_DISPATCH'] } }
  });
  console.log(JSON.stringify(waybills, null, 2));
  await prisma.$disconnect();
}

auditWaybills();