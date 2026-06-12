// src/invoice/invoices.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import PDFDocument = require('pdfkit');

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async findAll() {
    return this.prisma.invoice.findMany({
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByCompany(companyId: number) {
    return this.prisma.invoice.findMany({
      where: { companyId },
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: { company: true },
    });
  }

  async markAsPaid(id: string) {
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() },
    });
  }

  async getSupervisorDashboard() {
    const [total, paid, pending, overdue] = await Promise.all([
      this.prisma.invoice.count(),
      this.prisma.invoice.count({ where: { status: 'paid' } }),
      this.prisma.invoice.count({ where: { status: 'pending' } }),
      this.prisma.invoice.count({ where: { status: 'overdue' } }),
    ]);
    return { totalInvoices: total, paidInvoices: paid, pendingInvoices: pending, overdueInvoices: overdue, timestamp: new Date().toISOString() };
  }

  async getPlatformMetrics() {
    const total = await this.prisma.invoice.count();
    return { totalInvoices: total, timestamp: new Date().toISOString() };
  }

  async getCompanyMetrics(companyId: number) {
    const total = await this.prisma.invoice.count({ where: { companyId } });
    return { totalInvoices: total, companyId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📄 INVOICE PDF GENERATION — Branded FlowOps PDF
  // ═══════════════════════════════════════════════════════════════════════════
  async generateInvoicePdf(id: string): Promise<Buffer> {
    this.logger.log(`📄 Generating PDF for Invoice: ${id}`);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    const inv = invoice as any;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const BRAND = '#1a3a6e';
      const ACCENT = '#3b82f6';
      const LIGHT = '#f8fafc';
      const width = 595;

      // ── Header band ────────────────────────────────────────────────────────
      doc.rect(0, 0, width, 110).fill(BRAND);
      doc.fill('white').fontSize(28).font('Helvetica-Bold').text('FLOWOPS', 50, 30);
      doc.fontSize(10).font('Helvetica').text('Logistics, Evolved.', 50, 62);
      doc.fontSize(10).text('www.flowop.work  |  support@flowop.work', 50, 76);

      // Invoice badge (top right)
      doc.rect(width - 180, 20, 140, 70).fill(ACCENT);
      doc.fill('white').fontSize(22).font('Helvetica-Bold').text('INVOICE', width - 170, 30);
      doc.fontSize(9).font('Helvetica').text(`#${inv.invoiceNumber || id.slice(0, 8).toUpperCase()}`, width - 170, 58);
      doc.fontSize(9).text(new Date(inv.createdAt || Date.now()).toLocaleDateString('en-ZA'), width - 170, 72);

      // ── Company & Invoice meta ─────────────────────────────────────────────
      doc.fill('#1e293b').fontSize(13).font('Helvetica-Bold').text('BILLED TO', 50, 130);
      doc.fill('#374151').fontSize(11).font('Helvetica')
        .text(inv.company?.name || 'Client Company', 50, 148)
        .text(inv.company?.address || '', 50, 163)
        .text(inv.company?.email || '', 50, 178);

      doc.fill('#1e293b').fontSize(13).font('Helvetica-Bold').text('INVOICE DETAILS', 340, 130);
      const meta = [
        ['Status', (inv.status || 'PENDING').toUpperCase()],
        ['Due Date', inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-ZA') : 'On Receipt'],
        ['Payment', inv.paymentMethod || 'Bank Transfer'],
      ];
      meta.forEach(([label, value], i) => {
        doc.fill('#64748b').fontSize(10).font('Helvetica').text(label + ':', 340, 148 + i * 16);
        doc.fill('#1e293b').text(value, 430, 148 + i * 16);
      });

      // ── Divider ────────────────────────────────────────────────────────────
      doc.moveTo(50, 210).lineTo(width - 50, 210).strokeColor('#e2e8f0').lineWidth(1).stroke();

      // ── Line items table ───────────────────────────────────────────────────
      const tableY = 225;
      // Header row
      doc.rect(50, tableY, width - 100, 24).fill('#1e293b');
      doc.fill('white').fontSize(9).font('Helvetica-Bold')
        .text('DESCRIPTION', 60, tableY + 8)
        .text('QTY', 360, tableY + 8, { width: 40, align: 'right' })
        .text('UNIT PRICE', 405, tableY + 8, { width: 70, align: 'right' })
        .text('AMOUNT', 480, tableY + 8, { width: 65, align: 'right' });

      // Line items (use invoiceItems or fallback to single waybill line)
      const items: Array<{ desc: string; qty: number; unit: number; amount: number }> = [];
      if (inv.invoiceItems?.length > 0) {
        inv.invoiceItems.forEach((item: any) => {
          items.push({ desc: item.description || 'Service', qty: item.quantity || 1, unit: item.unitPrice || 0, amount: item.amount || 0 });
        });
      } else if (inv.waybillNumber) {
        items.push({ desc: `Delivery: ${inv.waybillNumber}`, qty: 1, unit: inv.amount || 0, amount: inv.amount || 0 });
      } else {
        items.push({ desc: 'Logistics Services', qty: 1, unit: inv.total || inv.amount || 0, amount: inv.total || inv.amount || 0 });
      }

      let rowY = tableY + 24;
      items.forEach((item, i) => {
        if (i % 2 === 0) doc.rect(50, rowY, width - 100, 22).fill(LIGHT);
        doc.fill('#374151').fontSize(9).font('Helvetica')
          .text(item.desc.slice(0, 55), 60, rowY + 7)
          .text(String(item.qty), 360, rowY + 7, { width: 40, align: 'right' })
          .text(`R${item.unit.toFixed(2)}`, 405, rowY + 7, { width: 70, align: 'right' })
          .text(`R${item.amount.toFixed(2)}`, 480, rowY + 7, { width: 65, align: 'right' });
        rowY += 22;
      });

      // ── Totals ─────────────────────────────────────────────────────────────
      const subtotal = items.reduce((s, i) => s + i.amount, 0);
      const vatRate = 0.15;
      const vat = subtotal * vatRate;
      const total = subtotal + vat;

      rowY += 10;
      doc.moveTo(50, rowY).lineTo(width - 50, rowY).strokeColor('#e2e8f0').stroke();
      rowY += 10;

      const totals = [
        ['Subtotal', `R${subtotal.toFixed(2)}`],
        ['VAT (15%)', `R${vat.toFixed(2)}`],
      ];
      totals.forEach(([label, value]) => {
        doc.fill('#64748b').fontSize(10).font('Helvetica').text(label, 400, rowY);
        doc.fill('#1e293b').text(value, 480, rowY, { width: 65, align: 'right' });
        rowY += 18;
      });

      // Total band
      doc.rect(380, rowY, width - 380 - 50, 30).fill(BRAND);
      doc.fill('white').fontSize(13).font('Helvetica-Bold').text('TOTAL', 390, rowY + 8);
      doc.fill('white').text(`R${total.toFixed(2)}`, 440, rowY + 8, { width: 95, align: 'right' });

      // ── Banking details ────────────────────────────────────────────────────
      rowY += 60;
      doc.rect(50, rowY, width - 100, 75).fill('#f1f5f9').stroke('#e2e8f0');
      doc.fill(BRAND).fontSize(11).font('Helvetica-Bold').text('PAYMENT DETAILS', 65, rowY + 10);
      doc.fill('#374151').fontSize(9).font('Helvetica')
        .text('Bank: First National Bank  |  Account: 62831774519  |  Branch: 250655', 65, rowY + 26)
        .text('Reference: ' + (inv.invoiceNumber || id.slice(0, 8).toUpperCase()), 65, rowY + 42)
        .text('EFT payment required within 7 days of invoice date.', 65, rowY + 56);

      // ── Footer ─────────────────────────────────────────────────────────────
      doc.rect(0, 780, width, 62).fill(BRAND);
      doc.fill('white').fontSize(8).text(
        'FlowOps Logistics Platform  |  Reg No: 2026/000001/07  |  VAT No: 4300123456  |  support@flowop.work  |  www.flowop.work',
        50, 795, { align: 'center', width: width - 100 }
      );
      doc.fill('#93c5fd').fontSize(7).text('This is a computer-generated invoice. No signature required.', 50, 815, { align: 'center', width: width - 100 });

      doc.end();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📧 SEND INVOICE BY EMAIL
  // ═══════════════════════════════════════════════════════════════════════════
  async sendInvoiceByEmail(id: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    const inv = invoice as any;
    const recipientEmail = inv.company?.billingEmail || inv.company?.email;
    if (!recipientEmail) throw new NotFoundException('No billing email found for this company');

    const pdfBuffer = await this.generateInvoicePdf(id);
    await this.mail.sendInvoice({
      to: recipientEmail,
      subject: `FlowOps Invoice #${inv.invoiceNumber || id.slice(0, 8).toUpperCase()} — R${(inv.total || inv.amount || 0).toFixed(2)}`,
      invoiceNumber: inv.invoiceNumber || id.slice(0, 8).toUpperCase(),
      amount: inv.total || inv.amount || 0,
      attachments: [{ filename: `FlowOps-INV-${inv.invoiceNumber || id.slice(0, 8)}.pdf`, content: pdfBuffer, type: 'application/pdf' }],
    });
    this.logger.log(`📧 Invoice ${id} emailed to ${recipientEmail}`);
  }
}
