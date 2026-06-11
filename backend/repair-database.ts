import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function repair() {
  try {
    console.log('🔧 FlowOps Database Repair - Starting...\n');

    // 1. Ensure the Company exists
    console.log('1️⃣ Ensuring Alpha Logistics company exists...');
    const alphaCompany = await prisma.company.upsert({
      where: { id: 2 },
      update: { name: 'Alpha Logistics' },
      create: {
        id: 2,
        name: 'Alpha Logistics',
      }
    });
    console.log(`   ✅ Company: ${alphaCompany.name} (ID: ${alphaCompany.id})\n`);

    // 2. Hash the password
    console.log('2️⃣ Hashing password...');
    const hash = await bcrypt.hash('password123', 10);
    console.log('   ✅ Password hashed\n');

    // 3. Create/Update the Admin User
    console.log('3️⃣ Creating/updating admin user...');
    const user = await prisma.user.upsert({
      where: { email: 'admin@alpha.com' },
      update: { 
        password: hash, 
        companyId: alphaCompany.id,
        role: 'ADMIN',
        name: 'Alpha Admin'
      },
      create: {
        email: 'admin@alpha.com',
        password: hash,
        name: 'Alpha Admin',
        role: 'ADMIN',
        companyId: alphaCompany.id,
        termsAcceptedAt: new Date(),
        termsAcceptedVersion: '1.0.0'
      }
    });
    console.log(`   ✅ User: ${user.email}`);
    console.log(`   ✅ Role: ${user.role}`);
    console.log(`   ✅ Company ID: ${user.companyId}\n`);

    // 4. Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ DATABASE REPAIR COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📋 Login Credentials:');
    console.log('   Email:    admin@alpha.com');
    console.log('   Password: password123');
    console.log('   Company:  Alpha Logistics');
    console.log('   Role:     ADMIN\n');

  } catch (error) {
    console.error('❌ Error during repair:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

repair();
