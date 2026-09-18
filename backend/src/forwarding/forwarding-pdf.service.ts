import { Injectable, NotFoundException } from '@nestjs/common';
// pdfkit is CommonJS. This project's tsconfig has no esModuleInterop, so
// `import PDFDocument from 'pdfkit'` compiles but is undefined at runtime
// ("pdfkit_1.default is not a constructor"). import=require binds the real
// constructor. (The PDFKit.* type namespace remains available from @types/pdfkit.)
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma/prisma.service';
import { CustomsService } from './customs.service';

type DocType =
  | 'commercial-invoice' | 'packing-list' | 'bill-of-lading' | 'sad500'
  // Cross-border (Pan-African)
  | 'cmr' | 'certificate-of-origin' | 'dangerous-goods' | 'transit-bond'
  // Country-specific
  | 'zim-form47' | 'kenya-c17' | 'nigeria-sgd' | 'ghana-boe'
  | 'ethiopia-erca' | 'tanzania-tancis' | 'drc-dgda' | 'egypt-nafeza'
  | 'mozambique-jue' | 'botswana-burs' | 'uganda-ura' | 'rwanda-rra'
  | 'ivory-coast-dgd' | 'senegal-gainde' | 'cameroon-sydonia'
  // Regional bloc
  | 'comesa-cd' | 'ecowas-sgd' | 'eac-cd' | 'sadc-cd';

@Injectable()
export class ForwardingPdfService {
  private readonly W = 595; // A4 width
  private readonly M = 48;  // margin

  constructor(
    private readonly prisma: PrismaService,
    private readonly customs: CustomsService,
  ) {}


