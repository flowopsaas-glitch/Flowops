// full-seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

(async () => {
  try {
    console.log('🚀 Starting full seed...');

    // -----------------------
    // 1️⃣ Create company
    // -----------------------
    let company = await prisma.company.findFirst({
      where: { name: 'Alpha Logistics' }
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: 'Alpha Logistics'
        }
      });
      console.log('✅ Company created:', company.name);
    } else {
      console.log('ℹ️ Company already exists:', company.name);
    }

    // -----------------------
    // 2️⃣ Create admin user
    // -----------------------
    let adminUser = await prisma.user.findFirst({
      where: { email: 'admin@alpha.com' }
    });

    if (!adminUser) {
      const passwordHash = await bcrypt.hash('password123', 10);
      adminUser = await prisma.user.create({
        data: {
          email: 'admin@alpha.com',
          password: passwordHash,
          role: 'COMPANY_ADMIN',
          companyId: company.id
        }
      });
      console.log('✅ Admin user created:', adminUser.email);
    } else {
      console.log('ℹ️ Admin user already exists.');
    }

    // -----------------------
    // 3️⃣ Create default collection
    // -----------------------
    let collection = await prisma.collection.findFirst({
      where: { companyId: company.id }
    });

    if (!collection) {
      collection = await prisma.collection.create({
        data: {
          name: 'Default Collection',
          status: 'ACTIVE',
          company: { connect: { id: company.id } }
        }
      });
      console.log('✅ Default collection created.');
    } else {
      console.log('ℹ️ Collection already exists.');
    }

    // -----------------------
    // 4️⃣ Sample quote
    // -----------------------
    let quote = await prisma.quote.findFirst({
      where: { collectionId: collection.id }
    });

    if (!quote) {
      quote = await prisma.quote.create({
        data: {
          text: 'Hello FlowOps!',
          collection: { connect: { id: collection.id } },
          author: 'Admin' // use 'author' because 'createdBy' no longer exists
          // OR if your schema has `user` relation, replace with:
          // user: { connect: { id: adminUser.id } }
        }
      });
      console.log('✅ Sample quote created.');
    } else {
      console.log('ℹ️ Quote already exists.');
    }

    console.log('🎉 Full seed complete!');
  } catch (err) {
    console.error('❌ Seed error:', err);
  } finally {
    await prisma.$disconnect();
  }
})();