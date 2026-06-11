import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Response } from 'express';
const PDFDocument = require('pdfkit');

@Injectable()
export class BatchInvoiceService {
  private readonly logger = new Logger(BatchInvoiceService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService
  ) {}

  /**
   * Generate an invoice from a billing batch
   */
  async generateInvoiceFromBatch(batchId: number, sendEmail: boolean = false) {
    this.logger.log(`📄 Generating invoice for billing batch #${batchId}`);

    const batch = await this.prisma.billingBatch.findUnique({
      where: { id: batchId },
      include: {
        company: true,
        invoices: true,
      }
    });

    if (!batch) {
      throw new NotFoundException(`Billing batch #${batchId} not found`);
    }

    const waybills = await this.prisma.waybill.findMany({
      where: { billingBatchId: batchId }
    });

    if (waybills.length === 0) {
      throw new NotFoundException(`No waybills found in batch #${batchId}`);
    }

    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(batch.id).padStart(5, '0')}`;
    const subtotal = waybills.reduce((sum, w) => sum + (Number(w.amount || w.totalAmount) || 0), 0);
    const vatAmount = subtotal * 0.15;
    const total = subtotal + vatAmount;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        status: 'UNPAID',
        subtotal,
        vatAmount,
        total,
        dueDate,
        companyId: batch.companyId,
        billingBatchId: batch.id,
        notes: `Invoice for ${waybills.length} deliveries - Batch ${batch.batchNumber}`
      }
    });

    const invoiceItems = await Promise.all(
      waybills.map(wb => {
        const amount = Number(wb.amount || wb.totalAmount) || 0;
        const itemVat = amount * 0.15;
        return this.prisma.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            description: `Delivery: ${wb.waybillNumber} - ${wb.recipient || wb.destination || 'N/A'}${wb.weight ? ` (${wb.weight}kg)` : ''}`,
            quantity: 1,
            unitPrice: amount,
            amount,
            vatAmount: itemVat
          }
        });
      })
    );

    await this.prisma.billingBatch.update({
      where: { id: batchId },
      data: {
        status: 'INVOICED',
        invoicedAt: new Date()
      }
    });

    this.logger.log(`✅ Invoice ${invoiceNumber} created with ${invoiceItems.length} items`);

    // Auto-send email to client
    const emailResult = await this.sendInvoiceEmail(invoice.id);

    return {
      invoice,
      items: invoiceItems,
      waybillCount: waybills.length,
      downloadUrl: `/api/v1/billing-batches/invoices/${invoice.id}/pdf`,
      emailSent: emailResult.success,
      emailError: emailResult.error
    };
  }

  /**
   * Send invoice email with PDF attachment
   */
  async sendInvoiceEmail(invoiceId: string) {
    try {
      this.logger.log(`📧 Sending invoice email for ${invoiceId}`);

      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          company: true,
          items: true
        }
      });

      if (!invoice) {
        throw new NotFoundException(`Invoice ${invoiceId} not found`);
      }

      const invData = invoice as any;
      const companyEmail = invData.company?.billingEmail || invData.company?.email;

      if (!companyEmail) {
        this.logger.warn(`⚠️ No billing email for company ${invData.companyId}`);
        return { success: false, error: 'No billing email configured' };
      }

      // Generate PDF as buffer
      const pdfBuffer = await this.generateInvoicePdfBuffer(invoiceId);

      // Send email using MailService
      const result = await this.mailService.sendInvoice({
        to: companyEmail,
        subject: `Invoice ${invData.invoiceNumber} from FlowOps - R${Number(invData.total).toFixed(2)}`,
        invoiceNumber: invData.invoiceNumber,
        amount: invData.total,
        attachments: [
          {
            filename: `${invData.invoiceNumber}.pdf`,
            content: pdfBuffer,
            type: 'application/pdf'
          }
        ]
      });

      this.logger.log(`✅ Invoice email sent to ${companyEmail}`);

      return { success: true, result };
    } catch (error: any) {
      this.logger.error(`❌ Failed to send invoice email: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate PDF as buffer (for email attachment)
   */
  async generateInvoicePdfBuffer(invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: true,
        items: true,
        billingBatch: true
      }
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    const invData = invoice as any;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
      const buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fillColor('#1e40af').fontSize(28).font('Helvetica-Bold').text('FLOWOPS', 50, 50);
      doc.fontSize(10).fillColor('#6b7280').font('Helvetica').text('Logistics Platform (Pty) Ltd', 50, 80);
      doc.text('Randburg, Gauteng, South Africa', 50, 95);
      doc.text('VAT Reg: 4123456789', 50, 110);

