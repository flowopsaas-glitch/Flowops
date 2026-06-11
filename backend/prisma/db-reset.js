// File: C:\FlowOps\backend\prisma\db-reset.js
const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

// Helper to delete safely if the table exists
async function safeDelete(model, name) {
  try {
    await model.deleteMany();
  } catch (err) {
    if (err.code === "P2021") {
      console.log(`⚠️ Table ${name} does not exist, skipping deleteMany()`);
    } else {
      throw err;
    }
  }
}

async function seed() {
  console.log("🧹 Seeding default data...");

  // Clear existing data safely
  await safeDelete(prisma.Collection, "Collection");
  await safeDelete(prisma.Quote, "Quote");
  await safeDelete(prisma.User, "User");
  await safeDelete(prisma.Company, "Company");

  console.log("🏢 Seeding companies and users...");

  // Default company
  const alphaCorp = await prisma.Company.create({
    data: { name: "Alpha Corp" },
  });
  console.log(`🏢 Company created: ${alphaCorp.name}`);

  // Admin user
  const adminPassword = await bcrypt.hash("Admin123!", 10);
  await prisma.User.create({
    data: {
      email: "admin@flowops.com",
      password: adminPassword,
      role: "ADMIN",
      companyId: alphaCorp.id,
    },
  });
  console.log(`👤 Admin user created: admin@flowops.com`);

  // Operator user
  const operatorPassword = await bcrypt.hash("Operator123!", 10);
  await prisma.User.create({
    data: {
      email: "operator@flowops.com",
      password: operatorPassword,
      role: "OPERATOR",
      companyId: alphaCorp.id,
    },
  });
  console.log(`👤 Operator user created: operator@flowops.com`);

  console.log("✅ Database seed complete!");
}

async function reset() {
  try {
    console.log("⚠️ Resetting database...");
    execSync("npx prisma migrate reset --force --skip-generate", { stdio: "inherit" });
    console.log("✅ Migrations applied!");

    // Generate Prisma client after reset
    execSync("npx prisma generate", { stdio: "inherit" });
    console.log("✅ Prisma client generated!");

    await seed();
  } catch (err) {
    console.error("❌ DB reset failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

reset();
