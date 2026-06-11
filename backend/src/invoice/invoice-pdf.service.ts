import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { InvoicePdfModel, InvoiceLineItem, InvoiceParty, InvoiceStatus } from './invoice-pdf.types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

type MoneyOpts = { currency?: string };

@Injectable()
export class InvoicePdfService {
  async generateInvoice(input: InvoicePdfModel): Promise<Buffer> {
    const invoice = this.normalize(input);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Title: `Invoice ${invoice.invoiceNumber}`,
        Author: invoice.seller.name,
        Subject: 'Tax Invoice',
      },
    });

    const buffers: Buffer[] = [];
    doc.on('data', (b: Buffer) => buffers.push(b));

    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err: any) => reject(err));

      try {
        const colors = {
          brand: '#0F2E6E',
          ink: '#0B1220',
          muted: '#5B667A',
          border: '#E6EAF2',
          soft: '#F6F8FC',
        };

        const fonts = {
          regular: 'Helvetica',
          bold: 'Helvetica-Bold',
        };

        const page = this.pageBox(doc);
        this.assertPageBox(page);

        this.drawHeader(doc, invoice, page, colors, fonts);

        let y = this.n('startY', 160);

        y = this.drawTopBlocks(doc, invoice, page, colors, fonts, y);

        y = this.n('afterTopBlocksY', y + 18);
        y = this.drawItemsTable(doc, invoice, page, colors, fonts, y);

        y = this.n('afterItemsTableY', y + 16);
        y = this.drawTotalsAndNotes(doc, invoice, page, colors, fonts, y);

        this.addFootersAndPageNumbers(doc, invoice, colors, fonts);

        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  // =========================
  // Guards (STOP NaN crashes)
  // =========================
  private n(name: string, value: any): number {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) {
      throw new Error(`[InvoicePdfService] ${name} is not a finite number: ${String(value)}`);
    }
    return num;
  }

  private assertPageBox(page: any) {
    this.n('page.width', page.width);
    this.n('page.height', page.height);
    this.n('page.left', page.left);
    this.n('page.right', page.right);
    this.n('page.top', page.top);
    this.n('page.bottom', page.bottom);

    if (page.right <= page.left) {
      throw new Error(
        `[InvoicePdfService] invalid page box (right <= left): left=${page.left}, right=${page.right}`,
      );
    }
    if (page.bottom <= page.top) {
      throw new Error(
        `[InvoicePdfService] invalid page box (bottom <= top): top=${page.top}, bottom=${page.bottom}`,
      );
    }
  }

  // =========================
  // Normalization
  // =========================
  private normalize(input: InvoicePdfModel): Required<InvoicePdfModel> {
    const vatRate = this.safeNumber(input.vatRate, 0.15);
    const currency = input.currency || 'ZAR';

    const items = Array.isArray(input.items) ? input.items : [];
    const normalizedItems: InvoiceLineItem[] = items.map((i) => ({
      description: String(i.description || '').trim() || '—',
      quantity: this.safeNumber(i.quantity, 0),
      unitPrice: this.safeNumber(i.unitPrice, 0),
      unitLabel: i.unitLabel ? String(i.unitLabel) : undefined,
    }));

    const subtotal =
      typeof input.subtotal === 'number' && Number.isFinite(input.subtotal)
        ? this.round2(input.subtotal)
        : this.round2(normalizedItems.reduce((acc: any, it: any) => acc + it.quantity * it.unitPrice, 0));

    const vatAmount =
      typeof input.vatAmount === 'number' && Number.isFinite(input.vatAmount)
        ? this.round2(input.vatAmount)
        : this.round2(subtotal * vatRate);

    const total =
      typeof input.total === 'number' && Number.isFinite(input.total)
        ? this.round2(input.total)
        : this.round2(subtotal + vatAmount);

    const createdAt = this.safeDate(input.createdAt) || new Date();
    const dueDate =
      this.safeDate(input.dueDate) || new Date(createdAt.getTime() + 7 * 86400000);

    return {
      invoiceNumber: input.invoiceNumber || 'N/A',
      createdAt,
      dueDate,
      status: (input.status || 'SENT') as InvoiceStatus,

      seller: this.normalizeParty(input.seller, 'Seller'),
      buyer: this.normalizeParty(input.buyer, 'Customer'),

      sellerLogoPath: input.sellerLogoPath ?? null,
      paymentTerms: (input.paymentTerms || '').trim(),

      items: normalizedItems,

      currency,
      notes: (input.notes || 'Payment due by the due date. Please use the invoice number as your reference.').trim(),
      reference: (input.reference || '').trim(),

      subtotal,
      vatRate,
      vatAmount,
      total,

      banking: {
        bankName: input.banking?.bankName || '',
        accountName: input.banking?.accountName || '',
        accountNumber: input.banking?.accountNumber || '',
        branchCode: input.banking?.branchCode || '',
      },
    };
  }

  private safeDate(d: any): Date | null {
    if (!d) return null;
    const dt = new Date(d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  private normalizeParty(p: InvoiceParty | undefined, fallbackName: string): InvoiceParty {
    return {
      name: (p?.name || fallbackName).trim(),
      addressLines: (p?.addressLines?.length ? p.addressLines : [])
        .map((x) => String(x).trim())
        .filter(Boolean),
      vatNumber: p?.vatNumber ? String(p.vatNumber) : undefined,
      registrationNumber: p?.registrationNumber ? String(p.registrationNumber) : undefined,
      email: p?.email ? String(p.email) : undefined,
      phone: p?.phone ? String(p.phone) : undefined,
    };
  }

  private safeNumber(n: any, fallback = 0): number {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) // 100;
  }

  private money(n: number, opts: MoneyOpts): string {
    const value = this.round2(this.safeNumber(n, 0));
    const parts = value.toFixed(2).split('.');
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const sym = (opts.currency || 'ZAR') === 'ZAR' ? 'R' : opts.currency || 'ZAR';
    return `${sym} ${int}.${parts[1]}`;
  }

  private fmtDate(d: Date): string {
    // keep it safe
    const dt = this.safeDate(d) || new Date();
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  private pageBox(doc: any) {
    return {
      width: this.n('doc.page.width', doc.page.width),
      height: this.n('doc.page.height', doc.page.height),
      left: this.n('doc.page.margins.left', doc.page.margins.left),
      right: this.n('doc.page.width - margins.right', doc.page.width - doc.page.margins.right),
      top: this.n('doc.page.margins.top', doc.page.margins.top),
      bottom: this.n('doc.page.height - margins.bottom', doc.page.height - doc.page.margins.bottom),
    };
  }

  private ensureSpace(doc: any, need: number, page: any, reheader?: () => void) {
    const bottomLimit = this.n('bottomLimit', page.bottom - 80);
    const required = this.n('need', need);
    const currentY = this.n('doc.y', doc.y);

    if (currentY + required > bottomLimit) {
      doc.addPage();
      const p = this.pageBox(doc);
      page.width = p.width;
      page.height = p.height;
      page.left = p.left;
      page.right = p.right;
      page.top = p.top;
      page.bottom = p.bottom;

      if (reheader) reheader();
      doc.moveDown(1);
    }
  }

  // =========================
  // Header
  // =========================
  private drawHeader(doc: any, invoice: Required<InvoicePdfModel>, page: any, colors: any, fonts: any) {
    doc.save();
    doc.rect(this.n('hdr.rect.x', 0), this.n('hdr.rect.y', 0), this.n('hdr.rect.w', page.width), this.n('hdr.rect.h', 96)).fill(colors.brand);
    doc.restore();

    const logoPath =
      invoice.sellerLogoPath && fs.existsSync(invoice.sellerLogoPath) ? invoice.sellerLogoPath : null;

    if (logoPath) {
      doc.image(logoPath, this.n('hdr.logo.x', page.left), this.n('hdr.logo.y', 22), { height: 52 });
    } else {
      doc.font(fonts.bold).fillColor('#FFFFFF').fontSize(18).text(invoice.seller.name, this.n('hdr.seller.x', page.left), this.n('hdr.seller.y', 34), { width: 260 });
    }

    doc.font(fonts.bold).fillColor('#FFFFFF').fontSize(20).text('TAX INVOICE', this.n('hdr.title.x', page.left), this.n('hdr.title.y', 26), {
      width: this.n('hdr.title.w', page.right - page.left),
      align: 'right',
    });

    doc.font(fonts.regular).fillColor('#E9EEFF').fontSize(10).text(invoice.invoiceNumber, this.n('hdr.invno.x', page.left), this.n('hdr.invno.y', 52), {
      width: this.n('hdr.invno.w', page.right - page.left),
      align: 'right',
    });

    this.drawStatusPill(doc, invoice.status, page, colors, fonts);

    doc.moveTo(this.n('hdr.line.x1', page.left), this.n('hdr.line.y', 116)).lineTo(this.n('hdr.line.x2', page.right), this.n('hdr.line.y2', 116)).lineWidth(1).stroke(colors.border);
  }

  private drawStatusPill(doc: any, status: InvoiceStatus, page: any, colors: any, fonts: any) {
    const label = (status || 'SENT').toUpperCase();

    let fill = '#EEF2FF';
    let text = '#3730A3';
    let border = '#C7D2FE';

    if (label === 'PAID') { fill = '#EAF7EE'; text = '#1B7A3E'; border = '#BDE7C8'; }
    else if (label === 'OVERDUE') { fill = '#FFF1F2'; text = '#9F1239'; border = '#FBCFE8'; }
    else if (label === 'DRAFT') { fill = '#F3F4F6'; text = '#374151'; border = '#E5E7EB'; }
    else if (label === 'CANCELLED') { fill = '#FEF3C7'; text = '#92400E'; border = '#FDE68A'; }

    const w = this.n('pill.w', 98);
    const h = this.n('pill.h', 22);
    const x = this.n('pill.x', page.right - w);
    const y = this.n('pill.y', 72);

    doc.save();
    doc.roundedRect(x, y, w, h, 11).fill(fill).lineWidth(1).stroke(border);
    doc.font(fonts.bold).fillColor(text).fontSize(9).text(label, x, this.n('pill.labelY', y + 6), { width: w, align: 'center' });
    doc.restore();
  }

  // =========================
  // Top blocks
  // =========================
  private drawTopBlocks(doc: any, invoice: Required<InvoicePdfModel>, page: any, colors: any, fonts: any, y: number): number {
    const gap = this.n('top.gap', 12);
    const totalW = this.n('top.totalW', page.right - page.left);
    const leftW = this.n('top.leftW', Math.floor(totalW * 0.58));
    const rightW = this.n('top.rightW', totalW - leftW - gap);

    const leftX = this.n('top.leftX', page.left);
    const leftH = this.n('top.leftH', 170);

    this.card(doc, leftX, y, leftW, leftH, colors);

    doc.font(fonts.bold).fillColor(colors.ink).fontSize(10).text('From', this.n('top.fromX', leftX + 12), this.n('top.fromY', y + 12));
    doc.font(fonts.bold).fillColor(colors.ink).fontSize(12).text(invoice.seller.name, this.n('top.sellerX', leftX + 12), this.n('top.sellerY', y + 28), { width: leftW - 24 });

    doc.font(fonts.regular).fillColor(colors.muted).fontSize(9);
    doc.text(this.partyLines(invoice.seller, true).join('\n'), this.n('top.sellerAddrX', leftX + 12), this.n('top.sellerAddrY', y + 48), { width: leftW - 24, lineGap: 2 });

    doc.moveTo(this.n('top.divX1', leftX + 12), this.n('top.divY', y + 108)).lineTo(this.n('top.divX2', leftX + leftW - 12), this.n('top.divY2', y + 108)).lineWidth(1).stroke(colors.border);

    doc.font(fonts.bold).fillColor(colors.ink).fontSize(10).text('Bill To', this.n('top.billX', leftX + 12), this.n('top.billY', y + 118));
    doc.font(fonts.bold).fillColor(colors.ink).fontSize(12).text(invoice.buyer.name, this.n('top.buyerX', leftX + 12), this.n('top.buyerY', y + 134), { width: leftW - 24 });

    doc.font(fonts.regular).fillColor(colors.muted).fontSize(9);
    doc.text(this.partyLines(invoice.buyer, false).join('\n'), this.n('top.buyerAddrX', leftX + 12), this.n('top.buyerAddrY', y + 154), { width: leftW - 24, lineGap: 2 });

    const rightX = this.n('top.rightX', leftX + leftW + gap);
    this.card(doc, rightX, y, rightW, leftH, colors);

    doc.font(fonts.bold).fillColor(colors.ink).fontSize(10).text('Invoice Details', this.n('top.detailsX', rightX + 12), this.n('top.detailsY', y + 12));

    const rows = [
      { k: 'Invoice #', v: invoice.invoiceNumber },
      { k: 'Date', v: this.fmtDate(invoice.createdAt as any) },
      { k: 'Due Date', v: this.fmtDate(invoice.dueDate as any) },
      { k: 'Currency', v: invoice.currency },
      ...(invoice.reference ? [{ k: 'Reference', v: invoice.reference }] : []),
    ];

    let ry = this.n('top.rowsY', y + 34);
    for (const r of rows) {
      this.kv(doc, this.n('top.kvX', rightX + 12), ry, this.n('top.kvW', rightW - 24), r.k, r.v, colors, fonts);
      ry = this.n('top.ryNext', ry + 22);
    }

    return this.n('top.returnY', y + leftH);
  }

  private partyLines(p: InvoiceParty, includeRegVat: boolean): string[] {
    const lines: string[] = [];
    if (p.addressLines?.length) lines.push(...p.addressLines);

    const meta: string[] = [];
    if (includeRegVat && p.registrationNumber) meta.push(`Reg: ${p.registrationNumber}`);
    if (p.vatNumber) meta.push(`VAT: ${p.vatNumber}`);
    if (meta.length) lines.push(meta.join(' • '));

    const contact: string[] = [];
    if (p.email) contact.push(p.email);
    if (p.phone) contact.push(p.phone);
    if (contact.length) lines.push(contact.join(' • '));

    return lines.length ? lines : ['—'];
  }

  private kv(doc: any, x: number, y: number, w: number, k: string, v: string, colors: any, fonts: any) {
    this.n('kv.x', x); this.n('kv.y', y); this.n('kv.w', w);
    doc.font(fonts.bold).fillColor(colors.muted).fontSize(9).text(k, x, y, { width: 90 });
    doc.font(fonts.regular).fillColor(colors.ink).fontSize(10).text(String(v || '—'), this.n('kv.vx', x + 92), this.n('kv.vy', y - 1), {
      width: Math.max(10, this.n('kv.vw', w - 92)),
    });
  }

  private card(doc: any, x: number, y: number, w: number, h: number, colors: any) {
    this.n('card.x', x); this.n('card.y', y); this.n('card.w', w); this.n('card.h', h);
    doc.save();
    doc.roundedRect(x, y, w, h, 12).fill('#FFFFFF').lineWidth(1).stroke(colors.border);
    doc.restore();
  }

  // =========================
  // Items table
  // =========================
  private drawItemsTable(doc: any, invoice: Required<InvoicePdfModel>, page: any, colors: any, fonts: any, y: number): number {
    const tableX = this.n('table.x', page.left);
    const tableW = this.n('table.w', page.right - page.left);

    const headerH = this.n('table.headerH', 28);
    const rowMinH = this.n('table.rowMinH', 28);

    const cols = {
      desc: { x: tableX, w: this.n('col.desc.w', Math.floor(tableW * 0.52)) },
      qty: { x: this.n('col.qty.x', tableX + Math.floor(tableW * 0.52)), w: this.n('col.qty.w', Math.floor(tableW * 0.10)) },
      unit: { x: this.n('col.unit.x', tableX + Math.floor(tableW * 0.62)), w: this.n('col.unit.w', Math.floor(tableW * 0.18)) },
      amt: { x: this.n('col.amt.x', tableX + Math.floor(tableW * 0.80)), w: this.n('col.amt.w', Math.floor(tableW * 0.20)) },
    };

    doc.font(fonts.bold).fillColor(colors.ink).fontSize(12).text('Items', tableX, y);
    y = this.n('table.afterTitleY', y + 12);

    const renderHeader = () => {
      doc.save();
      doc.roundedRect(tableX, y, tableW, headerH, 10).fill(colors.soft).stroke(colors.border);
      doc.restore();

      doc.font(fonts.bold).fillColor(colors.muted).fontSize(9);
      doc.text('DESCRIPTION', this.n('hdr.desc.x', cols.desc.x + 10), this.n('hdr.desc.y', y + 9), { width: cols.desc.w - 20 });
      doc.text('QTY', cols.qty.x, this.n('hdr.qty.y', y + 9), { width: cols.qty.w, align: 'center' });
      doc.text('UNIT', cols.unit.x, this.n('hdr.unit.y', y + 9), { width: cols.unit.w - 10, align: 'right' });
      doc.text('AMOUNT', cols.amt.x, this.n('hdr.amt.y', y + 9), { width: cols.amt.w - 10, align: 'right' });

      y = this.n('table.afterHeaderY', y + headerH);
    };

    this.ensureSpace(doc, headerH + 10, page);
    renderHeader();

    const items = invoice.items.length ? invoice.items : [{ description: '—', quantity: 0, unitPrice: 0 }];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const qty = this.safeNumber(it.quantity, 0);
      const unitPrice = this.safeNumber(it.unitPrice, 0);
      const lineTotal = this.round2(qty * unitPrice);

      const desc = String(it.description || '').trim() || '—';
      const descH = this.n('row.descH', doc.heightOfString(desc, { width: this.n('row.descWidth', cols.desc.w - 20) }));
      const rowH = this.n('row.rowH', Math.max(rowMinH, descH + 12));

      this.ensureSpace(doc, rowH + 12, page, () => {
        y = this.n('table.reheaderY', 120);
        doc.font(fonts.bold).fillColor(colors.ink).fontSize(12).text('Items', tableX, y);
        y = this.n('table.reheaderAfterTitleY', y + 12);
        renderHeader();
      });

      doc.save();
      doc.rect(tableX, y, tableW, rowH).fill(i % 2 === 0 ? '#FFFFFF' : '#FBFCFF');
      doc.restore();

      doc.save();
      doc.moveTo(tableX, this.n('row.lineY', y + rowH)).lineTo(this.n('row.lineX2', tableX + tableW), this.n('row.lineY2', y + rowH)).lineWidth(1).stroke(colors.border);
      doc.restore();

      doc.font(fonts.regular).fillColor(colors.ink).fontSize(10);
      doc.text(desc, this.n('row.descX', cols.desc.x + 10), this.n('row.textY', y + 7), { width: cols.desc.w - 20 });
      doc.text(String(qty), cols.qty.x, this.n('row.qtyY', y + 7), { width: cols.qty.w, align: 'center' });

      doc.text(this.money(unitPrice, { currency: invoice.currency }), cols.unit.x, this.n('row.unitY', y + 7), {
        width: cols.unit.w - 10,
        align: 'right',
      });

      doc.font(fonts.bold).text(this.money(lineTotal, { currency: invoice.currency }), cols.amt.x, this.n('row.amtY', y + 7), {
        width: cols.amt.w - 10,
        align: 'right',
      });

      y = this.n('row.nextY', y + rowH);
    }

    return y;
  }

  // =========================
  // Totals + Notes + Payment Terms
  // =========================
  private drawTotalsAndNotes(doc: any, invoice: Required<InvoicePdfModel>, page: any, colors: any, fonts: any, y: number): number {
    const totalW = this.n('totals.totalW', page.right - page.left);
    const gap = this.n('totals.gap', 12);
    const leftW = this.n('totals.leftW', Math.floor(totalW * 0.58));
    const rightW = this.n('totals.rightW', totalW - leftW - gap);

    const leftX = this.n('totals.leftX', page.left);
    const rightX = this.n('totals.rightX', leftX + leftW + gap);

    const notesText = (invoice.notes || '').trim();
    const termsText = (invoice.paymentTerms || '').trim();

    const combinedLeftText = termsText
      ? `${notesText || '—'}\n\nPayment Terms:\n${termsText}`
      : (notesText || '—');

    const leftH = this.n(
      'totals.leftH',
      Math.max(110, this.n('totals.leftTextH', doc.heightOfString(combinedLeftText, { width: this.n('totals.leftTextW', leftW - 24) })) + 44),
    );
    const rightH = this.n('totals.rightH', 160);
    const blockH = this.n('totals.blockH', Math.max(leftH, rightH));

    this.ensureSpace(doc, blockH + 10, page);

    this.card(doc, leftX, y, leftW, blockH, colors);
    this.card(doc, rightX, y, rightW, blockH, colors);

    doc.font(fonts.bold).fillColor(colors.ink).fontSize(11).text('Notes', this.n('totals.notesX', leftX + 12), this.n('totals.notesY', y + 12));
    doc.font(fonts.regular).fillColor(colors.muted).fontSize(10).text(combinedLeftText, this.n('totals.textX', leftX + 12), this.n('totals.textY', y + 34), {
      width: leftW - 24,
      lineGap: 2,
    });

    doc.font(fonts.bold).fillColor(colors.ink).fontSize(11).text('Summary', this.n('totals.sumX', rightX + 12), this.n('totals.sumY', y + 12));

    let ty = this.n('totals.ty', y + 40);

    this.totalLine(doc, rightX, ty, rightW, 'Subtotal', this.money(invoice.subtotal, { currency: invoice.currency }), colors, fonts);
    ty = this.n('totals.ty2', ty + 20);

    const vatLabel = `VAT (${Math.round(this.safeNumber(invoice.vatRate, 0.15) * 100)}%)`;
    this.totalLine(doc, rightX, ty, rightW, vatLabel, this.money(invoice.vatAmount, { currency: invoice.currency }), colors, fonts);
    ty = this.n('totals.ty3', ty + 20);

    doc.moveTo(this.n('totals.divX1', rightX + 12), this.n('totals.divY', ty + 8)).lineTo(this.n('totals.divX2', rightX + rightW - 12), this.n('totals.divY2', ty + 8)).lineWidth(1).stroke(colors.border);
    ty = this.n('totals.ty4', ty + 18);

    this.totalLine(doc, rightX, ty, rightW, 'Total Due', this.money(invoice.total, { currency: invoice.currency }), colors, fonts, true);

    ty = this.n('totals.tyBadge', ty + 26);
    doc.save();
    doc.roundedRect(this.n('totals.badgeX', rightX + 12), ty, this.n('totals.badgeW', rightW - 24), this.n('totals.badgeH', 42), 10).fill(colors.brand);
    doc.font(fonts.bold).fillColor('#FFFFFF').fontSize(10).text('BALANCE DUE', this.n('totals.badgeTextX', rightX + 12), this.n('totals.badgeTextY', ty + 8), { width: rightW - 24, align: 'center' });
    doc.font(fonts.bold).fillColor('#FFFFFF').fontSize(16).text(this.money(invoice.total, { currency: invoice.currency }), this.n('totals.badgeAmtX', rightX + 12), this.n('totals.badgeAmtY', ty + 20), { width: rightW - 24, align: 'center' });
    doc.restore();

    return this.n('totals.returnY', y + blockH);
  }

  private totalLine(doc: any, x: number, y: number, w: number, label: string, value: string, colors: any, fonts: any, emphasize = false) {
    const pad = this.n('totalLine.pad', 12);
    this.n('totalLine.x', x); this.n('totalLine.y', y); this.n('totalLine.w', w);

    doc.font(emphasize ? fonts.bold : fonts.regular).fillColor(emphasize ? colors.ink : colors.muted).fontSize(emphasize ? 12 : 10);
    doc.text(label, this.n('totalLine.labelX', x + pad), y, { width: w - pad * 2, align: 'left' });

    doc.font(fonts.bold).fillColor(colors.ink).fontSize(emphasize ? 12 : 10);
    doc.text(value, this.n('totalLine.valueX', x + pad), y, { width: w - pad * 2, align: 'right' });
  }

  // =========================
  // Footer
  // =========================
  private addFootersAndPageNumbers(doc: any, invoice: Required<InvoicePdfModel>, colors: any, fonts: any) {
    const range = doc.bufferedPageRange();

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      const left = this.n('footer.left', doc.page.margins.left);
      const right = this.n('footer.right', doc.page.width - doc.page.margins.right);
      const footerY = this.n('footer.y', doc.page.height - doc.page.margins.bottom + 16);

      doc.moveTo(left, this.n('footer.lineY', footerY - 10)).lineTo(right, this.n('footer.lineY2', footerY - 10)).lineWidth(1).stroke(colors.border);

      const b = invoice.banking || {};
      const bankLine = [
        b.bankName ? `Bank: ${b.bankName}` : '',
        b.accountName ? `Acc Name: ${b.accountName}` : '',
        b.accountNumber ? `Acc No: ${b.accountNumber}` : '',
        b.branchCode ? `Branch: ${b.branchCode}` : '',
      ].filter(Boolean).join('   •   ');

      doc.font(fonts.regular).fillColor(colors.muted).fontSize(8);
      doc.text(bankLine || ' ', left, footerY, { width: right - left });

      doc.font(fonts.regular).fillColor(colors.muted).fontSize(8);
      doc.text(`Page ${i + 1} of ${range.count}`, left, footerY, { width: right - left, align: 'right' });
    }
  }
}