      doc.fillColor('#1e40af').fontSize(32).font('Helvetica-Bold').text('INVOICE', 400, 50, { align: 'right', width: 150 });
      doc.fontSize(12).fillColor('#374151').font('Helvetica').text(`#${invData.invoiceNumber}`, 400, 85, { align: 'right', width: 150 });

      doc.moveTo(50, 165).lineTo(550, 165).strokeColor('#e5e7eb').lineWidth(1).stroke();

      // Bill To
      doc.fillColor('#6b7280').fontSize(9).font('Helvetica-Bold').text('BILL TO:', 50, 180);
      doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold').text(invData.company?.name || 'Client', 50, 195);

      // Table
      let currentY = 270;
      doc.fillColor('#1e40af').rect(50, currentY, 500, 25).fill();
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      doc.text('DESCRIPTION', 60, currentY + 8);
      doc.text('AMOUNT', 480, currentY + 8, { align: 'right' });

      currentY += 35;
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
      
      invData.items.forEach((item: any) => {
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }
        doc.text(item.description.substring(0, 50), 60, currentY, { width: 350 });
        doc.text(`R ${Number(item.amount).toFixed(2)}`, 480, currentY, { align: 'right' });
        currentY += 25;
      });

      // Totals
      currentY += 20;
      doc.fillColor('#374151').fontSize(11).font('Helvetica');
      doc.text('Subtotal:', 350, currentY);
      doc.text(`R ${Number(invData.subtotal || 0).toFixed(2)}`, 480, currentY, { align: 'right' });
      currentY += 20;
      doc.text('VAT (15%):', 350, currentY);
      doc.text(`R ${Number(invData.vatAmount || 0).toFixed(2)}`, 480, currentY, { align: 'right' });
      currentY += 25;
      doc.fillColor('#1e40af').fontSize(14).font('Helvetica-Bold');
      doc.text('TOTAL DUE:', 350, currentY);
      doc.text(`R ${Number(invData.total).toFixed(2)}`, 480, currentY, { align: 'right' });

      doc.end();
    });
  }

  /**
   * Generate PDF and stream to response (for download)
   */
  async generateInvoicePdf(invoiceId: string, res: Response) {
    this.logger.log(`📄 Generating PDF for invoice ${invoiceId}`);

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        company: true,
        items: true,
        billingBatch: true
      }
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    const invData = invoice as any;
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

    doc.pipe(res);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invData.invoiceNumber}.pdf"`);

    // Full PDF generation (same as before)
    doc.fillColor('#1e40af').fontSize(28).font('Helvetica-Bold').text('FLOWOPS', 50, 50);
    doc.fontSize(10).fillColor('#6b7280').font('Helvetica').text('Logistics Platform (Pty) Ltd', 50, 80);
    doc.text('Randburg, Gauteng, South Africa', 50, 95);
    doc.text('VAT Reg: 4123456789', 50, 110);
    doc.text('Email: billing@flowop.work', 50, 125);

    doc.fillColor('#1e40af').fontSize(32).font('Helvetica-Bold').text('INVOICE', 400, 50, { align: 'right', width: 150 });
    doc.fontSize(12).fillColor('#374151').font('Helvetica').text(`#${invData.invoiceNumber}`, 400, 85, { align: 'right', width: 150 });
    doc.fontSize(10).text(`Issued: ${new Date(invData.createdAt).toLocaleDateString('en-ZA')}`, 400, 105, { align: 'right', width: 150 });
    doc.text(`Due: ${invData.dueDate ? new Date(invData.dueDate).toLocaleDateString('en-ZA') : 'N/A'}`, 400, 120, { align: 'right', width: 150 });

    doc.moveTo(50, 165).lineTo(550, 165).strokeColor('#e5e7eb').lineWidth(1).stroke();

    doc.fillColor('#6b7280').fontSize(9).font('Helvetica-Bold').text('BILL TO:', 50, 180);
    doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold').text(invData.company?.name || 'Client', 50, 195);
    doc.fontSize(10).font('Helvetica').fillColor('#374151').text(invData.company?.address || 'South Africa', 50, 212);

    let currentY = 270;
    doc.fillColor('#1e40af').rect(50, currentY, 500, 25).fill();
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
    doc.text('DESCRIPTION', 60, currentY + 8);
    doc.text('QTY', 340, currentY + 8);
    doc.text('UNIT PRICE', 390, currentY + 8);
    doc.text('AMOUNT', 480, currentY + 8, { align: 'right' });

    currentY += 35;
    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    
    invData.items.forEach((item: any, index: number) => {
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      if (index % 2 === 0) {
        doc.fillColor('#f9fafb').rect(50, currentY - 5, 500, 25).fill();
      }

      doc.fillColor('#111827');
      doc.text(item.description.substring(0, 45), 60, currentY, { width: 270 });
      doc.text(String(item.quantity), 340, currentY);
      doc.text(`R ${Number(item.unitPrice).toFixed(2)}`, 390, currentY);
      doc.text(`R ${Number(item.amount).toFixed(2)}`, 480, currentY, { align: 'right' });
      
      currentY += 25;
    });

    currentY += 20;
    doc.moveTo(350, currentY).lineTo(550, currentY).strokeColor('#e5e7eb').stroke();
    currentY += 15;

    doc.fillColor('#374151').fontSize(11).font('Helvetica');
    doc.text('Subtotal:', 350, currentY);
    doc.text(`R ${Number(invData.subtotal || 0).toFixed(2)}`, 480, currentY, { align: 'right' });
    currentY += 20;
    doc.text('VAT (15%):', 350, currentY);
    doc.text(`R ${Number(invData.vatAmount || 0).toFixed(2)}`, 480, currentY, { align: 'right' });
    currentY += 25;
    doc.fillColor('#1e40af').fontSize(14).font('Helvetica-Bold');
    doc.text('TOTAL DUE:', 350, currentY);
    doc.text(`R ${Number(invData.total).toFixed(2)}`, 480, currentY, { align: 'right' });

    currentY += 50;
    doc.fillColor('#1e40af').fontSize(12).font('Helvetica-Bold').text('PAYMENT DETAILS', 50, currentY);
    currentY += 20;
    doc.fillColor('#374151').fontSize(10).font('Helvetica');
    doc.text('Bank: First National Bank (FNB)', 50, currentY); currentY += 15;
    doc.text('Account Name: FlowOps Logistics (Pty) Ltd', 50, currentY); currentY += 15;
    doc.text('Account Number: 62345678901', 50, currentY); currentY += 15;
    doc.text('Branch Code: 250655', 50, currentY); currentY += 15;
    doc.text('Reference: ' + invData.invoiceNumber, 50, currentY);

    const pages = (doc as any).bufferedPageRange().count;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage(i);
      doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
        .text(
          `FlowOps Logistics • Page ${i + 1} of ${pages} • Generated ${new Date().toLocaleString('en-ZA')}`,
          50, 800, { align: 'center', width: 500 }
        );
    }

    doc.end();
    this.logger.log(`✅ PDF generated for invoice ${invData.invoiceNumber}`);
  }

  async listInvoices(companyId?: number) {
    const where = companyId ? { companyId } : {};
    return this.prisma.invoice.findMany({
      where,
      include: {
        company: { select: { name: true } },
        _count: { select: { items: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: true,
        items: true,
        billingBatch: true
      }
    });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    return invoice;
  }

  async markAsPaid(id: string, paymentMethod?: string, reference?: string) {
    return this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentMethod: paymentMethod || 'BANK_TRANSFER',
        paymentReference: reference
      }
    });
  }
}
