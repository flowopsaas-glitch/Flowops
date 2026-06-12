import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

const SA_CITIES = ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth', 'Bloemfontein', 'Nelspruit'];
function randomItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomFloat(min: number, max: number): number { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }
function daysAgo(days: number): Date { return new Date(Date.now() - days * 86400000); }
function waybillNo(): string { return `WB-${Date.now().toString(36).toUpperCase()}-${randomInt(100, 999)}`; }

@Injectable()
export class SeederService {
  private readonly logger = new Logger('SeederService');
  constructor(private prisma: PrismaService) {}

  async seedDemoData(companyId: number) {
    const results: Record<string, number> = {};
    this.logger.log(`🌱 Seeding demo data for company ${companyId}...`);

    // ── 1. Clients ───────────────────────────────────────────────────────────
    const clientData = [
      { name: 'Alpha Logistics', email: 'billing@alpha.co.za', phone: '0110001234', billingType: 'CONTRACT', creditLimit: 50000 },
      { name: 'Bright Courier Services', email: 'accounts@bright.co.za', phone: '0210001235', billingType: 'COD' },
      { name: 'Cape Fresh Distributors', email: 'info@capefresh.co.za', phone: '0210001236', billingType: 'PREPAID' },
      { name: 'Delta Express', email: 'ops@deltaexpress.co.za', phone: '0310001237', billingType: 'CONTRACT', creditLimit: 30000 },
      { name: 'East Coast Traders', email: 'admin@eastcoast.co.za', phone: '0310001238', billingType: 'COD' },
    ];
    const clients = [];
    for (const c of clientData) {
      const existing = await this.prisma.client.findFirst({ where: { name: c.name, companyId } });
      if (!existing) clients.push(await this.prisma.client.create({ data: { ...c, companyId } }));
      else clients.push(existing);
    }
    results.clients = clients.length;

    // ── 2. Drivers ───────────────────────────────────────────────────────────
    const driverData = [
      { name: 'Sipho Dlamini', phone: '0821100001', vehicleReg: 'CA 123-456', vehicleType: 'Van', zone: 'Cape Town', pin: '1234' },
      { name: 'Thabo Mokoena', phone: '0821100002', vehicleReg: 'GP 789-012', vehicleType: 'Bakkie', zone: 'Johannesburg', pin: '1234' },
      { name: 'Ayanda Nkosi', phone: '0821100003', vehicleReg: 'KZN 345-678', vehicleType: '1-Ton Truck', zone: 'Durban', pin: '1234' },
      { name: 'Naledi Sithole', phone: '0821100004', vehicleReg: 'GP 901-234', vehicleType: 'Van', zone: 'Pretoria', pin: '1234' },
    ];
    const drivers = [];
    for (const d of driverData) {
      try {
        const existing = await this.prisma.driver.findFirst({ where: { phone: d.phone } });
        if (!existing) drivers.push(await this.prisma.driver.create({ data: { ...d, status: 'AVAILABLE', availabilityStatus: 'AVAILABLE', companyId } }));
        else drivers.push(existing);
      } catch (e) { this.logger.warn(`Driver ${d.name} skip: ${e.message}`); }
    }
    results.drivers = drivers.length;

    // ── 3. Staff Users ────────────────────────────────────────────────────────
    const hashedPw = await bcrypt.hash('Test123!', 10);
    let staffCount = 0;
    for (const s of [
      { name: 'Lead Dispatcher', email: `dispatcher${companyId}@flowops.work`, role: 'DISPATCHER' as const },
      { name: 'Warehouse Clerk', email: `clerk${companyId}@flowops.work`, role: 'WAREHOUSE_CLERK' as const },
    ]) {
      const existing = await this.prisma.user.findUnique({ where: { email: s.email } });
      if (!existing) { await this.prisma.user.create({ data: { email: s.email, name: s.name, role: s.role, password: hashedPw, companyId, isVerified: true } }); staffCount++; }
    }
    results.staff = staffCount;

    // ── 4. Waybills (30) ──────────────────────────────────────────────────────
    const statuses = ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'EXCEPTION', 'ARRIVED_AT_HUB'];
    const waybillsCreated: any[] = [];
    for (let i = 0; i < 30; i++) {
      const client = randomItem(clients);
      const driver = randomItem(drivers);
      const status = randomItem(statuses) as any;
      const origin = randomItem(SA_CITIES);
      const dest = randomItem(SA_CITIES.filter(c => c !== origin));
      const amount = randomFloat(150, 2500);
      const daysBack = randomInt(0, 60);
      try {
        const wb = await this.prisma.waybill.create({
          data: {
            waybillNumber: waybillNo(),
            status,
            senderName: client.name,
            senderPhone: client.phone || '0110001234',
            receiverName: `${randomItem(['John', 'Sarah', 'Mike', 'Lisa', 'James'])} ${randomItem(['Smith', 'Jones', 'Williams', 'Brown', 'Davis'])}`,
            receiverPhone: `082${randomInt(1000000, 9999999)}`,
            origin, destination: dest,
            weight: randomFloat(0.5, 25),
            totalAmount: amount, amount,
            paymentType: client.billingType === 'COD' ? 'CASH' as any : client.billingType === 'CONTRACT' ? 'CREDIT' as any : 'BANK_TRANSFER' as any,
            paymentStatus: status === 'DELIVERED' ? 'PAID' : 'UNPAID',
            driverId: status !== 'PENDING' ? driver.id : undefined,
            deliveredAt: status === 'DELIVERED' ? daysAgo(randomInt(0, daysBack)) : undefined,
            companyId,
            createdAt: daysAgo(daysBack),
          },
        });
        waybillsCreated.push(wb);
      } catch (e) { this.logger.warn(`Waybill ${i} skip: ${e.message}`); }
    }
    results.waybills = waybillsCreated.length;

