// src/invoice/invoices.service.ts - MINIMAL VERSION
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument = require('pdfkit');

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.invoice.findMany({
      include: { company: { select: { name: true } } }
    });
  }

  async findByCompany(companyId: number) {
    return this.prisma.invoice.findMany({
      where: { companyId },
      include: { company: { select: { name: true } } }
    });
  }

  async findOne(id: string) { // ✅ ID is string (UUID)
    return this.prisma.invoice.findUnique({
      where: { id },
      include: { company: { select: { name: true } } }
    });
  }

  async markAsPaid(id: string) { // ✅ ID is string
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() }
    });
  }

  // ✅ Minimal supervisor dashboard - no aggregates that might not exist
  async getSupervisorDashboard() {
    const [total, paid, pending, overdue] = await Promise.all([
      this.prisma.invoice.count(),
      this.prisma.invoice.count({ where: { status: 'paid' } }),
      this.prisma.invoice.count({ where: { status: 'pending' } }),
      this.prisma.invoice.count({ where: { status: 'overdue' } }),
    ]);

    return {
      totalInvoices: total,
      paidInvoices: paid,
      pendingInvoices: pending,
      overdueInvoices: overdue,
      timestamp: new Date().toISOString()
    };
  }

  // ✅ Minimal platform metrics
  async getPlatformMetrics() {
    const total = await this.prisma.invoice.count();
    return {
      totalInvoices: total,
      timestamp: new Date().toISOString()
    };
  }

  // ✅ Minimal company metrics
  async getCompanyMetrics(companyId: number) {
    const total = await this.prisma.invoice.count({ where: { companyId } });
    return {
      totalInvoices: total,
      companyId
    };
  }

  // ✅ PDF generation - minimal, schema-safe
  async generateInvoicePdf(id: string): Promise<Buffer> {
    this.logger.log(`📄 Generating PDF for Invoice: ${id}`);
    
    // ✅ Use string ID for UUID schema
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { company: true },
    });
    
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    const invData = invoice as any;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Minimal PDF content
      doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'right' });
      doc.fontSize(12).text(`Invoice ID: ${id}`, { align: 'right' });
      doc.moveDown(2);
      doc.fontSize(14).text(`Company: ${invData.company?.name || 'N/A'}`);
      doc.text(`Status: ${invData.status || 'N/A'}`);
      doc.moveDown(2);
      doc.text('Thank you for your business.');
      
      doc.end();
    });
  }
}
