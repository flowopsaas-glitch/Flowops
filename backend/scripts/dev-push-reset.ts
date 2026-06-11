import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function reset() {
  console.log("🔄 Resetting FlowOps Testing Environment...");

  // 1. Unlock all batches to make them "testable" again
  await prisma.billingBatch.updateMany({
    data: { status: 'DRAFT' }
  });

  // 2. Ensure Company #1 has your test phone number
  await prisma.company.update({
    where: { id: 1 },
    data: { contactPhone: '27712345678' } // 🚀 Replace with your number
  });

  // 3. Clear the WhatsApp Log so you can see a "clean" test result
  await prisma.whatsAppLog.deleteMany({});

  console.log("✅ All Batches moved to DRAFT");
  console.log("✅ Company Phone verified");
  console.log("✅ WhatsApp Logs cleared");
  console.log("\n🚀 Ready for a fresh 'Generate' test!");
}

reset()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
