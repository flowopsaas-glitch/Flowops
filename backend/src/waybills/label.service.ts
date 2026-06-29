import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import * as bwipjs from 'bwip-js';

/**
 * Generates printable parcel/shipping labels as PDF (4x6" — thermal-printer
 * friendly, but prints fine from any browser). Each label carries a Code128
 * barcode + QR of the tracking number, sender/recipient blocks, parcel details
 * and a COD banner, branded with the tenant's colour/name.
 */
@Injectable()
export class LabelService {
  private readonly logger = new Logger(LabelService.name);

  // 4 x 6 inch at 72pt/inch.
  private readonly W = 288;
  private readonly H = 432;
  private readonly M = 14;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateForWaybill(id: string, companyId: string) {
    const wb = await this.fetch(id, companyId);
    const buffer = await this.render([wb]);
    return { buffer, filename: `label-${this.safeName(wb.trackingNumber)}.pdf` };
  }

  async generateForMany(ids: string[], companyId: string) {
    const unique = [...new Set((ids ?? []).filter(Boolean))];
    if (!unique.length) throw new NotFoundException('No waybills selected');

    const wbs: any[] = [];
    for (const id of unique) {
      try {
        wbs.push(await this.fetch(id, companyId));
      } catch {
        /* skip missing/forbidden ids */
      }
    }
    if (!wbs.length) throw new NotFoundException('No matching waybills found');

    const buffer = await this.render(wbs);
    return { buffer, filename: `labels-${wbs.length}.pdf` };
  }

  // ── Data ────────────────────────────────────────────────────────────────

  private async fetch(id: string, companyId: string) {
    const wb = await this.prisma.waybill.findFirst({
      where: { id, companyId },
      include: {
        company: {
          select: { name: true, brandName: true, primaryColor: true },
        },
      },
    });
    if (!wb) throw new NotFoundException('Waybill not found');
    return wb;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private async render(waybills: any[]): Promise<Buffer> {
    const doc = new PDFDocument({ size: [this.W, this.H], margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const trackBase = this.config.get<string>('APP_URL', 'https://app.flowop.work');

    for (const wb of waybills) {
      doc.addPage({ size: [this.W, this.H], margin: 0 });
      // Pre-render images (async) before drawing the page synchronously.
      // Tracking page route is /track/:trackingNumber (see frontend App routes).
      const qrUrl = `${trackBase}/track/${encodeURIComponent(wb.trackingNumber)}`;
      const [qrBuf, barcodeBuf] = await Promise.all([
        QRCode.toBuffer(qrUrl, { margin: 0, width: 160 }),
        this.barcode(wb.trackingNumber),
      ]);
      this.drawLabel(doc, wb, qrBuf, barcodeBuf);
    }

    doc.end();
    return done;
  }

  private drawLabel(doc: any, wb: any, qrBuf: Buffer, barcodeBuf: Buffer) {
    const { W, H, M } = this;
    const accent = this.safeColor(wb.company?.primaryColor) ?? '#1e3a5f';
    const brand = wb.company?.brandName || wb.company?.name || 'FlowOps';
    let y = M;

    // Outer border
    doc.lineWidth(1).roundedRect(6, 6, W - 12, H - 12, 10).stroke('#e2e8f0');

    // Header — brand (left) + QR (right)
    doc.image(qrBuf, W - M - 60, y, { width: 60, height: 60 });
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(16).text(brand, M, y + 2, {
      width: W - M - 70,
      lineBreak: false,
      ellipsis: true,
    });
    doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(7).text('PARCEL LABEL', M, y + 24);
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(String(wb.status || 'PENDING').replace(/_/g, ' '), M, y + 38);
    y += 66;

    y = this.divider(doc, y);

    // FROM
    doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(7).text('FROM', M, y);
    y += 9;
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text(wb.senderName || '—', M, y, {
      width: W - 2 * M,
    });
    y = doc.y;
    doc.fillColor('#475569').font('Helvetica').fontSize(8).text(wb.senderAddress || '—', M, y, {
      width: W - 2 * M,
    });
    y = doc.y;
    if (wb.senderPhone) {
      doc.fillColor('#475569').fontSize(8).text(wb.senderPhone, M, y, { width: W - 2 * M });
      y = doc.y;
    }
    y += 4;

    y = this.divider(doc, y);

    // DELIVER TO (emphasised)
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(8).text('DELIVER TO', M, y);
    y += 11;
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(wb.recipientName || '—', M, y, { width: W - 2 * M });
    y = doc.y + 1;
    doc
      .fillColor('#1e293b')
      .font('Helvetica')
      .fontSize(10)
      .text(wb.recipientAddress || '—', M, y, { width: W - 2 * M });
    y = doc.y + 1;
    if (wb.recipientPhone) {
      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(wb.recipientPhone, M, y, { width: W - 2 * M });
      y = doc.y;
    }
    y += 6;

    y = this.divider(doc, y);

    // Parcel detail cells
    const colW = (W - 2 * M) / 3;
    const detailY = y;
    const cell = (i: number, label: string, val: string) => {
      const x = M + i * colW;
      doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(6.5).text(label, x, detailY, {
        width: colW - 4,
      });
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(val, x, detailY + 9, {
        width: colW - 4,
        lineBreak: false,
        ellipsis: true,
      });
    };
    cell(0, 'WEIGHT', wb.weight ? `${wb.weight} kg` : '—');
    cell(1, 'DIMENSIONS', wb.dimensions || '—');
    cell(2, 'VALUE', wb.totalAmount ? `R ${Number(wb.totalAmount).toFixed(2)}` : '—');
    y = detailY + 26;

    // COD banner
    if (wb.codAmount && Number(wb.codAmount) > 0) {
      doc.roundedRect(M, y, W - 2 * M, 18, 4).fill('#fee2e2');
      doc
        .fillColor('#b91c1c')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`CASH ON DELIVERY:  R ${Number(wb.codAmount).toFixed(2)}`, M, y + 5, {
          width: W - 2 * M,
          align: 'center',
        });
      y += 24;
    }

    // Barcode pinned near the bottom
    const bcW = W - 2 * M;
    const bcH = 54;
    const bcY = H - M - bcH - 18;
    doc.image(barcodeBuf, M, bcY, { width: bcW, height: bcH });
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(wb.trackingNumber, M, bcY + bcH + 1, {
        width: bcW,
        align: 'center',
        characterSpacing: 1,
      });

    // Footer
    doc
      .fillColor('#94a3b8')
      .font('Helvetica')
      .fontSize(6.5)
      .text(
        `${brand}  ·  Generated ${new Date().toLocaleString('en-ZA')}`,
        M,
        H - M - 7,
        { width: W - 2 * M, align: 'center' },
      );
  }

  private divider(doc: any, y: number): number {
    doc.moveTo(this.M, y).lineTo(this.W - this.M, y).lineWidth(0.5).stroke('#e2e8f0');
    return y + 8;
  }

  private async barcode(text: string): Promise<Buffer> {
    try {
      return await (bwipjs as any).toBuffer({
        bcid: 'code128',
        text: text || 'N/A',
        scale: 3,
        height: 12,
        includetext: false,
        paddingwidth: 0,
        paddingheight: 0,
      });
    } catch (err: any) {
      this.logger.warn(`Barcode generation failed for "${text}": ${err?.message}`);
      // 1x1 transparent PNG fallback so the PDF still renders.
      return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/1eRAAAAAElFTkSuQmCC',
        'base64',
      );
    }
  }

  private safeColor(c?: string | null): string | null {
    if (!c) return null;
    return /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : null;
  }

  private safeName(name: string): string {
    return (name || 'waybill').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  }
}
