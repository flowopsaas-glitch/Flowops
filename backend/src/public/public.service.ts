import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  private round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) // 100;
  }

  private money(n?: number | null) {
    const v = typeof n === 'number' ? n : 0;
    return this.round2(v).toFixed(2);
  }

  private prismaErrorToString(err: any) {
    try {
      const code = err?.code ? `code=${err.code}` : '';
      const meta = err?.meta ? ` meta=${JSON.stringify(err.meta)}` : '';
      const msg = err?.message ? String(err.message) : String(err);
      return [code, msg, meta].filter(Boolean).join(' | ');
    } catch {
      return String(err);
    }
  }

  private getSystemUserId(): number {
    const raw = process.env.PUBLIC_SYSTEM_USER_ID;
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    return 1;
  }

  private async ensureNotExpired(quoteId: number) {
    const quote = await (this.prisma as any).quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException('Quote not found');

    if (quote.expiresAt && new Date(quote.expiresAt).getTime() < Date.now()) {
      if (quote.acceptanceStatus !== 'EXPIRED') {
        await (this.prisma as any).quote.update({
          where: { id: quote.id },
          data: { acceptanceStatus: 'EXPIRED' },
        });
      }
      throw new ForbiddenException('Quote link has expired');
    }
  }

  async getPublicQuote(token: string) {
    const quote = await (this.prisma as any).quote.findUnique({
      where: { publicToken: token },
      include: { company: true },
    });

    if (!quote) throw new NotFoundException('Quote not found');

    await this.ensureNotExpired(quote.id);

    const latestVersion = await (this.prisma as any).quoteVersion.findFirst({
      where: { quoteId: quote.id },
      orderBy: { versionNumber: 'desc' },
    });

    return {
      token,
      quoteId: quote.id,
      company: {
        id: quote.company.id,
        name: quote.company.name,
        legalName: quote.company.legalName,
        vatNumber: quote.company.vatNumber,
        email: quote.company.email,
        phone: quote.company.phone,
        address: quote.company.address,
        logoFileName: quote.company.logoFileName,
      },
      acceptanceStatus: quote.acceptanceStatus,
      acceptedAt: quote.acceptedAt,
      expiresAt: quote.expiresAt,
      status: quote.status,
      snapshot: latestVersion
        ? {
            versionNumber: latestVersion.versionNumber,
            title: latestVersion.title,
            notes: latestVersion.notes,
            subtotal: latestVersion.subtotal,
            fuel: latestVersion.fuel,
            vat: latestVersion.vat,
            total: latestVersion.total,
            rateCardId: latestVersion.rateCardId,
            lineItems: latestVersion.lineItemsJson,
            explanation: latestVersion.explanation,
            riskFlags: latestVersion.riskFlags,
            createdAt: latestVersion.createdAt,
          }
        : {
            versionNumber: 0,
            title: quote.title,
            notes: quote.notes,
            subtotal: quote.subtotal,
            fuel: quote.fuel,
            vat: quote.vat,
            total: quote.total,
            rateCardId: quote.rateCardId,
            lineItems: [],
            explanation: quote.notes,
            riskFlags: [],
            createdAt: quote.updatedAt,
          },
    };
  }

  async acceptPublicQuote(token: string, body: { name?: string; email?: string }) {
    const quote = await (this.prisma as any).quote.findUnique({
      where: { publicToken: token },
      include: { company: true },
    });
    if (!quote) throw new NotFoundException('Quote not found');

    await this.ensureNotExpired(quote.id);

    // Idempotent accept: if already accepted, return ok
    if (quote.acceptanceStatus === 'ACCEPTED') {
      // Try to find the most recent collection linked to this quote via relation
      const existing = await (this.prisma as any).collection.findFirst({
        where: {
          quote: { is: { id: quote.id } },
        } as any,
        orderBy: { id: 'desc' },
        select: { id: true },
      });

      return {
        ok: true,
        message: 'Already accepted',
        quoteId: quote.id,
        acceptedAt: quote.acceptedAt,
        acceptanceStatus: quote.acceptanceStatus,
        collectionCreated: false,
        collectionId: existing?.id ?? null,
      };
    }

    const latestVersion = await (this.prisma as any).quoteVersion.findFirst({
      where: { quoteId: quote.id },
      orderBy: { versionNumber: 'desc' },
    });

    const collectionName =
      latestVersion?.title || quote.title || `Accepted Quote #${quote.id} - ${quote.company.name}`;

    const acceptedNote =
      (quote.notes ?? '') +
      (body?.name || body?.email
        ? `\n\nAccepted by: ${body?.name ?? ''}${body?.email ? ` <${body.email}>` : ''}`
        : '');

    // ✅ Accept quote first (must succeed)
    const updatedQuote = await (this.prisma as any).quote.update({
      where: { id: quote.id },
      data: {
        acceptanceStatus: 'ACCEPTED',
        acceptedAt: new Date(),
        notes: acceptedNote,
      },
    });

    // ✅ Try create Collection draft; if it fails, do NOT 500
    try {
      const systemUserId = this.getSystemUserId();

      const createdCollection = await (this.prisma as any).collection.create({
        data: {
          name: collectionName,

          // ✅ REQUIRED relations in your schema
          company: { connect: { id: quote.companyId } },
          createdBy: { connect: { id: systemUserId } },

          // ✅ Link to quote via RELATION (your schema supports `quote`, not `quoteId`)
          quote: { connect: { id: updatedQuote.id } },

          // ✅ If Collection status is required and has no default, uncomment:
          // status: 'PENDING',
        } as any,
      });

      return {
        ok: true,
        quoteId: updatedQuote.id,
        acceptanceStatus: updatedQuote.acceptanceStatus,
        acceptedAt: updatedQuote.acceptedAt,
        collectionCreated: true,
        collectionId: createdCollection.id,
      };
    } catch (e) {
      const errText = (this.prisma as any).rrorToString(e);
      return {
        ok: true,
        quoteId: updatedQuote.id,
        acceptanceStatus: updatedQuote.acceptanceStatus,
        acceptedAt: updatedQuote.acceptedAt,
        collectionCreated: false,
        collectionError: errText,
      };
    }
  }

  // ----------------------------
  // Public PDF
  // ----------------------------

  async getPublicQuotePdf(token: string): Promise<{ fileName: string; pdfBuffer: Buffer }> {
    const data = await this.getPublicQuote(token);

    const company = data.company;
    const snap: any = data.snapshot || {};
    const lineItems: Array<{ description: string; amount: number }> = Array.isArray(snap.lineItems)
      ? snap.lineItems
      : [];

    const fileNameSafe = `Quote-${data.quoteId}-${(company.name || 'Company').replace(/[^\w\-]+/g, '_')}.pdf`;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (d: Buffer) => chunks.push(d));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // Logo (optional)
    try {
      if (company.logoFileName) {
        const logoPath = path.join(
          process.cwd(),
          'assets',
          'companies',
          String(company.id),
          company.logoFileName,
        );
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, 45, { width: 90 });
        }
      }
    } catch {
      // ignore logo issues
    }

    // Header
    doc.fontSize(18).text(company.legalName || company.name || 'Courier Company', 150, 50, { align: 'left' });
    doc.fontSize(10).fillColor('gray').text(company.address || '', 150, 74, { align: 'left' });
    doc.text(company.email || '', 150, 88, { align: 'left' });
    doc.text(company.phone || '', 150, 102, { align: 'left' });
    if (company.vatNumber) doc.text(`VAT: ${company.vatNumber}`, 150, 116, { align: 'left' });

    doc.moveDown(2);
    doc.fillColor('black');

    // Quote meta
    doc.fontSize(14).text(`Quote #${data.quoteId}`, { align: 'left' });
    doc.fontSize(11).text(`Status: ${data.status} | Acceptance: ${data.acceptanceStatus}`);
    if (data.expiresAt) doc.text(`Expires: ${new Date(data.expiresAt).toLocaleString()}`);
    doc.moveDown(1);

    // Title & explanation
    doc.fontSize(13).text(snap.title || 'Delivery Quote', { underline: true });
    doc.moveDown(0.5);
    if (snap.explanation) {
      doc.fontSize(10).fillColor('gray').text(String(snap.explanation));
      doc.fillColor('black');
      doc.moveDown(1);
    }

    // Line items
    doc.fontSize(12).text('Price Breakdown', { underline: true });
    doc.moveDown(0.5);

    const startX = 50;
    const colDesc = 380;
    const colAmt = 120;

    doc.fontSize(10).text('Description', startX, doc.y);
    doc.text('Amount', startX + colDesc, doc.y, { width: colAmt, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.4);

    for (const li of lineItems) {
      doc.fontSize(10).text(li.description, startX, doc.y, { width: colDesc });
      doc.text(this.money(li.amount), startX + colDesc, doc.y, { width: colAmt, align: 'right' });
      doc.moveDown(0.4);
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.8);

    // Totals
    const subtotal = snap.subtotal ?? 0;
    const fuel = snap.fuel ?? 0;
    const vat = snap.vat ?? 0;
    const total = snap.total ?? 0;

    doc.fontSize(11).text(`Subtotal: ${this.money(subtotal)}`, { align: 'right' });
    doc.text(`Fuel: ${this.money(fuel)}`, { align: 'right' });
    doc.text(`VAT: ${this.money(vat)}`, { align: 'right' });
    doc.fontSize(13).text(`Total: ${this.money(total)}`, { align: 'right' });

    // Risk flags
    const riskFlags: string[] = Array.isArray(snap.riskFlags) ? snap.riskFlags : [];
    if (riskFlags.length) {
      doc.moveDown(1.2);
      doc.fontSize(12).text('Notes // Flags', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10);
      for (const f of riskFlags) doc.text(`• ${f}`);
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(9).fillColor('gray').text('Generated by FlowOps', { align: 'center' });

    doc.end();

    const pdfBuffer = await done;
    return { fileName: fileNameSafe, pdfBuffer };
  }
}