  async generate(companyId: string, fileId: string, type: DocType) {
    const file: any = await this.prisma.shipmentFile.findFirst({
      where: { id: fileId, companyId },
      include: { cargo: true, containers: true, charges: true },
    });
    if (!file) throw new NotFoundException('Shipment file not found');
    file.company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, brandName: true },
    });

    let estimate: any = null;
    if (['sad500', 'zim-form47'].includes(type)) {
      estimate = await this.customs.estimate(companyId, fileId);
    }

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
        case 'kenya-c17': this.kenyaC17(doc, file); break;
        case 'nigeria-sgd': this.nigeriaSGD(doc, file); break;
        case 'ghana-boe': this.ghanaBOE(doc, file); break;
        case 'ethiopia-erca': this.ethiopiaERCA(doc, file); break;
        case 'tanzania-tancis': this.tanzaniaTANCIS(doc, file); break;
        case 'drc-dgda': this.drcDGDA(doc, file); break;
        case 'egypt-nafeza': this.egyptNafeza(doc, file); break;
        case 'mozambique-jue': this.mozambiqueJUE(doc, file); break;
        case 'botswana-burs': this.botswanaBURS(doc, file); break;
        case 'uganda-ura': this.ugandaURA(doc, file); break;
        case 'rwanda-rra': this.rwandaRRA(doc, file); break;
        case 'ivory-coast-dgd': this.ivoryCoastDGD(doc, file); break;
        case 'senegal-gainde': this.senegalGAINDE(doc, file); break;
        case 'cameroon-sydonia': this.cameroonSYDONIA(doc, file); break;
        case 'comesa-cd': this.comesaCD(doc, file); break;
        case 'ecowas-sgd': this.ecowasDeclaration(doc, file); break;
        case 'eac-cd': this.eacDeclaration(doc, file); break;
        case 'sadc-cd': this.sadcDeclaration(doc, file); break;
      }
    });
    return { buffer, filename: `${type}-${file.fileNumber}.pdf` };
  }


  // ── Render helpers ───────────────────────────────────────────────────────

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

  private cargoTable(doc: PDFKit.PDFDocument, file: any) {
    (file.cargo || []).forEach((c: any) => {
      doc.font('Helvetica').fontSize(9)
        .text(`• ${c.description} — ${c.pieces ?? '?'} pcs, ${c.weightKg ?? '?'} kg${c.hsCode ? `, HS: ${c.hsCode}` : ''}${c.customsValue ? `, val ${c.customsValue}` : ''}`);
    });
  }

  private totalCIF(file: any): number {
    return (file.cargo || []).reduce((s: number, c: any) => s + (c.customsValue ?? 0), 0);
  }

  private signatures(doc: PDFKit.PDFDocument, labels: string[]) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(9).text('Signatures:');
    labels.forEach((l) => doc.font('Helvetica').fontSize(9).text(`${l}: _________________________    Date: ___________`));
  }

  /** Generic African customs declaration builder — used by all country-specific forms */
  private africanCustomsDeclaration(doc: PDFKit.PDFDocument, file: any, opts: {
    title: string; authority: string; system?: string; country: string;
    currencyCode: string; vatRate: number; defaultDutyRate: number;
    note: string; formNumber?: string;
  }) {
    this.header(doc, file, opts.title);
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text(`${opts.authority}${opts.system ? ` — ${opts.system}` : ''}`);
    if (opts.formNumber) doc.text(`Form: ${opts.formNumber}`);
    doc.fillColor('#000').moveDown(0.8);


    // Section A: Parties
    this.kv(doc, 'A1. Declarant/Agent:', file.consigneeName || '—');
    this.kv(doc, 'A2. Importer TIN:', file.importerTin || '___________________');
    this.kv(doc, 'A3. Exporter:', file.shipperName);
    this.kv(doc, 'A4. Country of Origin:', file.originCountry || '—');
    this.kv(doc, 'A5. Country of Export:', file.originCountry || '—');
    doc.moveDown(0.3);

    // Section B: Transport
    this.kv(doc, 'B1. Mode of Transport:', file.mode || 'ROAD');
    this.kv(doc, 'B2. Port/Border of Entry:', file.pod || '—');
    this.kv(doc, 'B3. Vehicle Registration:', file.vehicleReg || '—');
    this.kv(doc, 'B4. Waybill / B/L No.:', file.fileNumber);
    doc.moveDown(0.3);

    // Section C: Goods
    doc.font('Helvetica-Bold').fontSize(10).text('C. Description of Goods');
    let totalCIF = 0;
    (file.cargo || []).forEach((c: any, i: number) => {
      const val = c.customsValue ?? 0; totalCIF += val;
      doc.font('Helvetica').fontSize(9)
        .text(`${i + 1}. ${c.description}`)
        .text(`   HS Code: ${c.hsCode || '—'}  Qty: ${c.pieces ?? '?'}  Weight: ${c.weightKg ?? '?'} kg`)
        .text(`   CIF Value (${opts.currencyCode}): ${val.toFixed(2)}  Duty Rate: ${c.dutyRatePct ?? opts.defaultDutyRate}%`);
      doc.moveDown(0.2);
    });

    // Section D: Duties
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('D. Duty & Tax Calculation');
    const duty = totalCIF * (opts.defaultDutyRate / 100);
    const vat = (totalCIF + duty) * (opts.vatRate / 100);
    doc.font('Helvetica').fontSize(9)
      .text(`Total CIF Value: ${opts.currencyCode} ${totalCIF.toFixed(2)}`)
      .text(`Customs Duty (est. ${opts.defaultDutyRate}%): ${opts.currencyCode} ${duty.toFixed(2)}`)
      .text(`VAT/GST (${opts.vatRate}% on CIF + Duty): ${opts.currencyCode} ${vat.toFixed(2)}`)
      .font('Helvetica-Bold').text(`Total Payable (est.): ${opts.currencyCode} ${(duty + vat).toFixed(2)}`);
    doc.moveDown(0.3);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#777').text(opts.note);
    doc.fillColor('#000');
    this.signatures(doc, ['Declarant', `${opts.authority.split(' ')[0]} Officer`]);
  }


  // ══════════════════════════════════════════════════════════════════════════
  // ORIGINAL DOCUMENTS (4)
  // ══════════════════════════════════════════════════════════════════════════

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
    this.header(doc, file, 'SAD 500 — South Africa Customs Declaration (Draft)');
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


  // ══════════════════════════════════════════════════════════════════════════
  // CROSS-BORDER DOCUMENTS (5) — CMR, Origin, DG, Transit Bond, ZIM Form 47
  // ══════════════════════════════════════════════════════════════════════════

  private cmrConsignmentNote(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'CMR — International Consignment Note');
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('Convention on the Contract for the International Carriage of Goods by Road (CMR)');
    doc.fillColor('#000').moveDown(0.8);
    this.kv(doc, '1. Sender (Name, Address, Country):', file.shipperName);
    this.kv(doc, '   Address:', file.shipperAddress || '—');
    doc.moveDown(0.3);
    this.kv(doc, '2. Consignee (Name, Address, Country):', file.consigneeName);
    this.kv(doc, '   Address:', file.consigneeAddress || '—');
    doc.moveDown(0.3);
    this.kv(doc, '3. Place of Delivery:', file.pod || '—');
    this.kv(doc, '4. Place of Taking Over:', file.pol || '—');
    this.kv(doc, '   Date:', file.etd ? new Date(file.etd).toDateString() : '—');
    this.kv(doc, '5. Documents Attached:', 'Commercial Invoice, Packing List');
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).text('6. Marks & Numbers / Description of Goods');
    this.cargoTable(doc, file);
    doc.moveDown(0.5);
    this.kv(doc, '11. Gross Weight (kg):', String(file.grossWeightKg ?? '—'));
    this.kv(doc, '12. Volume (CBM):', String(file.volumeCbm ?? '—'));
    this.kv(doc, '16. Carrier:', file.carrierName || '—');
    this.kv(doc, '18. Vehicle Registration:', file.vehicleReg || '—');
    this.signatures(doc, ['Sender', 'Carrier', 'Consignee']);
  }

  private certificateOfOrigin(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'Certificate of Origin', false);
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('SADC Trade Protocol / AfCFTA Preferential Certificate');
    doc.fillColor('#000').moveDown(0.8);
    this.kv(doc, '1. Exporter:', file.shipperName);
    this.kv(doc, '2. Consignee:', file.consigneeName);
    this.kv(doc, '3. Country of Origin:', file.originCountry || 'South Africa');
    this.kv(doc, '4. Country of Destination:', file.destinationCountry || '—');
    this.kv(doc, '5. Transport:', `${file.mode || 'ROAD'} — ${file.pol || '?'} to ${file.pod || '?'}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('6. Goods / HS Code / Origin Criteria');
    (file.cargo || []).forEach((c: any) => {
      doc.font('Helvetica').fontSize(9)
        .text(`• ${c.description}  HS: ${c.hsCode || '—'}  Qty: ${c.pieces ?? '?'}  Value: ${(c.customsValue ?? 0).toFixed(2)}  Origin: Wholly obtained`);
    });
    doc.moveDown(0.5);
    this.kv(doc, '7. Total FOB Value:', `ZAR ${this.totalCIF(file).toFixed(2)}`);
    this.signatures(doc, ['Exporter', 'Chamber/Authority']);
  }


  private dangerousGoodsDeclaration(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'Dangerous Goods Declaration');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#b91c1c').text('HAZARDOUS MATERIALS — HANDLE WITH CARE');
    doc.fillColor('#000').moveDown(0.5);
    this.kv(doc, 'Shipper:', file.shipperName);
    this.kv(doc, 'Consignee:', file.consigneeName);
    this.kv(doc, 'Carrier:', file.carrierName || '—');
    this.kv(doc, 'Vehicle Reg:', file.vehicleReg || '—');
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('Dangerous Goods Details');
    (file.cargo || []).forEach((c: any) => {
      doc.font('Helvetica').fontSize(9)
        .text(`• ${c.description}`)
        .text(`  UN Number: ${c.unNumber || '____'}  Class: ${c.dgClass || '____'}  PG: ${c.packingGroup || '____'}`)
        .text(`  Quantity: ${c.pieces ?? '?'} pcs, ${c.weightKg ?? '?'} kg  Emergency: ${c.emergencyPhone || '____'}`);
      doc.moveDown(0.3);
    });
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(9).text('Shipper\'s Declaration:');
    doc.font('Helvetica').fontSize(8)
      .text('I hereby declare that the contents of this consignment are fully and accurately described by the proper shipping name, classified, packaged, marked and labelled, and are in all respects in proper condition for transport according to applicable international and national regulations.');
    this.signatures(doc, ['Shipper', 'Carrier']);
  }

  private transitBond(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'Transit Bond Declaration');
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('For goods in transit — not cleared for consumption in the transit country');
    doc.fillColor('#000').moveDown(0.8);
    this.kv(doc, 'Principal (Bond Holder):', file.shipperName);
    this.kv(doc, 'Guarantor (Surety):', '___________________________________');
    this.kv(doc, 'Office of Departure:', file.pol || '—');
    this.kv(doc, 'Office of Destination:', file.pod || '—');
    this.kv(doc, 'Transit Country/Countries:', file.transitCountries || '—');
    this.kv(doc, 'Mode of Transport:', file.mode || 'ROAD');
    this.kv(doc, 'Vehicle Registration:', file.vehicleReg || '—');
    this.kv(doc, 'Seal Numbers:', file.sealNumbers || '—');
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('Goods Under Transit');
    this.cargoTable(doc, file);
    const tv = this.totalCIF(file);
    doc.moveDown(0.5);
    this.kv(doc, 'Total Value:', `ZAR ${tv.toFixed(2)}`);
    this.kv(doc, 'Bond Amount (110% of duties):', `ZAR ${(tv * 0.3 * 1.1).toFixed(2)} (estimated)`);
    this.kv(doc, 'Time Limit:', '72 hours from departure');
    doc.moveDown(0.5).font('Helvetica').fontSize(8)
      .text('The principal undertakes to present the goods intact at the office of destination within the prescribed time limit.');
    this.signatures(doc, ['Principal', 'Customs Officer (Departure)']);
  }


  private zimForm47(doc: PDFKit.PDFDocument, file: any, estimate: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'ZIMRA Form 47 — Zimbabwe Import Declaration (Draft)',
      authority: 'Zimbabwe Revenue Authority (ZIMRA)',
      system: 'ASYCUDA World',
      country: 'Zimbabwe',
      currencyCode: 'USD',
      vatRate: 15,
      defaultDutyRate: 25,
      formNumber: 'Form 47',
      note: 'Draft estimate. Official assessment by ZIMRA via ASYCUDA is binding. Rates vary by tariff heading.',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COUNTRY-SPECIFIC DECLARATIONS (13 countries)
  // ══════════════════════════════════════════════════════════════════════════

  private kenyaC17(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Kenya Customs Declaration — Form C17',
      authority: 'Kenya Revenue Authority (KRA)',
      system: 'iCMS (Integrated Customs Management System)',
      country: 'Kenya',
      currencyCode: 'KES',
      vatRate: 16,
      defaultDutyRate: 25,
      formNumber: 'C17',
      note: 'Draft for agent capture in iCMS. Official KRA assessment is binding. EAC CET rates apply.',
    });
  }

  private nigeriaSGD(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Nigeria Single Goods Declaration (SGD)',
      authority: 'Nigeria Customs Service (NCS)',
      system: 'NICIS II (Nigeria Integrated Customs Information System)',
      country: 'Nigeria',
      currencyCode: 'NGN',
      vatRate: 7.5,
      defaultDutyRate: 20,
      formNumber: 'SGD',
      note: 'Draft for NICIS II capture. Official NCS assessment is binding. ECOWAS CET rates may apply.',
    });
  }

  private ghanaBOE(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Ghana Bill of Entry — Customs Declaration',
      authority: 'Ghana Revenue Authority (GRA)',
      system: 'GCMS (Ghana Customs Management System)',
      country: 'Ghana',
      currencyCode: 'GHS',
      vatRate: 15,
      defaultDutyRate: 20,
      formNumber: 'Bill of Entry',
      note: 'Draft for GCNet/GCMS capture. Official GRA assessment is binding. ECOWAS CET rates apply.',
    });
  }


  private ethiopiaERCA(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Ethiopia Customs Declaration — ERCA',
      authority: 'Ethiopian Customs Commission (ECC)',
      system: 'ASYCUDA World',
      country: 'Ethiopia',
      currencyCode: 'ETB',
      vatRate: 15,
      defaultDutyRate: 25,
      note: 'Draft for ASYCUDA capture. Official ECC assessment is binding.',
    });
  }

  private tanzaniaTANCIS(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Tanzania Customs Declaration — TANCIS',
      authority: 'Tanzania Revenue Authority (TRA)',
      system: 'TANCIS (Tanzania Customs Integrated System)',
      country: 'Tanzania',
      currencyCode: 'TZS',
      vatRate: 18,
      defaultDutyRate: 25,
      formNumber: 'C17 (EAC)',
      note: 'Draft for TANCIS capture. Official TRA assessment is binding. EAC CET rates apply.',
    });
  }

  private drcDGDA(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'DRC Customs Declaration — DGDA',
      authority: 'Direction Générale des Douanes et Accises (DGDA)',
      system: 'SYDONIA++ (ASYCUDA)',
      country: 'Democratic Republic of Congo',
      currencyCode: 'CDF',
      vatRate: 16,
      defaultDutyRate: 20,
      note: 'Draft for SYDONIA++ capture. Official DGDA assessment is binding. COMESA/SADC rates may apply.',
    });
  }

  private egyptNafeza(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Egypt Customs Declaration — Nafeza',
      authority: 'Egyptian Customs Authority (ECA)',
      system: 'Nafeza (National Single Window)',
      country: 'Egypt',
      currencyCode: 'EGP',
      vatRate: 14,
      defaultDutyRate: 30,
      note: 'Draft for Nafeza single-window capture. Official ECA assessment is binding. COMESA rates may apply for eligible goods.',
    });
  }

  private mozambiqueJUE(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Mozambique Customs Declaration — JUE',
      authority: 'Autoridade Tributária de Moçambique (AT)',
      system: 'JUE (Janela Única Electrónica)',
      country: 'Mozambique',
      currencyCode: 'MZN',
      vatRate: 16,
      defaultDutyRate: 20,
      note: 'Draft for JUE single-window capture. Official AT assessment is binding. SADC preferential rates may apply.',
    });
  }


  private botswanaBURS(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Botswana Customs Declaration — BURS',
      authority: 'Botswana Unified Revenue Service (BURS)',
      system: 'ASYCUDA World',
      country: 'Botswana',
      currencyCode: 'BWP',
      vatRate: 14,
      defaultDutyRate: 20,
      note: 'Draft for ASYCUDA capture. Official BURS assessment is binding. SACU/SADC rates apply.',
    });
  }

  private ugandaURA(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Uganda Customs Declaration — URA',
      authority: 'Uganda Revenue Authority (URA)',
      system: 'ASYCUDA World',
      country: 'Uganda',
      currencyCode: 'UGX',
      vatRate: 18,
      defaultDutyRate: 25,
      formNumber: 'C17 (EAC)',
      note: 'Draft for ASYCUDA capture. Official URA assessment is binding. EAC CET rates apply.',
    });
  }

  private rwandaRRA(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Rwanda Customs Declaration — RRA',
      authority: 'Rwanda Revenue Authority (RRA)',
      system: 'Rwanda Electronic Single Window',
      country: 'Rwanda',
      currencyCode: 'RWF',
      vatRate: 18,
      defaultDutyRate: 25,
      formNumber: 'C17 (EAC)',
      note: 'Draft for RRA single-window capture. Official RRA assessment is binding. EAC CET rates apply.',
    });
  }

  private ivoryCoastDGD(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: "Côte d'Ivoire Customs Declaration — DGD",
      authority: 'Direction Générale des Douanes (DGD)',
      system: 'SYDAM (Système de Dédouanement Automatisé)',
      country: "Côte d'Ivoire",
      currencyCode: 'XOF',
      vatRate: 18,
      defaultDutyRate: 20,
      note: 'Draft for SYDAM capture. Official DGD assessment is binding. ECOWAS CET rates apply.',
    });
  }

  private senegalGAINDE(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Senegal Customs Declaration — GAINDE',
      authority: 'Direction Générale des Douanes du Sénégal',
      system: 'GAINDE 2000',
      country: 'Senegal',
      currencyCode: 'XOF',
      vatRate: 18,
      defaultDutyRate: 20,
      note: 'Draft for GAINDE 2000 capture. Official assessment is binding. ECOWAS CET rates apply.',
    });
  }

  private cameroonSYDONIA(doc: PDFKit.PDFDocument, file: any) {
    this.africanCustomsDeclaration(doc, file, {
      title: 'Cameroon Customs Declaration — SYDONIA',
      authority: 'Direction Générale des Douanes du Cameroun',
      system: 'SYDONIA++ (ASYCUDA)',
      country: 'Cameroon',
      currencyCode: 'XAF',
      vatRate: 19.25,
      defaultDutyRate: 20,
      note: 'Draft for SYDONIA++ capture. Official assessment is binding. CEMAC CET rates apply.',
    });
  }


  // ══════════════════════════════════════════════════════════════════════════
  // REGIONAL BLOC DOCUMENTS (4)
  // ══════════════════════════════════════════════════════════════════════════

  private comesaCD(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'COMESA Customs Document (CD)');
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('Common Market for Eastern and Southern Africa — 21 member states')
      .text('Preferential tariff rates for intra-COMESA trade (Rules of Origin apply)');
    doc.fillColor('#000').moveDown(0.8);
    this.kv(doc, '1. Exporter:', file.shipperName);
    this.kv(doc, '2. Consignee:', file.consigneeName);
    this.kv(doc, '3. Country of Origin:', file.originCountry || '—');
    this.kv(doc, '4. Country of Destination:', file.destinationCountry || '—');
    this.kv(doc, '5. Transport Mode:', file.mode || 'ROAD');
    this.kv(doc, '6. Port of Loading:', file.pol || '—');
    this.kv(doc, '7. Port of Discharge:', file.pod || '—');
    this.kv(doc, '8. Vehicle/Vessel:', file.vehicleReg || file.vesselVoyage || '—');
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('9. Goods Description');
    this.cargoTable(doc, file);
    doc.moveDown(0.5);
    this.kv(doc, '10. Total CIF Value:', `USD ${this.totalCIF(file).toFixed(2)}`);
    this.kv(doc, '11. Preferential Rate Claimed:', 'Yes — COMESA Rules of Origin');
    doc.moveDown(0.5).font('Helvetica-Oblique').fontSize(8).fillColor('#777')
      .text('COMESA member states: Burundi, Comoros, DRC, Djibouti, Egypt, Eritrea, Eswatini, Ethiopia, Kenya, Libya, Madagascar, Malawi, Mauritius, Rwanda, Seychelles, Somalia, Sudan, Tunisia, Uganda, Zambia, Zimbabwe');
    doc.fillColor('#000');
    this.signatures(doc, ['Exporter', 'Customs Authority (Origin)', 'Customs Authority (Destination)']);
  }

  private ecowasDeclaration(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'ECOWAS Single Goods Declaration');
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('Economic Community of West African States — Common External Tariff (CET)')
      .text('Regulation C/REG.4/8/99 — Single Customs Declaration Form');
    doc.fillColor('#000').moveDown(0.8);
    this.kv(doc, '1. Exporter:', file.shipperName);
    this.kv(doc, '2. Consignee/Importer:', file.consigneeName);
    this.kv(doc, '3. Country of Origin:', file.originCountry || '—');
    this.kv(doc, '4. Country of Destination:', file.destinationCountry || '—');
    this.kv(doc, '5. Office of Entry:', file.pod || '—');
    this.kv(doc, '6. Mode of Transport:', file.mode || 'ROAD');
    this.kv(doc, '7. Vehicle/Vessel:', file.vehicleReg || file.vesselVoyage || '—');
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('8. Goods Declaration');
    this.cargoTable(doc, file);
    const tv = this.totalCIF(file);
    doc.moveDown(0.5);
    this.kv(doc, '9. Total CIF Value:', `USD ${tv.toFixed(2)}`);
    this.kv(doc, '10. CET Band:', 'Band 1 (0%) / Band 2 (5%) / Band 3 (10%) / Band 4 (20%) / Band 5 (35%)');
    doc.moveDown(0.5).font('Helvetica-Oblique').fontSize(8).fillColor('#777')
      .text('ECOWAS states: Benin, Burkina Faso, Cabo Verde, Gambia, Ghana, Guinea, Guinea-Bissau, Ivory Coast, Liberia, Mali, Niger, Nigeria, Senegal, Sierra Leone, Togo');
    doc.fillColor('#000');
    this.signatures(doc, ['Declarant', 'Customs Officer']);
  }


  private eacDeclaration(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'EAC Customs Declaration (C17)');
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('East African Community — Single Customs Territory')
      .text('Common External Tariff (CET): 0%, 10%, 25% bands');
    doc.fillColor('#000').moveDown(0.8);
    this.kv(doc, '1. Declarant/Agent:', file.consigneeName || '—');
    this.kv(doc, '2. Exporter:', file.shipperName);
    this.kv(doc, '3. Country of Origin:', file.originCountry || '—');
    this.kv(doc, '4. Country of Destination:', file.destinationCountry || '—');
    this.kv(doc, '5. Port of Entry:', file.pod || '—');
    this.kv(doc, '6. Mode of Transport:', file.mode || 'ROAD');
    this.kv(doc, '7. Vehicle Registration:', file.vehicleReg || '—');
    this.kv(doc, '8. Country of Transit:', file.transitCountries || '—');
    this.kv(doc, '9. Seal Numbers:', file.sealNumbers || '—');
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('10. Goods Description');
    this.cargoTable(doc, file);
    doc.moveDown(0.5);
    this.kv(doc, '11. Total CIF Value:', `USD ${this.totalCIF(file).toFixed(2)}`);
    this.kv(doc, '12. Total Packages:', String(file.packages ?? '—'));
    this.kv(doc, '13. Gross Weight (kg):', String(file.grossWeightKg ?? '—'));
    doc.moveDown(0.5).font('Helvetica-Oblique').fontSize(8).fillColor('#777')
      .text('EAC Partner States: Kenya, Tanzania, Uganda, Rwanda, Burundi, South Sudan, DRC, Somalia');
    doc.fillColor('#000');
    this.signatures(doc, ['Declarant', 'Customs Officer', 'Verifying Officer']);
  }

  private sadcDeclaration(doc: PDFKit.PDFDocument, file: any) {
    this.header(doc, file, 'SADC Customs Declaration');
    doc.font('Helvetica').fontSize(8).fillColor('#555')
      .text('Southern African Development Community — Trade Protocol')
      .text('Preferential tariff treatment for goods meeting SADC Rules of Origin');
    doc.fillColor('#000').moveDown(0.8);
    this.kv(doc, '1. Exporter:', file.shipperName);
    this.kv(doc, '2. Consignee:', file.consigneeName);
    this.kv(doc, '3. Country of Origin:', file.originCountry || '—');
    this.kv(doc, '4. Country of Destination:', file.destinationCountry || '—');
    this.kv(doc, '5. Office of Departure:', file.pol || '—');
    this.kv(doc, '6. Office of Destination:', file.pod || '—');
    this.kv(doc, '7. Mode of Transport:', file.mode || 'ROAD');
    this.kv(doc, '8. Vehicle Registration:', file.vehicleReg || '—');
    this.kv(doc, '9. Transit Countries:', file.transitCountries || '—');
    this.kv(doc, '10. Seal Numbers:', file.sealNumbers || '—');
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('11. Goods Description');
    this.cargoTable(doc, file);
    doc.moveDown(0.5);
    this.kv(doc, '12. Total CIF Value:', `USD ${this.totalCIF(file).toFixed(2)}`);
    this.kv(doc, '13. Preferential Treatment:', 'SADC Trade Protocol — Rules of Origin');
    doc.moveDown(0.5).font('Helvetica-Oblique').fontSize(8).fillColor('#777')
      .text('SADC states: Angola, Botswana, Comoros, DRC, Eswatini, Lesotho, Madagascar, Malawi, Mauritius, Mozambique, Namibia, Seychelles, South Africa, Tanzania, Zambia, Zimbabwe');
    doc.fillColor('#000');
    this.signatures(doc, ['Exporter', 'Customs (Origin)', 'Customs (Destination)']);
  }
}
