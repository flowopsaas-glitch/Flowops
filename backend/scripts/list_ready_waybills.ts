import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const waybills = await prisma.waybill.findMany({
    where: {
      status: {
        in: ['NEEDS_REVIEW', 'READY_FOR_BILLING', 'READY_FOR_DISPATCH']
      }
    },
    select: {
      waybillNo: true,
      id: true,
      status: true
    }
  });
  console.log(JSON.stringify(waybills, null, 2));
  await prisma.$disconnect();
}

main();