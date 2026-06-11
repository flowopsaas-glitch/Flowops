import { Injectable } from '@nestjs/common';
// 🚀 FIX: Switching to a CommonJS-style require to satisfy the PDFKit constructor
const PDFDocument = require('pdfkit');

@Injectable()
export class PdfService {
  /**
   * 📄 Generates a professional PDF Manifest
   */
  async generateManifest(batchId: string, jobs: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err: any) => reject(err));

        // 1. Header Section
        doc.fontSize(25).text('FlowOps Logistics', { align: 'left' });
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

// 2. Batch Details
        doc.fontSize(14).text(`OFFICIAL LOAD MANIFEST: BATCH-${batchId}`, { underline: true });
        doc.moveDown();

        // 3. Table Headers
        const tableTop = doc.y;
        doc.fontSize(10).text('REF #', 50, tableTop);
        doc.text('DESTINATION', 150, tableTop);
        doc.text('STATUS', 350, tableTop);
        doc.text('SIGNATURE', 450, tableTop);
        
        doc.moveDown();
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // 4. Job Rows
        jobs.forEach((job: any) => {
          const y = doc.y;
          doc.text(job.waybillNumber || `AWB-00${job.id}`, 50, y);
          doc.text(job.collection?.name || 'Operations Zone', 150, y);
          doc.text(job.status, 350, y);
          doc.text('__________', 450, y);
          doc.moveDown();
        });

        // 5. Footer // Signature Blocks
        doc.moveDown(5);
        doc.text('Dispatch Sign: ____________________', 50, doc.y);
        doc.text('Driver Sign: ____________________', 350, doc.y);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}