import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ⚡ Helper to pick a random item from an array
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log('--- Cleaning up previous test data ---');

  // Delete in correct order to avoid FK constraint errors
  await prisma.quote.deleteMany({});
  await prisma.collection.deleteMany({});
  await prisma.driver.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: 'admin' } } });
  await prisma.company.deleteMany({});

  console.log('Cleanup done.');

  // -----------------------------
  // 1️⃣ Create companies
  const NUM_COMPANIES = 1;
  const COMPANY_USERS = 2;
  const DRIVERS_PER_COMPANY = 2;
  const COLLECTIONS_PER_COMPANY = 2;
  const QUOTES_PER_COLLECTION = 2;

  for (let i = 1; i <= NUM_COMPANIES; i++) {
    const company = await prisma.company.create({
      data: { name: `Alpha Logistics ${i} ${Date.now()}` },
    });
    console.log(`Created company: ${company.name} (ID: ${company.id})`);

    // 2️⃣ Create users
    const users = [];
    for (let u = 1; u <= COMPANY_USERS; u++) {
      const user = await prisma.user.create({
        data: {
          email: `admin${i}${u}${Date.now()}@alphalogistics${i}${Date.now()}.com`,
          password: 'password123',
          companyId: company.id,
          role: 'ADMIN',
        },
      });
      users.push(user);
      console.log(`  Created user: ${user.email}`);
    }

    // 3️⃣ Create drivers
    const drivers = [];
    for (let d = 1; d <= DRIVERS_PER_COMPANY; d++) {
      const driver = await prisma.driver.create({
        data: {
          name: `Driver ${i}-${d} ${Date.now()}`,
          companyId: company.id,
        },
      });
      drivers.push(driver);
      console.log(`  Created driver: ${driver.name}`);
    }

    // 4️⃣ Create collections
    const collections = [];
    for (let col = 1; col <= COLLECTIONS_PER_COMPANY; col++) {
      const creator = randomChoice(users);
      const driver = randomChoice(drivers);

      const collection = await prisma.collection.create({
        data: {
          name: `Collection ${i}-${col} ${Date.now()}`,
          companyId: company.id,
          createdById: creator.id,
          driverId: driver.id,
        },
      });
      collections.push(collection);
      console.log(`    Created collection: ${collection.name} (driver: ${driver.name})`);

      // 5️⃣ Create quotes
      for (let q = 1; q <= QUOTES_PER_COLLECTION; q++) {
        const quoteDriver = randomChoice(drivers);
        const quoteUser = randomChoice(users);

        const quote = await prisma.quote.create({
          data: {
            collectionId: collection.id,
            userId: quoteUser.id,
            companyId: company.id,
            driverId: quoteDriver.id,
            status: 'PENDING',
          },
        });
        console.log(`      Created quote ID: ${quote.id} (driver: ${quoteDriver.name})`);
      }
    }
  }

  console.log('✅ All test data created successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });