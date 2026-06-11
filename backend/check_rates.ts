import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const rate = await prisma.rateCard.findFirst({ where: { companyId: 1, isActive: true } });
  console.log("💎 CURRENT ACTIVE RATE CARD:", rate);
}
main();
