import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding dashboard demo data...');
  
  // Create sample waybills with different statuses
  await prisma.waybill.createMany({
    data: [
      { waybillNumber: 'WB-001', status: 'DELIVERED', totalAmount: 150.00, deliveredAt: new Date(), companyId: 1 },
      { waybillNumber: 'WB-002', status: 'DELIVERED', totalAmount: 275.50, deliveredAt: new Date(), companyId: 1 },
      { waybillNumber: 'WB-003', status: 'IN_TRANSIT', totalAmount: 89.00, companyId: 1 },
      { waybillNumber: 'WB-004', status: 'PENDING', totalAmount: 320.00, companyId: 1 },
      { waybillNumber: 'WB-005', status: 'DELIVERED', totalAmount: 199.99, deliveredAt: new Date(Date.now() - 86400000), companyId: 1 },
    ],
    skipDuplicates: true,
  });

  // Save a default rich dashboard layout
  await prisma.dashboardLayout.upsert({
    where: { id: 1 },
    update: {},
    create: {
      companyId: 1,
      name: 'Admin Command Center',
      role: 'ADMIN',
      isDefault: true,
      config: {
        widgets: [
          { i: 'kpi_total', type: 'kpi', config: { metric: 'totalWaybills', label: 'Total Waybills', icon: 'Package' } },
          { i: 'kpi_delivered', type: 'kpi', config: { metric: 'deliveredToday', label: 'Delivered Today', icon: 'Truck' } },
          { i: 'kpi_revenue', type: 'kpi', config: { metric: 'revenue', label: 'Revenue', icon: 'DollarSign' } },
          { i: 'kpi_otd', type: 'kpi', config: { metric: 'otdPercent', label: 'OTD %', icon: 'TrendingUp' } },
        ],
        layout: [
          { i: 'kpi_total', x: 0, y: 0, w: 3, h: 2 },
          { i: 'kpi_delivered', x: 3, y: 0, w: 3, h: 2 },
          { i: 'kpi_revenue', x: 6, y: 0, w: 3, h: 2 },
          { i: 'kpi_otd', x: 9, y: 0, w: 3, h: 2 },
        ]
      }
    }
  });

  console.log('✅ Seed complete! Refresh your dashboard to see live data.');
}

seed().catch(e => console.error(e)).finally(() => prisma.$disconnect());
