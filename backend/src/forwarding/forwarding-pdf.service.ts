import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { CustomsService } from './customs.service';

type DocType = 'commercial-invoice' | 'packing-list' | 'bill-of-lading' | 'sad500' | 'cmr' | 'certificate-of-origin' | 'dangerous-goods' | 'transit-bond' | 'zim-form47';

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
        case 'cmr': this.cmrConsignmentNote(doc, file); break;
        case 'certificate-of-origin': this.certificateOfOrigin(doc, file); break;
        case 'dangerous-goods': this.dangerousGoodsDeclaration(doc, file); break;
        case 'transit-bond': this.transitBond(doc, file); break;
        case 'zim-form47': this.zimForm47(doc, file, estimate); break;
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

  // ── CMR — International Road Consignment Note ──────────────────────────────
  // Required for cross-border road freight (SA ↔ ZW, SA ↔ Mozambique, etc.)
  // Based on the UNECE CMR Convention format.

  private cmrConsignmentNote(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'CMR — International Consignment Note');
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('Convention on the Contract for the International Carriage of Goods by Road (CMR)');
    doc.fillColor('#000').moveDown(0.8);

    // Box 1: Sender
    this.kv(doc, '1. Sender (Name, Address, Country):', file.shipperName);
    this.kv(doc, '   Address:', file.shipperAddress || '—');
    doc.moveDown(0.3);

    // Box 2: Consignee
    this.kv(doc, '2. Consignee (Name, Address, Country):', file.consigneeName);
    this.kv(doc, '   Address:', file.consigneeAddress || '—');
    doc.moveDown(0.3);

    // Box 3: Place of delivery
    this.kv(doc, '3. Place of Delivery:', file.pod || '—');
    doc.moveDown(0.3);

    // Box 4: Place and date of taking over
    this.kv(doc, '4. Place of Taking Over:', file.pol || '—');
    this.kv(doc, '   Date:', file.etd ? new Date(file.etd).toDateString() : '—');
    doc.moveDown(0.3);

    // Box 5: Documents attached
    this.kv(doc, '5. Documents Attached:', 'Commercial Invoice, Packing List');
    doc.moveDown(0.3);

    // Goods description
    doc.font('Helvetica-Bold').fontSize(10).text('6. Marks & Numbers / Number & Kind of Packages / Description of Goods');
    (file.cargo || []).forEach((c: any) => {
      doc.font('Helvetica').fontSize(9)
        .text(`• ${c.description} — ${c.pieces ?? '?'} pcs, ${c.weightKg ?? '?'} kg${c.hsCode ? `, HS: ${c.hsCode}` : ''}`);
    });
    doc.moveDown(0.5);

    // Weight & volume
    this.kv(doc, '11. Gross Weight (kg):', String(file.grossWeightKg ?? '—'));
    this.kv(doc, '12. Volume (CBM):', String(file.volumeCbm ?? '—'));
    doc.moveDown(0.3);

    // Carrier
    this.kv(doc, '16. Carrier (Name, Address):', file.carrierName || '—');
    doc.moveDown(0.3);

    // Vehicle
    this.kv(doc, '18. Vehicle Registration:', file.vehicleReg || '—');
    doc.moveDown(0.8);

    // Signatures
    doc.font('Helvetica-Bold').fontSize(9).text('Signatures:');
    doc.font('Helvetica').fontSize(9)
      .text('Sender: _________________________    Date: ___________')
      .text('Carrier: _________________________    Date: ___________')
      .text('Consignee: _________________________    Date: ___________');
  }

  // ── Certificate of Origin ──────────────────────────────────────────────────
  // Proves where goods were manufactured. Required for preferential duty rates
  // under SADC Trade Protocol, AGOA, and bilateral trade agreements.

  private certificateOfOrigin(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'Certificate of Origin', false);
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('SADC Trade Protocol / Preferential Certificate');
    doc.fillColor('#000').moveDown(0.8);

    this.kv(doc, '1. Exporter (Name, Address, Country):', file.shipperName);
    doc.moveDown(0.3);
    this.kv(doc, '2. Consignee (Name, Address, Country):', file.consigneeName);
    doc.moveDown(0.3);
    this.kv(doc, '3. Country of Origin:', file.originCountry || 'South Africa');
    this.kv(doc, '4. Country of Destination:', file.destinationCountry || '—');
    doc.moveDown(0.3);
    this.kv(doc, '5. Transport Details:', `${file.mode || 'ROAD'} — ${file.pol || '?'} to ${file.pod || '?'}`);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(10).text('6. Item Description / HS Code / Origin Criteria');
    (file.cargo || []).forEach((c: any) => {
      doc.font('Helvetica').fontSize(9)
        .text(`• ${c.description}  HS: ${c.hsCode || '—'}  Qty: ${c.pieces ?? '?'}  Value: ZAR ${(c.customsValue ?? 0).toFixed(2)}  Origin: Wholly obtained`);
    });
    doc.moveDown(0.5);

    this.kv(doc, '7. Total FOB Value:', `ZAR ${(file.cargo || []).reduce((s: number, c: any) => s + (c.customsValue ?? 0), 0).toFixed(2)}`);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(9).text('Declaration by the Exporter:');
    doc.font('Helvetica').fontSize(8)
      .text('I, the undersigned, declare that the goods described above meet the conditions required for the issue of this certificate.');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9)
      .text('Signature: _________________________    Date: ___________')
      .text('Place: _________________________    Stamp: ___________');
  }

  // ── Dangerous Goods Declaration ────────────────────────────────────────────
  // IMDG / ADR compliant. Required when transporting hazardous materials.

  private dangerousGoodsDeclaration(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'Dangerous Goods Declaration');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#b91c1c')
      .text('⚠️ HAZARDOUS MATERIALS — HANDLE WITH CARE');
    doc.fillColor('#000').moveDown(0.5);

    this.kv(doc, 'Shipper:', file.shipperName);
    this.kv(doc, 'Consignee:', file.consigneeName);
    this.kv(doc, 'Carrier:', file.carrierName || '—');
    this.kv(doc, 'Vehicle Reg:', file.vehicleReg || '—');
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(10).text('Dangerous Goods Details');
    doc.font('Helvetica').fontSize(9);
    (file.cargo || []).forEach((c: any) => {
      doc.text(`• ${c.description}`);
      doc.text(`  UN Number: ${(c as any).unNumber || '____'}  Class: ${(c as any).dgClass || '____'}  PG: ${(c as any).packingGroup || '____'}`);
      doc.text(`  Quantity: ${c.pieces ?? '?'} pcs, ${c.weightKg ?? '?'} kg`);
      doc.text(`  Emergency Contact: ${(c as any).emergencyPhone || '____________________'}`);
      doc.moveDown(0.3);
    });

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(9).text('Shipper\'s Declaration:');
    doc.font('Helvetica').fontSize(8)
      .text('I hereby declare that the contents of this consignment are fully and accurately described by the proper shipping name, and are classified, packaged, marked and labelled, and are in all respects in proper condition for transport according to applicable international and national governmental regulations.');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9)
      .text('Signature: _________________________    Date: ___________')
      .text('Name (Print): _________________________    Title: ___________');
  }

  // ── Transit Bond Documentation ─────────────────────────────────────────────
  // Required when goods pass THROUGH a country without customs clearance
  // (e.g., goods from Mozambique passing through Zimbabwe to South Africa).

  private transitBond(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'Transit Bond Declaration');
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('For goods in transit — not cleared for consumption in the transit country');
    doc.fillColor('#000').moveDown(0.8);

    this.kv(doc, 'Principal (Bond Holder):', file.shipperName);
    this.kv(doc, 'Guarantor (Surety):', '___________________________________');
    doc.moveDown(0.3);
    this.kv(doc, 'Office of Departure:', file.pol || '—');
    this.kv(doc, 'Office of Destination:', file.pod || '—');
    this.kv(doc, 'Transit Country/Countries:', file.transitCountries || '—');
    doc.moveDown(0.3);
    this.kv(doc, 'Mode of Transport:', file.mode || 'ROAD');
    this.kv(doc, 'Vehicle Registration:', file.vehicleReg || '—');
    this.kv(doc, 'Seal Numbers:', file.sealNumbers || '—');
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(10).text('Goods Under Transit');
    (file.cargo || []).forEach((c: any) => {
      doc.font('Helvetica').fontSize(9)
        .text(`• ${c.description} — ${c.pieces ?? '?'} pcs, ${c.weightKg ?? '?'} kg  HS: ${c.hsCode || '—'}  Value: ZAR ${(c.customsValue ?? 0).toFixed(2)}`);
    });

    const totalValue = (file.cargo || []).reduce((s: number, c: any) => s + (c.customsValue ?? 0), 0);
    doc.moveDown(0.5);
    this.kv(doc, 'Total Value of Goods:', `ZAR ${totalValue.toFixed(2)}`);
    this.kv(doc, 'Bond Amount (typically 110% of duties):', `ZAR ${(totalValue * 0.3 * 1.1).toFixed(2)} (estimated)`);
    doc.moveDown(0.5);
    this.kv(doc, 'Time Limit for Transit:', '72 hours from departure');
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(9).text('Undertaking:');
    doc.font('Helvetica').fontSize(8)
      .text('The principal undertakes to present the goods intact at the office of destination within the prescribed time limit. Failure to do so will result in the bond being called upon for payment of all duties and taxes.');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9)
      .text('Principal: _________________________    Date: ___________')
      .text('Customs Officer (Departure): _________________________    Stamp: ___________');
  }

  // ── Zimbabwe Form 47 — Import Declaration ──────────────────────────────────
  // ZIMRA (Zimbabwe Revenue Authority) import declaration form.
  // Required for ALL commercial imports into Zimbabwe.

  private zimForm47(doc: PDFKit.PDFDocument, file: any, estimate: any) {
    this.header(doc, file, 'ZIMRA Form 47 — Import Declaration (Draft)');
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('Zimbabwe Revenue Authority — Customs Declaration for Imports. Draft for agent capture — official submission via ASYCUDA.');
    doc.fillColor('#000').moveDown(0.8);

    // Section A: Declarant
    this.kv(doc, 'A1. Declarant/Agent:', file.consigneeName || '—');
    this.kv(doc, 'A2. Importer TIN:', (file as any).importerTin || '___________________');
    this.kv(doc, 'A3. Exporter:', file.shipperName);
    this.kv(doc, 'A4. Country of Origin:', file.originCountry || 'South Africa');
    this.kv(doc, 'A5. Country of Export:', file.originCountry || 'South Africa');
    doc.moveDown(0.3);

    // Section B: Transport
    this.kv(doc, 'B1. Mode of Transport:', file.mode || 'ROAD');
    this.kv(doc, 'B2. Port/Border of Entry:', file.pod || '—');
    this.kv(doc, 'B3. Vehicle Registration:', file.vehicleReg || '—');
    this.kv(doc, 'B4. Bill of Lading / Waybill No.:', file.fileNumber);
    doc.moveDown(0.3);

    // Section C: Goods
    doc.font('Helvetica-Bold').fontSize(10).text('C. Description of Goods');
    let totalCIF = 0;
    (file.cargo || []).forEach((c: any, i: number) => {
      const val = c.customsValue ?? 0; totalCIF += val;
      doc.font('Helvetica').fontSize(9)
        .text(`${i + 1}. ${c.description}`)
        .text(`   HS Code: ${c.hsCode || '—'}  Qty: ${c.pieces ?? '?'}  Weight: ${c.weightKg ?? '?'} kg`)
        .text(`   CIF Value (USD): ${val.toFixed(2)}  Duty Rate: ${c.dutyRatePct ?? 25}%`);
      doc.moveDown(0.2);
    });

    // Section D: Duties
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('D. Duty & Tax Calculation');
    const dutyRate = 0.25; // Zimbabwe general rate
    const vatRate = 0.15;  // Zimbabwe VAT
    const duty = totalCIF * dutyRate;
    const vat = (totalCIF + duty) * vatRate;
    doc.font('Helvetica').fontSize(9)
      .text(`Total CIF Value: USD ${totalCIF.toFixed(2)}`)
      .text(`Customs Duty (est. 25%): USD ${duty.toFixed(2)}`)
      .text(`VAT (15% on CIF + Duty): USD ${vat.toFixed(2)}`)
      .font('Helvetica-Bold').text(`Total Payable to ZIMRA (est.): USD ${(duty + vat).toFixed(2)}`);
    doc.moveDown(0.3);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#777')
      .text('Note: This is a draft estimate. Official assessment by ZIMRA via ASYCUDA is binding. Rates may vary by tariff heading.');
    doc.fillColor('#000').moveDown(0.5);

    doc.font('Helvetica').fontSize(9)
      .text('Declarant Signature: _________________________    Date: ___________')
      .text('ZIMRA Officer: _________________________    Stamp: ___________');
  }
}
