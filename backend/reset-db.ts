import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function seedDatabase() {
  console.log("🧹 Resetting database...");

  // ----------------------------
  // 1️⃣ Seed Companies
  // ----------------------------
  console.log("🏢 Seeding companies...");

  const alphaCorp = await prisma.company.upsert({
    where: { name: "Alpha Corp" },
    update: {},
    create: {
      name: "Alpha Corp",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const betaInc = await prisma.company.upsert({
    where: { name: "Beta Inc" },
    update: {},
    create: {
      name: "Beta Inc",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // ----------------------------
  // 2️⃣ Seed Users
  // ----------------------------
  console.log("👤 Seeding users...");

  const usersData = [
    {
      email: "admin@alpha.com",
      password: "admin123",
      role: "ADMIN",
      companyId: null, // global admin
    },
    {
      email: "companyadmin@alpha.com",
      password: "alphaadmin",
      role: "COMPANY_ADMIN",
      companyId: alphaCorp.id,
    },
    {
      email: "operator@alpha.com",
      password: "operator",
      role: "OPERATOR",
      companyId: alphaCorp.id,
    },
    {
      email: "driver@alpha.com",
      password: "driver",
      role: "DRIVER",
      companyId: alphaCorp.id,
    },
  ];

  const createdUsers = [];
  for (const u of usersData) {
    const hashedPassword = await bcrypt.hash(u.password, 10);

    // Use upsert to prevent duplicate unique constraint errors
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        password: hashedPassword,
        role: u.role,
        companyId: u.companyId,
        updatedAt: new Date(),
      },
      create: {
        email: u.email,
        password: hashedPassword,
        role: u.role,
        companyId: u.companyId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    createdUsers.push(user);
  }

  const companyAdmin = createdUsers.find(
    (u) => u.email === "companyadmin@alpha.com"
  )!;
  const operatorUser = createdUsers.find(
    (u) => u.email === "operator@alpha.com"
  )!;

  // ----------------------------
  // 3️⃣ Seed Collections
  // ----------------------------
  console.log("📦 Seeding collections...");

  const collectionsData = [
    {
      reference: "COL-001",
      companyId: alphaCorp.id,
      createdById: companyAdmin.id,
    },
    {
      reference: "COL-002",
      companyId: alphaCorp.id,
      createdById: operatorUser.id,
    },
  ];

  const createdCollections = [];
  for (const c of collectionsData) {
    const collection = await prisma.collection.upsert({
      where: { reference: c.reference },
      update: { updatedAt: new Date() },
      create: {
        reference: c.reference,
        companyId: c.companyId,
        createdById: c.createdById,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    createdCollections.push(collection);
  }

  // ----------------------------
  // 4️⃣ Seed Quotes
  // ----------------------------
  console.log("💰 Seeding quotes...");

  const quotesData = [
    { amount: 1500, status: "PENDING", collectionReference: "COL-001" },
    { amount: 2750, status: "PENDING", collectionReference: "COL-002" },
  ];

  for (const q of quotesData) {
    const collection = createdCollections.find(
      (c) => c.reference === q.collectionReference
    );
    if (!collection) continue;

    await prisma.quote.upsert({
      where: { id: collection.id }, // upsert needs unique field, we can create with id
      update: { updatedAt: new Date() },
      create: {
        amount: q.amount,
        status: q.status,
        collectionId: collection.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  console.log("✅ Database reset complete!");
}

async function main() {
  try {
    await seedDatabase();
  } catch (e) {
    console.error("❌ Reset failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
