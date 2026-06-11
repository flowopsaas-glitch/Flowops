import { PrismaClient, Role, WaybillStatus, PaymentType, PayerSide, DriverType, BranchType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedZALogistics() {
  console.log('🔄 Initializing Comprehensive South Africa Logistical Framework Seeding...');
  try {
    // 1. Seed Corporate Entity Space using only guaranteed fields
    const company = await prisma.company.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        name: 'FlowOps ZA Logistics Hub',
        brandPrimaryColor: '#0066cc',
        brandSecondaryColor: '#00cc66',
      },
    });
    console.log(`✅ Corporate Space Verified: ${company.name} (ID: ${company.id})`);

    // 2. Seed Operator User
    const user = await prisma.user.upsert({
      where: { email: 'kadi@flowops.work' },
      update: {},
      create: {
        email: 'kadi@flowops.work',
        name: 'Kadi Operator',
        role: Role.OPERATOR,
        companyId: company.id,
      },
    });
    console.log(`✅ System Operator Provisioned: ${user.email}`);

    // 3. Seed Regional Branches
    const sourceBranch = await prisma.branch.create({
      data: {
        name: 'Johannesburg Distribution Center',
        type: BranchType.WAREHOUSE,
        location: '-26.2041,28.0473',
        companyId: company.id,
      },
    });
    const destBranch = await prisma.branch.create({
      data: {
        name: 'Cape Town Fulfillment Port',
        type: BranchType.HUB,
        location: '-33.9249,18.4241',
        companyId: company.id,
      },
    });
    console.log(`✅ Infrastructure Network Mapped: [JHB Hub (ID: ${sourceBranch.id}) -> CPT Hub (ID: ${destBranch.id})]`);

    // 4. Seed Fleet Driver Profile
    const driver = await prisma.driver.create({
      data: {
        name: 'Sipho Ndlovu',
        phone: '+27830000001',
        vehicleReg: 'FLOW-ZA-GP',
        status: 'AVAILABLE',
        availabilityStatus: 'AVAILABLE',
        lat: -26.2041,
        lng: 28.0473,
        type: DriverType.INTERNAL,
        companyId: company.id,
      },
    });
    console.log(`✅ Active Fleet Resource Active: ${driver.name} (Vehicle: ${driver.vehicleReg})`);

    // 5. Clean up stale waybill record to prevent unique constraints
    await prisma.waybill.deleteMany({ where: { waybillNumber: 'WB-GTR-ZA-001' } });

    // 6. Seed Linked Production Waybill Asset
    const waybill = await prisma.waybill.create({
      data: {
        waybillNumber: 'WB-GTR-ZA-001',
        status: WaybillStatus.PENDING_COLLECTION,
        paymentType: PaymentType.CONTRACT,
        payer: PayerSide.SENDER,
        totalAmount: 14500.00,
        currency: 'ZAR',
        weightKg: 450.00,
        distanceKm: 1400.00,
        sender: 'Gauteng Production Plant',
        recipient: 'Western Cape Retail Outlet',
        deliveryAddress: 'V&A Waterfront, Cape Town, 8001, South Africa',
        companyId: company.id,
        driverId: driver.id,
        currentBranchId: sourceBranch.id,
        destinationBranchId: destBranch.id,
      },
    });
    console.log(`✅ Waybill Handshake Complete: ${waybill.waybillNumber} linked to Driver ${driver.id}`);
    console.log('🎉 EXPANDED LOGISTICAL FRAMEWORK SEEDING 100% SUCCESSFUL.');
  } catch (error) {
    console.error('❌ Seeding Process Terminated due to Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedZALogistics();

