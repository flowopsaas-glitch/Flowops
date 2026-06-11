// add_test_waybill.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addTest() {
  await prisma.waybill.create({
    data: {
      waybillNo: 'WB-TEST-002',
      status: 'NEEDS_REVIEW',
      contractCode: 'Q94',
      extractedDraft: {},
    },
  });
  console.log('Test waybill added!');
  await prisma.$disconnect();
}

addTest();