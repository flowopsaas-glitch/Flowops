import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateAnalyticsReport(companyId: number): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Fetch company info for branding
        const company = await this.prisma.company.findUnique({
          where: { id: companyId },
        });
        const companyName = company?.name || 'FlowOps Courier';

        // Fetch data
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        
        const waybills = await this.prisma.waybill.findMany({
          where: { companyId, createdAt: { gte: last30Days } },
        });
        const invoices = await this.prisma.invoice.findMany({
          where: { companyId, createdAt: { gte: last30Days } },
        });
        const drivers = await this.prisma.driver.findMany({ where: { companyId } });

        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
        const delivered = waybills.filter(w => w.status === 'DELIVERED').length;
        const failed = waybills.filter(w => w.status === 'FAILED' || w.status === 'EXCEPTION').length;
        const successRate = waybills.length > 0 ? (delivered / waybills.length) * 100 : 0;

        // Header with company branding
        doc.rect(0, 0, doc.page.width, 120).fill('#1e1b4b');
        doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold').text(companyName, 50, 30);
        doc.fontSize(18).text('Analytics Report', 50, 60);
        doc.fontSize(12).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString('en-ZA')}`, 50, 90);
        doc.text(`Period: Last 30 Days`, 50, 105);

        // Executive Summary
        doc.moveDown(2);
        doc.fillColor('#000000').fontSize(16).font('Helvetica-Bold').text('Executive Summary');
        doc.moveDown();
        doc.fontSize(10).font('Helvetica').text(
          `This report provides a comprehensive overview of ${companyName}'s logistics operations for the last 30 days. ` +
          `Total revenue generated was R${totalRevenue.toFixed(2)} across ${waybills.length} waybills, ` +
          `with a delivery success rate of ${successRate.toFixed(1)}%.`
        );

        // KPI Cards
        doc.moveDown(2);
        doc.fontSize(14).font('Helvetica-Bold').text('Key Performance Indicators');
        doc.moveDown();

        const kpis = [
          { label: 'Total Revenue', value: `R${totalRevenue.toFixed(2)}` },
          { label: 'Total Waybills', value: waybills.length.toString() },
          { label: 'Delivered', value: delivered.toString() },
          { label: 'Failed/Exceptions', value: failed.toString() },
          { label: 'Success Rate', value: `${successRate.toFixed(1)}%` },
          { label: 'Active Drivers', value: drivers.length.toString() },
        ];

        let xPos = 50;
        let yPos = doc.y;
        const cardWidth = (doc.page.width - 100) / 3;
        const cardHeight = 60;

        kpis.forEach((kpi, index) => {
          doc.rect(xPos, yPos, cardWidth - 10, cardHeight).fill('#f3f4f6').stroke('#d1d5db');
          doc.fillColor('#1f2937').fontSize(8).font('Helvetica').text(kpi.label, xPos + 10, yPos + 10);
          doc.fillColor('#111827').fontSize(14).font('Helvetica-Bold').text(kpi.value, xPos + 10, yPos + 30);
          
          xPos += cardWidth;
          if ((index + 1) % 3 === 0) {
            xPos = 50;
            yPos += cardHeight + 10;
          }
        });

        // Top Destinations
        doc.moveDown(4);
        doc.fontSize(14).font('Helvetica-Bold').text('Top Destinations');
        doc.moveDown();

        const destinations: Record<string, number> = {};
        waybills.forEach(w => {
          if (w.destination) destinations[w.destination] = (destinations[w.destination] || 0) + 1;
        });
        const topDestinations = Object.entries(destinations)
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .slice(0, 5);

        if (topDestinations.length > 0) {
          topDestinations.forEach(([dest, count], index) => {
            doc.fontSize(10).font('Helvetica').text(
              `${index + 1}. ${dest} - ${count} waybills`, 50, doc.y
            );
            doc.moveDown(0.5);
          });
        } else {
          doc.fontSize(10).font('Helvetica').text('No destination data available', 50, doc.y);
        }

        // Footer
        doc.moveDown(4);
        doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text(
          `Generated by FlowOps AI Analytics Engine for ${companyName} | Confidential`,
          50, doc.page.height - 50, { align: 'center' }
        );

        doc.end();
      } catch (error) {
        this.logger.error(`PDF generation error: ${error.message}`);
        reject(error);
      }
    });
  }
}
