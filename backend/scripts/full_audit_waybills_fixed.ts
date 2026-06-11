import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fullAuditWaybills() {
  try {
    // Fetch all waybills using only valid fields
    const waybills = await prisma.waybill.findMany({
      select: {
        id: true,
        waybillNo: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (waybills.length === 0) {
      console.log('No waybills found in the database.');
    } else {
      console.table(waybills, ['id', 'waybillNo', 'status', 'createdAt', 'updatedAt']);
    }
  } catch (error) {
    console.error('Error fetching waybills:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fullAuditWaybills();
