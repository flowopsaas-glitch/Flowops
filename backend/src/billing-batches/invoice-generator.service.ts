import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
const PDFDocument = require('pdfkit'); // 🛠️ Constructor Fix

@Injectable()
export class InvoiceGeneratorService {
  private readonly logger = new Logger(InvoiceGeneratorService.name);

  async generateInvoicePdf(batch: any, res: Response) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Stream directly to response
    doc.pipe(res);

    // --- Header Helper ---
    const generateHeader = (document: any) => {
      document.fillColor('#444444').fontSize(20).text('FLOWOPS LOGISTICS', 50, 57);
      document.fontSize(10).text('123 Logistics Way, Randburg', 50, 80);
      document.text('Gauteng, South Africa', 50, 95);
      
      document.fontSize(20).text('INVOICE', 400, 57, { align: 'right' });
      document.fontSize(10).text(`Batch ID: #${String(batch.id).padStart(4, '0')}`, 400, 80, { align: 'right' });
      document.text(`Date: ${new Date().toLocaleDateString()}`, 400, 95, { align: 'right' });
      document.moveDown().moveTo(50, 120).lineTo(550, 120).stroke('#eeeeee');
    };

    generateHeader(doc);

    // --- Bill To ---
    doc.fontSize(12).text('BILL TO:', 50, 140);
    doc.fontSize(14).fillColor('#000000').text(batch.company?.name || 'Standard Client', 50, 155);

    // --- Table Header ---
    let currentY = 210;
    const drawTableHeader = (y: number) => {
      doc.fillColor('#f9f9f9').rect(50, y, 500, 20).fill();
      doc.fillColor('#444444').fontSize(10).text('WAYBILL #', 60, y + 5);
      doc.text('RECIPIENT', 150, y + 5);
      doc.text('WEIGHT (KG)', 350, y + 5);
      doc.text('TOTAL (ZAR)', 450, y + 5, { align: 'right' });
    };

    drawTableHeader(currentY);
    currentY += 30;

    // --- Rows ---
    batch.waybills.forEach((wb: any) => {
      if (currentY > 700) { // Page break check
        doc.addPage();
        generateHeader(doc);
        currentY = 150;
        drawTableHeader(currentY);
        currentY += 30;
      }

      doc.fillColor('#000000').fontSize(10).text(wb.waybillNumber || 'N/A', 60, currentY);
      doc.text(wb.recipient || 'N/A', 150, currentY);
      doc.text(`${wb.weightKg} kg`, 350, currentY);
      doc.text(`R ${Number(wb.totalAmount || 0).toFixed(2)}`, 450, currentY, { align: 'right' });
      currentY += 25;
    });

    // --- Footer ---
    doc.moveTo(50, currentY).lineTo(550, currentY).stroke('#eeeeee');
    currentY += 15;
    doc.fontSize(14).fillColor('#10b981').text(`TOTAL REVENUE: R ${Number(batch.totalValue || 0).toFixed(2)}`, 50, currentY, { align: 'right' });

    doc.end();
    this.logger.log(`📄 Invoice PDF generated for Batch #${batch.id}`);
  }
}
