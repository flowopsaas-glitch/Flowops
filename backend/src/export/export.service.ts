import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Generic CSV builder — no external dependency needed
function toCSV(headers: string[], rows: string[][]): string {
  const escape = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\r\n');
}

function fmt(val: any): string {
  if (val == null) return '';
  if (val instanceof Date) return val.toLocaleDateString('en-ZA');
  return String(val);
}

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  // ── Waybills ───────────────────────────────────────────────────────────────
  async exportWaybills(companyId: number): Promise<string> {
    const rows = await this.prisma.waybill.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    return toCSV(
      ['Waybill #', 'Status', 'Sender', 'Sender Phone', 'Receiver', 'Receiver Phone',
        'Origin', 'Destination', 'Weight (kg)', 'Amount (R)', 'Payment Type',
        'Payment Status', 'Delivered At', 'Created At'],
      rows.map(w => [
        fmt(w.waybillNumber), fmt(w.status), fmt(w.senderName), fmt(w.senderPhone),
        fmt(w.receiverName), fmt(w.receiverPhone), fmt(w.origin), fmt(w.destination),
        fmt(w.weight || w.weightKg), fmt(w.totalAmount || w.amount),
        fmt(w.paymentType), fmt(w.paymentStatus), fmt(w.deliveredAt), fmt(w.createdAt),
      ]),
    );
  }

  // ── Invoices ───────────────────────────────────────────────────────────────
  async exportInvoices(companyId: number): Promise<string> {
    const rows = await this.prisma.invoice.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    return toCSV(
      ['Invoice #', 'Status', 'Subtotal (R)', 'VAT (R)', 'Total (R)',
        'Due Date', 'Paid At', 'Payment Method', 'Notes', 'Created At'],
      rows.map(inv => [
        fmt(inv.invoiceNumber || inv.id.slice(0, 8).toUpperCase()),
        fmt(inv.status), fmt(inv.subtotal), fmt(inv.vatAmount), fmt(inv.total),
        fmt(inv.dueDate), fmt(inv.paidAt), fmt(inv.paymentMethod),
        fmt(inv.notes), fmt(inv.createdAt),
      ]),
    );
  }

  // ── Clients ────────────────────────────────────────────────────────────────
  async exportClients(companyId: number): Promise<string> {
    const rows = await this.prisma.client.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      take: 10000,
    });

    return toCSV(
      ['Name', 'Email', 'Phone', 'Address', 'Billing Type', 'Account Code',
        'Credit Limit (R)', 'Created At'],
      rows.map(c => [
        fmt(c.name), fmt(c.email), fmt(c.phone), fmt(c.address),
        fmt(c.billingType), fmt(c.accountCode), fmt(c.creditLimit), fmt(c.createdAt),
      ]),
    );
  }

  // ── Drivers ────────────────────────────────────────────────────────────────
  async exportDrivers(companyId: number): Promise<string> {
    const rows = await this.prisma.driver.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      take: 10000,
    });

    return toCSV(
      ['Name', 'Phone', 'Email', 'Vehicle Reg', 'Vehicle Type', 'Zone',
        'Status', 'Availability', 'Created At'],
      rows.map(d => [
        fmt(d.name), fmt(d.phone), fmt(d.email), fmt(d.vehicleReg),
        fmt(d.vehicleType), fmt(d.zone), fmt(d.status),
        fmt(d.availabilityStatus), fmt(d.createdAt),
      ]),
    );
  }

  // ── Collections ────────────────────────────────────────────────────────────
  async exportCollections(companyId: number): Promise<string> {
    const rows = await this.prisma.collection.findMany({
      where: { companyId },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    return toCSV(
      ['Name', 'Reference #', 'Status', 'Client', 'Address',
        'Scheduled Date', 'Completed At', 'Collector', 'Created At'],
      rows.map(c => [
        fmt(c.name), fmt(c.referenceNo), fmt(c.status), fmt(c.client?.name),
        fmt(c.collectionAddress), fmt(c.scheduledDate), fmt(c.completedAt),
        fmt(c.collectorName), fmt(c.createdAt),
      ]),
    );
  }

  // ── Audit Log ─────────────────────────────────────────────────────────────
  async exportAuditLog(companyId: number): Promise<string> {
    const rows = await this.prisma.activityLog.findMany({
      where: { companyId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    return toCSV(
      ['Action', 'Description', 'Entity Type', 'Entity ID', 'User', 'Email', 'IP Address', 'Created At'],
      rows.map(l => [
        fmt(l.action), fmt(l.description), fmt(l.entityType), fmt(l.entityId),
        fmt(l.user?.name), fmt(l.user?.email), fmt(l.ipAddress), fmt(l.createdAt),
      ]),
    );
  }
}
