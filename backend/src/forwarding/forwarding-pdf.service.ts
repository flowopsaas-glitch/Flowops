import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { CustomsService } from './customs.service';

type DocType = 'commercial-invoice' | 'packing-list' | 'bill-of-lading' | 'sad500';

@Injectable()
export class ForwardingPdfService {
  // A4
  private readonly W = 595;
  private readonly M = 48;

  constructor(
    private readonly prisma: PrismaService,
    private readonly customs: CustomsService,
  ) {}

  async generate(companyId: string, fileId: string, type: DocType) {
    const file: any = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId },
      include: {
        cargo: true,
        containers: true,
        charges: true,
      },
    });
    if (!file) throw new NotFoundException('Shipment file not found');
    // companyId is a plain column on ShipmentFile (no relation) — fetch brand separately.
    file.company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, brandName: true },
    });

    let estimate: any = null;
    if (type === 'sad500') estimate = await this.customs.estimate(companyId, fileId);

    const buffer = await this.render((doc) => {
      switch (type) {
        case 'commercial-invoice': this.commercialInvoice(doc, file); break;
        case 'packing-list': this.packingList(doc, file); break;
        case 'bill-of-lading': this.billOfLading(doc, file); break;
        case 'sad500': this.sad500(doc, file, estimate); break;
      }
    });
    return { buffer, filename: `${type}-${file.fileNumber}.pdf` };
  }

  // ── Render helper ────────────────────────────────────────────────────────

  private render(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: this.M });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    build(doc);
    doc.end();
    return done;
  }

  private header(doc: PDFKit.PDFDocument, file: any, title: string, draft = true) {
    const brand = file.company?.brandName || file.company?.name || 'FlowOps';
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0b1530').text(title, this.M, this.M);
    doc.font('Helvetica').fontSize(10).fillColor('#555')
      .text(`${brand}`, this.M, this.M + 24)
      .text(`File: ${file.fileNumber}    ${file.direction} · ${file.mode} · ${file.loadType}`, this.M, this.M + 38);
    if (draft) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#b91c1c')
        .text('DRAFT — for review, not an official lodgement', this.M, this.M + 52);
    }
    doc.moveTo(this.M, this.M + 70).lineTo(this.W - this.M, this.M + 70).strokeColor('#ddd').stroke();
    doc.fillColor('#000').y = this.M + 82;
  }

  private kv(doc: PDFKit.PDFDocument, label: string, value?: string | null) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text(label, { continued: true })
      .font('Helvetica').fillColor('#000').text(`  ${value || '—'}`);
  }

  private parties(doc: PDFKit.PDFDocument, file: any) {
    this.kv(doc, 'Shipper:', file.shipperName);
    this.kv(doc, 'Consignee:', file.consigneeName);
    this.kv(doc, 'Notify:', file.notifyParty);
    this.kv(doc, 'Carrier:', file.carrierName);
    this.kv(doc, 'Incoterm:', file.incoterm);
    doc.moveDown(0.5);
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  private commercialInvoice(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'Commercial Invoice', false);
    this.parties(doc, file);
    this.kv(doc, 'Route:', `${file.pol || '?'} → ${file.pod || '?'}`);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(10).text('Goods');
    let total = 0;
    (file.cargo || []).forEach((c: any) => {
      const v = c.customsValue ?? 0; total += v;
      doc.font('Helvetica').fontSize(9)
        .text(`• ${c.description}${c.hsCode ? `  (HS ${c.hsCode})` : ''}${c.pieces ? `  x${c.pieces}` : ''}   ZAR ${v.toFixed(2)}`);
    });
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text(`Total value: ZAR ${total.toFixed(2)}`);
  }

  private packingList(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'Packing List', false);
    this.parties(doc, file);
    doc.font('Helvetica-Bold').fontSize(10).text('Packages');
    (file.cargo || []).forEach((c: any) => {
      doc.font('Helvetica').fontSize(9)
        .text(`• ${c.description} — ${c.pieces ?? '?'} pcs, ${c.weightKg ?? '?'} kg${c.dimensions ? `, ${c.dimensions}` : ''}`);
    });
    if (file.containers?.length) {
      doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Containers');
      file.containers.forEach((c: any) =>
        doc.font('Helvetica').fontSize(9).text(`• ${c.containerNo} (${c.isoType})${c.sealNo ? ` seal ${c.sealNo}` : ''}${c.vgmKg ? ` VGM ${c.vgmKg}kg` : ''}`));
    }
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10)
      .text(`Totals: ${file.packages ?? '?'} packages, ${file.grossWeightKg ?? '?'} kg, ${file.volumeCbm ?? '?'} CBM`);
  }

  private billOfLading(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, `${file.mode === 'AIR' ? 'Air Waybill' : 'Bill of Lading'} (Draft)`);
    this.parties(doc, file);
    this.kv(doc, 'Vessel/Voyage:', file.vesselVoyage);
    this.kv(doc, 'Port of loading:', file.pol);
    this.kv(doc, 'Port of discharge:', file.pod);
    this.kv(doc, 'ETD:', file.etd ? new Date(file.etd).toDateString() : null);
    this.kv(doc, 'ETA:', file.eta ? new Date(file.eta).toDateString() : null);
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Description of goods');
    doc.font('Helvetica').fontSize(9).text(file.goodsDescription || '—');
    if (file.containers?.length) {
      doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Containers');
      file.containers.forEach((c: any) => doc.font('Helvetica').fontSize(9).text(`• ${c.containerNo} (${c.isoType})`));
    }
  }

  private sad500(doc: PDFKit.PDFDocument, file: any, estimate: any) {
    this.header(doc, file, 'SAD 500 — Customs Declaration (Draft)');
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text('Draft summary for clearing-agent capture. Not an official SARS SAD form; SARS assessment is binding.');
    doc.fillColor('#000').moveDown(0.5);
    this.parties(doc, file);
    this.kv(doc, 'Route:', `${file.pol || '?'} → ${file.pod || '?'}`);

    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Tariff lines');
    (file.cargo || []).forEach((c: any) => {
      doc.font('Helvetica').fontSize(9)
        .text(`• HS ${c.hsCode || '—'}  ${c.description}  value ZAR ${(c.customsValue ?? 0).toFixed(2)}  duty ${c.dutyRatePct ?? 0}%`);
    });

    if (estimate) {
      doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Duty & VAT estimate (ZAR)');
      const t = estimate.totals;
      doc.font('Helvetica').fontSize(9)
        .text(`Customs value: ${t.customsValue.toFixed(2)}`)
        .text(`Duty: ${t.duty.toFixed(2)}`)
        .text(`VAT (15% on ATV, +10% upliftment): ${t.vat.toFixed(2)}`)
        .font('Helvetica-Bold').text(`Total payable to SARS (est.): ${t.totalPayable.toFixed(2)}`);
      doc.moveDown(0.3).font('Helvetica-Oblique').fontSize(8).fillColor('#777').text(estimate.note);
    }
  }
}
