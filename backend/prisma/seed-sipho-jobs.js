'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const company = await prisma.company.findFirst({ where: { name: 'FlowOps Demo Couriers' } });
  if (!company) { console.log('Run seed-demo-company.js first'); return; }
  const sipho = await prisma.driver.findFirst({ where: { companyId: company.id, name: { contains: 'Sipho' } } });
  if (!sipho) { console.log('Sipho not found'); return; }
  console.log('Found: ' + sipho.name);
  await prisma.driver.update({ where: { id: sipho.id }, data: { status: 'ON_ROUTE', lastLat: -26.0865, lastLng: 28.0562, lastSeen: new Date() } });
  const cols = await prisma.collection.findMany({ where: { companyId: company.id, driverId: null, status: 'PENDING' }, take: 2 });
  for (const c of cols) {
    await prisma.collection.update({ where: { id: c.id }, data: { driverId: sipho.id, status: 'ASSIGNED' } });
    console.log('Collection assigned: ' + (c.clientName || c.id));
  }
  if (cols.length === 0) {
    await prisma.collection.create({ data: { companyId: company.id, driverId: sipho.id, status: 'ASSIGNED', clientName: 'Cape Cargo Ltd', clientPhone: '+27215550100', pickupAddress: '1 Heerengracht, Cape Town', scheduledAt: new Date(Date.now() + 1800000) } });
    console.log('Created collection');
  }
  const wbs = await prisma.waybill.findMany({ where: { companyId: company.id, status: { in: ['IN_TRANSIT','OUT_FOR_DELIVERY','COLLECTED'] } }, take: 3 });
  for (const wb of wbs) {
    const ex = await prisma.shipment.findFirst({ where: { waybillId: wb.id } });
    if (ex) { await prisma.shipment.update({ where: { id: ex.id }, data: { driverId: sipho.id, currentLat: -26.0865, currentLng: 28.0562 } }); }
    else { await prisma.shipment.create({ data: { companyId: company.id, waybillId: wb.id, driverId: sipho.id, status: 'IN_TRANSIT', currentLat: -26.0865, currentLng: 28.0562 } }); }
    console.log('Delivery: ' + wb.trackingNumber);
  }
  if (wbs.length === 0) {
    const wb = await prisma.waybill.create({ data: { companyId: company.id, trackingNumber: 'FO-DEMO-01', status: 'OUT_FOR_DELIVERY', senderName: 'FlowOps Warehouse', senderPhone: '+27110000001', senderAddress: 'JHB Warehouse', recipientName: 'Demo Customer', recipientPhone: '+27830000001', recipientAddress: '5 Nelson Mandela Sq, Sandton', weight: 2.5, totalAmount: 450 } });
    await prisma.shipment.create({ data: { companyId: company.id, waybillId: wb.id, driverId: sipho.id, status: 'IN_TRANSIT', currentLat: -26.0865, currentLng: 28.0562 } });
    console.log('Created demo delivery');
  }
  console.log('Done - refresh http://localhost:4001');
}
main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