    // ── 5. Collections (10) ───────────────────────────────────────────────────
    let colCount = 0;
    for (let i = 0; i < 10; i++) {
      const client = randomItem(clients);
      const cstatus = randomItem(['NEW', 'NEW', 'IN_PROGRESS', 'COMPLETED', 'COLLECTED']);
      try {
        await this.prisma.collection.create({
          data: {
            name: `Collection #${randomInt(1000, 9999)}`,
            referenceNo: `COL-${Date.now().toString(36).toUpperCase()}`,
            status: cstatus,
            collectionAddress: `${randomInt(1, 999)} ${randomItem(['Main Road', 'Industrial Ave', 'Commerce St'])}, ${randomItem(SA_CITIES)}`,
            scheduledDate: cstatus === 'NEW' ? new Date(Date.now() + randomInt(1, 7) * 86400000) : daysAgo(randomInt(0, 30)),
            completedAt: ['COMPLETED', 'COLLECTED'].includes(cstatus) ? daysAgo(randomInt(0, 10)) : undefined,
            collectedAt: cstatus === 'COLLECTED' ? daysAgo(randomInt(0, 5)) : undefined,
            companyId, clientId: client.id,
            createdAt: daysAgo(randomInt(0, 45)),
          },
        });
        colCount++;
      } catch (e) { this.logger.warn(`Collection ${i} skip: ${e.message}`); }
    }
    results.collections = colCount;

    // ── 6. Rate Card ──────────────────────────────────────────────────────────
    const existingRC = await this.prisma.rateCard.findFirst({ where: { companyId } });
    if (!existingRC) {
      await this.prisma.rateCard.create({ data: { name: 'Standard Rate', baseFee: 75, perKm: 4.5, perKg: 12, fuelSurchargePercent: 8, minCharge: 75, isActive: true, companyId } });
      results.rateCards = 1;
    }

    // ── 7. Invoice Draft ──────────────────────────────────────────────────────
    const existingDraft = await this.prisma.invoiceDraft.findFirst({ where: { companyId, status: 'DRAFT' } });
    if (!existingDraft && waybillsCreated.length > 0) {
      const draft = await this.prisma.invoiceDraft.create({ data: { companyId, status: 'DRAFT', total: 0 } });
      const delivered = waybillsCreated.filter(w => w.status === 'DELIVERED').slice(0, 5);
      let total = 0;
      for (const wb of delivered) {
        const amt = wb.totalAmount || 250;
        total += amt;
        await this.prisma.invoiceDraftLine.create({ data: { invoiceDraftId: draft.id, description: `Delivery: ${wb.waybillNumber}`, quantity: 1, unitPrice: amt, amount: amt } });
      }
      await this.prisma.invoiceDraft.update({ where: { id: draft.id }, data: { total } });
      results.invoiceDrafts = 1;
    }

    this.logger.log(`✅ Demo seeded: ${JSON.stringify(results)}`);
    return {
      success: true,
      message: '🌱 Demo data seeded! Refresh your dashboard to see live data.',
      created: results,
    };
  }
}
