// prisma/link-tenant.ts
import { PrismaClient } from '../src/generated/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌐 Initializing baseline Tenant partition...');

  // 1. Check if the master tenant already exists via the unique registration number
  let tenant = await prisma.tenant.findUnique({
    where: { regNumber: '2026/123456/07' }
  });

  if (!tenant) {
    // 2. Inject the master tenant using your exact schema requirements
    tenant = await prisma.tenant.create({
      data: {
        companyName: 'Apex Logistics Core',
        regNumber: '2026/123456/07',
        ownerEmail: 'admin@flowops.com',
        plan: 'Enterprise',
        status: 'Active',
        cipcVerified: true,
        // Set the trial to expire 10 years from now for the system owner
        trialEndsAt: new Date(new Date().setFullYear(new Date().getFullYear() + 10)),
      }
    });
    console.log(`✅ Tenant record freshly initialized: [ID: ${tenant.id}]`);
  } else {
    console.log(`✅ Existing Tenant record verified: [ID: ${tenant.id}]`);
  }

  console.log('--- \n🎉 Baseline Tenant data node verified in database engine.');
}

main()
  .catch((e) => {
    console.error('❌ Critical error verifying tenant matrix mapping:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
