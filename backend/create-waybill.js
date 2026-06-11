const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function randomWaybillNo(i) {
  return `WB-${Date.now()}-${i}`;
}

async function run() {
  console.log("🚀 Creating test waybills...\n");

  const items = [];

  for (let i = 1; i <= 5; i++) {
    const wb = await prisma.waybill.create({
      data: {
        waybillNo: randomWaybillNo(i),

        // keep aligned with your DB
        status: i % 2 === 0 ? "NEEDS_REVIEW" : "PENDING",

        contractCode: null,
        extractedDraft: null
      }
    });

    items.push(wb);
  }

  console.log("✅ CREATED WAYBILLS:\n");

  items.forEach((wb) => {
    console.log({
      id: wb.id,
      safeId: String(wb.id), // 🔥 frontend-safe
      waybillNo: wb.waybillNo,
      status: wb.status
    });
  });

  console.log("\n🎯 Done. Refresh your Inbox UI.");
}

run()
  .catch((e) => {
    console.error("❌ ERROR:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
