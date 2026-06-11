import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.company.update({
    where: { id: 1 },
    data: { contactPhone: '27712345678' } // 🚀 Replace with your number
  });
  console.log("✅ Company #1 Phone Updated!");
}
main().finally(() => prisma.$disconnect());
