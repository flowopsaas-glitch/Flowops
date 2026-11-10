import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApplyCreditNoteDto, CreateNoteDto, UpdateNoteDto,
} from './dto/note.dto';
import {
  CreateSalespersonDto, GenerateCommissionDto, UpdateSalespersonDto,
} from './dto/commission.dto';
import { Money } from '../common/money.util';
import { claimTransition } from '../common/state-transition';

// Delegates to the shared integer-cents Money util so all accounting math is
// exact to the cent (no float drift in notes, commissions, statements).
const round2 = (n: number) => Money.round(n);

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  // ════════════════════════════ CREDIT NOTES ════════════════════════════

  listCreditNotes(companyId: string, q: any = {}) {
    const where: any = { companyId };
    if (q.status) where.status = q.status;
    if (q.clientName) where.clientName = { contains: String(q.clientName), mode: 'insensitive' };
    if (q.search) {
      const s = String(q.search);
      where.OR = [
        { number: { contains: s, mode: 'insensitive' } },
        { clientName: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.creditNote.findMany({
      where, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  async getCreditNote(id: string, companyId: string) {
    const cn = await this.prisma.creditNote.findFirst({ where: { id, companyId }, include: { items: true } });
    if (!cn) throw new NotFoundException('Credit note not found');
    return cn;
  }

  async createCreditNote(companyId: string, dto: CreateNoteDto) {
    const { subtotal, tax, total, items } = this.computeTotals(dto);
    const number = await this.nextNumber(companyId, 'CN', 'creditNote');
    return this.prisma.creditNote.create({
      data: {
        number, companyId,
        clientName: dto.clientName, clientEmail: dto.clientEmail,
        invoiceId: dto.invoiceId ?? null, reason: dto.reason,
        subtotal, tax, total,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  async updateCreditNote(id: string, companyId: string, dto: UpdateNoteDto) {
    const cn = await this.getCreditNote(id, companyId);
    if (cn.status !== 'DRAFT') throw new BadRequestException('Only DRAFT credit notes can be edited');
    const patch: any = {
      clientName: dto.clientName, clientEmail: dto.clientEmail,
      invoiceId: dto.invoiceId, reason: dto.reason,
    };
    if (dto.items) {
      const { subtotal, tax, total } = this.computeTotals({ items: dto.items, taxRate: dto.taxRate });
      Object.assign(patch, { subtotal, tax, total });
      await this.prisma.creditNoteItem.deleteMany({ where: { creditNoteId: id } });
      patch.items = { create: this.lineItems(dto.items) };
    }
    // The edit is multi-step (replace line items, then update the note), so
    // the claim and the edit are one transaction: without it a crash between
    // them leaves a note whose items were deleted but never recreated.
    return this.prisma.withTenant(companyId, async (tx) => {
      await claimTransition(
        () => tx.creditNote.updateMany({ where: { id, companyId, status: 'DRAFT' }, data: { status: 'DRAFT' } }),
        'Credit note is no longer a draft — it may have just been issued.',
      );
      await tx.creditNote.update({ where: { id }, data: patch, include: { items: true } });
      return tx.creditNote.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
  }

  async issueCreditNote(id: string, companyId: string) {
    const cn = await this.getCreditNote(id, companyId);
    if (cn.status !== 'DRAFT') throw new BadRequestException(`Cannot issue a ${cn.status} credit note`);
    // Issuing twice would re-stamp issuedAt and, worse, let two callers each
    // believe they were the one that moved it. The WHERE is the real guard.
    await this.prisma.withTenant(companyId, (tx) =>
      claimTransition(
        () => tx.creditNote.updateMany({
          where: { id, companyId, status: 'DRAFT' },
          data: { status: 'ISSUED', issuedAt: new Date() },
        }),
        'Credit note was issued by someone else.',
      ),
    );
    return this.prisma.creditNote.findUniqueOrThrow({ where: { id }, include: { items: true } });
  }

  /** Offset an issued credit note against an invoice (records appliedAmount). */
  async applyCreditNote(id: string, companyId: string, dto: ApplyCreditNoteDto) {
    const cn = await this.getCreditNote(id, companyId);
    if (cn.status !== 'ISSUED') throw new BadRequestException('Only ISSUED credit notes can be applied');

    const remaining = Money.subtract(cn.total, cn.appliedAmount);
    const amount = Money.round(dto.amount != null ? dto.amount : remaining);
    if (amount <= 0) throw new BadRequestException('Nothing left to apply on this credit note');
    if (Money.isGreater(amount, remaining)) {
      throw new BadRequestException(`Cannot apply ${amount}; only ${remaining} remains`);
    }

    const invoiceId = dto.invoiceId ?? cn.invoiceId ?? undefined;
    if (invoiceId) {
      const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, companyId } });
      if (!inv) throw new BadRequestException('Target invoice not found for this company');
    }

    // Claim the amount atomically.
    //
    // The guard above reads `appliedAmount` from a row this request fetched a
    // moment ago, and the new value was computed from it — so two concurrent
    // applies both read the same starting balance and the second write erased
    // the first. Money that had been applied simply vanished from the record.
    //
    // So the check moves into the WHERE clause, where the database evaluates it
    // against the committed value, and the new balance is an `increment` the
    // database computes rather than a number we hand it. A caller that loses
    // the race gets count === 0 and a 409 instead of silently overwriting.
    //
    // It runs inside withTenant() for two reasons: the claim and the status
    // update must commit together or not at all (a claimed amount with a stale
    // status would let the note be applied again), and it sets app.company_id
    // so row-level security covers these writes too.
    return this.prisma.withTenant(companyId, async (tx) => {
      const claim = await tx.creditNote.updateMany({
        where: {
          id,
          companyId,
          status: 'ISSUED',
          // appliedAmount + amount must not exceed the note total, in SQL.
          appliedAmount: { lte: Money.subtract(cn.total, amount) },
        },
        data: { appliedAmount: { increment: amount } },
      });
      if (claim.count === 0) {
        throw new ConflictException(
          'Credit note was already applied, or too little remains to apply this amount',
        );
      }

      // Status is derived from the COMMITTED balance, not the stale read, so it
      // converges however many callers raced on the claim.
      const applied = await tx.creditNote.findUniqueOrThrow({ where: { id } });
      const fullyApplied = !Money.isGreater(applied.total, applied.appliedAmount);

      return tx.creditNote.update({
        where: { id },
        data: {
          invoiceId: invoiceId ?? applied.invoiceId,
          status: fullyApplied ? 'APPLIED' : 'ISSUED',
          appliedAt: fullyApplied ? (applied.appliedAt ?? new Date()) : applied.appliedAt,
        },
        include: { items: true },
      });
    });
  }

  async voidCreditNote(id: string, companyId: string) {
    const cn = await this.getCreditNote(id, companyId);
    if (cn.status === 'APPLIED') throw new BadRequestException('Cannot void an already-applied credit note');
    await this.prisma.withTenant(companyId, (tx) =>
      claimTransition(
        () => tx.creditNote.updateMany({
          where: { id, companyId, status: { not: 'APPLIED' } },
          data: { status: 'VOID' },
        }),
        'Credit note was applied by someone else and can no longer be voided.',
      ),
    );
    return this.prisma.creditNote.findUniqueOrThrow({ where: { id }, include: { items: true } });
  }

  // ════════════════════════════ DEBIT NOTES ════════════════════════════

  listDebitNotes(companyId: string, q: any = {}) {
    const where: any = { companyId };
    if (q.status) where.status = q.status;
    if (q.search) {
      const s = String(q.search);
      where.OR = [
        { number: { contains: s, mode: 'insensitive' } },
        { clientName: { contains: s, mode: 'insensitive' } },
      ];
    }
    return this.prisma.debitNote.findMany({
      where, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  async getDebitNote(id: string, companyId: string) {
    const dn = await this.prisma.debitNote.findFirst({ where: { id, companyId }, include: { items: true } });
    if (!dn) throw new NotFoundException('Debit note not found');
    return dn;
  }

  async createDebitNote(companyId: string, dto: CreateNoteDto) {
    const { subtotal, tax, total, items } = this.computeTotals(dto);
    const number = await this.nextNumber(companyId, 'DN', 'debitNote');
    return this.prisma.debitNote.create({
      data: {
        number, companyId,
        clientName: dto.clientName, clientEmail: dto.clientEmail,
        invoiceId: dto.invoiceId ?? null, reason: dto.reason,
        subtotal, tax, total,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  async updateDebitNote(id: string, companyId: string, dto: UpdateNoteDto) {
    const dn = await this.getDebitNote(id, companyId);
    if (dn.status !== 'DRAFT') throw new BadRequestException('Only DRAFT debit notes can be edited');
    const patch: any = {
      clientName: dto.clientName, clientEmail: dto.clientEmail,
      invoiceId: dto.invoiceId, reason: dto.reason,
    };
    if (dto.items) {
      const { subtotal, tax, total } = this.computeTotals({ items: dto.items, taxRate: dto.taxRate });
      Object.assign(patch, { subtotal, tax, total });
      await this.prisma.debitNoteItem.deleteMany({ where: { debitNoteId: id } });
      patch.items = { create: this.lineItems(dto.items) };
    }
    return this.prisma.withTenant(companyId, async (tx) => {
      await claimTransition(
        () => tx.debitNote.updateMany({ where: { id, companyId, status: 'DRAFT' }, data: { status: 'DRAFT' } }),
        'Debit note is no longer a draft — it may have just been issued.',
      );
      await tx.debitNote.update({ where: { id }, data: patch, include: { items: true } });
      return tx.debitNote.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
  }

  async issueDebitNote(id: string, companyId: string) {
    const dn = await this.getDebitNote(id, companyId);
    if (dn.status !== 'DRAFT') throw new BadRequestException(`Cannot issue a ${dn.status} debit note`);
    await this.prisma.withTenant(companyId, (tx) =>
      claimTransition(
        () => tx.debitNote.updateMany({
          where: { id, companyId, status: 'DRAFT' },
          data: { status: 'ISSUED', issuedAt: new Date() },
        }),
        'Debit note was issued by someone else.',
      ),
    );
    return this.prisma.debitNote.findUniqueOrThrow({ where: { id }, include: { items: true } });
  }

  async settleDebitNote(id: string, companyId: string) {
    const dn = await this.getDebitNote(id, companyId);
    if (dn.status !== 'ISSUED') throw new BadRequestException('Only ISSUED debit notes can be settled');
    // Settling twice would post the settlement twice against the same note.
    await this.prisma.withTenant(companyId, (tx) =>
      claimTransition(
        () => tx.debitNote.updateMany({
          where: { id, companyId, status: 'ISSUED' },
          data: { status: 'SETTLED', settledAt: new Date() },
        }),
        'Debit note was settled by someone else.',
      ),
    );
    return this.prisma.debitNote.findUniqueOrThrow({ where: { id }, include: { items: true } });
  }

  async voidDebitNote(id: string, companyId: string) {
    await this.getDebitNote(id, companyId); // existence/tenancy check (throws 404)
    return this.prisma.debitNote.update({ where: { id }, data: { status: 'VOID' }, include: { items: true } });
  }

  // ════════════════════════════ STATEMENTS ════════════════════════════

  /**
   * Customer statement: opening balance + a dated ledger of debits (invoices,
   * debit notes) and credits (payments, credit notes) with a running balance.
   */
  async getStatement(companyId: string, clientName: string, fromStr?: string, toStr?: string) {
    if (!clientName) throw new BadRequestException('client is required');
    const from = fromStr ? new Date(fromStr) : new Date(new Date().getFullYear(), 0, 1);
    const to = toStr ? new Date(toStr) : new Date();
    to.setHours(23, 59, 59, 999);

    const [invoices, payments, creditNotes, debitNotes] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { companyId, clientName, status: { not: 'DRAFT' } },
        select: { invoiceNumber: true, total: true, createdAt: true, sentAt: true },
      }),
      this.prisma.payment.findMany({
        where: { companyId, status: 'SUCCESS', invoice: { clientName } },
        select: { reference: true, amount: true, paidAt: true, createdAt: true },
      }),
      this.prisma.creditNote.findMany({
        where: { companyId, clientName, status: { in: ['ISSUED', 'APPLIED'] } },
        select: { number: true, total: true, issuedAt: true, createdAt: true },
      }),
      this.prisma.debitNote.findMany({
        where: { companyId, clientName, status: { in: ['ISSUED', 'SETTLED'] } },
        select: { number: true, total: true, issuedAt: true, createdAt: true },
      }),
    ]);

    type Line = { date: Date; ref: string; description: string; debit: number; credit: number };
    const all: Line[] = [];
    for (const i of invoices) all.push({ date: i.sentAt ?? i.createdAt, ref: i.invoiceNumber, description: 'Invoice', debit: i.total, credit: 0 });
    for (const d of debitNotes) all.push({ date: d.issuedAt ?? d.createdAt, ref: d.number, description: 'Debit note', debit: d.total, credit: 0 });
    for (const p of payments) all.push({ date: p.paidAt ?? p.createdAt, ref: p.reference, description: 'Payment received', debit: 0, credit: p.amount });
    for (const c of creditNotes) all.push({ date: c.issuedAt ?? c.createdAt, ref: c.number, description: 'Credit note', debit: 0, credit: c.total });

    all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let opening = 0;
    const inRange: (Line & { balance: number })[] = [];
    let balance = 0;
    for (const l of all) {
      const t = new Date(l.date).getTime();
      const delta = l.debit - l.credit;
      if (t < from.getTime()) { opening += delta; balance += delta; continue; }
      if (t > to.getTime()) continue;
      balance += delta;
      inRange.push({ ...l, balance: round2(balance) });
    }

    const totalDebit = round2(inRange.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(inRange.reduce((s, l) => s + l.credit, 0));

    return {
      client: clientName,
      from: from.toISOString(),
      to: to.toISOString(),
      openingBalance: round2(opening),
      closingBalance: round2(balance),
      totalDebit,
      totalCredit,
      lines: inRange.map((l) => ({ ...l, date: new Date(l.date).toISOString() })),
    };
  }

  // ═══════════════════════ AGE ANALYSIS (per client) ═══════════════════════

  async getAgeAnalysis(companyId: string) {
    const now = Date.now();
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { in: ['SENT', 'OVERDUE'] } },
      select: { clientName: true, total: true, dueDate: true },
    });

    const blank = () => ({ current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 });
    const byClient: Record<string, ReturnType<typeof blank>> = {};
    const totals = blank();

    for (const inv of invoices) {
      const days = inv.dueDate ? Math.floor((now - new Date(inv.dueDate).getTime()) / 86400000) : -1;
      const bucket: keyof ReturnType<typeof blank> =
        days < 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'd90plus';
      const c = (byClient[inv.clientName] ??= blank());
      c[bucket] += inv.total; c.total += inv.total;
      totals[bucket] += inv.total; totals.total += inv.total;
    }

    const clients = Object.entries(byClient)
      .map(([clientName, b]) => ({
        clientName,
        current: round2(b.current), d30: round2(b.d30), d60: round2(b.d60),
        d90: round2(b.d90), d90plus: round2(b.d90plus), total: round2(b.total),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      clients,
      totals: {
        current: round2(totals.current), d30: round2(totals.d30), d60: round2(totals.d60),
        d90: round2(totals.d90), d90plus: round2(totals.d90plus), total: round2(totals.total),
      },
    };
  }

  // ════════════════════════ SALESPEOPLE + COMMISSION ════════════════════════

  listSalespeople(companyId: string) {
    return this.prisma.salesperson.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  createSalesperson(companyId: string, dto: CreateSalespersonDto) {
    return this.prisma.salesperson.create({
      data: {
        companyId, name: dto.name, email: dto.email,
        defaultCommissionPct: dto.defaultCommissionPct ?? 0,
      },
    });
  }

  async updateSalesperson(id: string, companyId: string, dto: UpdateSalespersonDto) {
    const sp = await this.prisma.salesperson.findFirst({ where: { id, companyId } });
    if (!sp) throw new NotFoundException('Salesperson not found');
    return this.prisma.salesperson.update({ where: { id }, data: dto });
  }

  listCommissions(companyId: string, q: any = {}) {
    const where: any = { companyId };
    if (q.salespersonId) where.salespersonId = q.salespersonId;
    if (q.periodMonth) where.periodMonth = q.periodMonth;
    if (q.status) where.status = q.status;
    return this.prisma.commission.findMany({
      where,
      include: { salesperson: { select: { id: true, name: true } }, invoice: { select: { invoiceNumber: true, clientName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /** Generate commission records from invoices PAID in the given month. */
  async generateCommissions(companyId: string, dto: GenerateCommissionDto) {
    const sp = await this.prisma.salesperson.findFirst({ where: { id: dto.salespersonId, companyId } });
    if (!sp) throw new NotFoundException('Salesperson not found');

    const ratePct = dto.ratePct ?? sp.defaultCommissionPct;
    if (!ratePct || ratePct <= 0) {
      throw new BadRequestException('No commission rate set for this salesperson — pass ratePct or set a default');
    }

    const [yy, mm] = dto.periodMonth.split('-').map(Number);
    const start = new Date(yy, mm - 1, 1);
    const end = new Date(yy, mm, 0, 23, 59, 59, 999);

    const where: any = { companyId, status: 'PAID', paidAt: { gte: start, lte: end } };
    if (dto.invoiceIds?.length) where.id = { in: dto.invoiceIds };

    const invoices = await this.prisma.invoice.findMany({
      where, select: { id: true, subtotal: true, total: true },
    });

    // Skip invoices that already have a commission for this salesperson + period.
    const existing = await this.prisma.commission.findMany({
      where: { companyId, salespersonId: sp.id, periodMonth: dto.periodMonth, invoiceId: { in: invoices.map((i) => i.id) } },
      select: { invoiceId: true },
    });
    const done = new Set(existing.map((e) => e.invoiceId));

    const basis = dto.basis === 'total' ? 'total' : 'subtotal';
    const toCreate = invoices
      .filter((i) => !done.has(i.id))
      .map((i) => {
        const base = basis === 'total' ? i.total : (i.subtotal || i.total);
        return {
          companyId, salespersonId: sp.id, invoiceId: i.id,
          periodMonth: dto.periodMonth, baseAmount: Money.round(base),
          ratePct, amount: Money.percent(base, ratePct),
        };
      });

    if (toCreate.length) await this.prisma.commission.createMany({ data: toCreate });

    const totalAmount = Money.sum(toCreate.map((c) => c.amount));
    return {
      salesperson: sp.name,
      periodMonth: dto.periodMonth,
      ratePct,
      created: toCreate.length,
      skipped: invoices.length - toCreate.length,
      totalCommission: totalAmount,
    };
  }

  async setCommissionStatus(id: string, companyId: string, status: 'APPROVED' | 'PAID' | 'VOID') {
    const c = await this.prisma.commission.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException('Commission not found');
    const data: any = { status };
    if (status === 'APPROVED') data.approvedAt = new Date();
    if (status === 'PAID') { data.paidAt = new Date(); if (!c.approvedAt) data.approvedAt = new Date(); }
    return this.prisma.commission.update({ where: { id }, data });
  }

  async commissionSummary(companyId: string, periodMonth?: string) {
    const where: any = { companyId };
    if (periodMonth) where.periodMonth = periodMonth;
    const rows = await this.prisma.commission.groupBy({
      by: ['salespersonId', 'status'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
    const people = await this.prisma.salesperson.findMany({ where: { companyId }, select: { id: true, name: true } });
    const nameOf = new Map(people.map((p) => [p.id, p.name]));

    const out: Record<string, any> = {};
    for (const r of rows) {
      const key = r.salespersonId;
      out[key] ??= { salespersonId: key, name: nameOf.get(key) ?? 'Unknown', pending: 0, approved: 0, paid: 0, void: 0, total: 0, count: 0 };
      const amt = round2(r._sum.amount ?? 0);
      out[key][r.status.toLowerCase()] = amt;
      if (r.status !== 'VOID') out[key].total = round2(out[key].total + amt);
      out[key].count += r._count._all;
    }
    return Object.values(out).sort((a: any, b: any) => b.total - a.total);
  }

  // ═══════════════════════════ CSV / PASTEL EXPORT ═══════════════════════════

  async exportCsv(companyId: string, type: string, q: any = {}): Promise<{ filename: string; csv: string }> {
    const stamp = new Date().toISOString().slice(0, 10);
    switch (type) {
      case 'invoices': {
        const rows = await this.prisma.invoice.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
        const csv = this.toCsv(
          ['Date', 'Invoice', 'Client', 'Status', 'Subtotal', 'VAT', 'Total', 'Due', 'Paid'],
          rows.map((r) => [d(r.createdAt), r.invoiceNumber, r.clientName, r.status, r.subtotal, r.tax, r.total, d(r.dueDate), d(r.paidAt)]),
        );
        return { filename: `invoices-${stamp}.csv`, csv };
      }
      case 'credit-notes': {
        const rows = await this.prisma.creditNote.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
        const csv = this.toCsv(
          ['Date', 'Credit Note', 'Client', 'Status', 'Subtotal', 'VAT', 'Total', 'Applied', 'Invoice'],
          rows.map((r) => [d(r.createdAt), r.number, r.clientName, r.status, r.subtotal, r.tax, r.total, r.appliedAmount, r.invoiceId ?? '']),
        );
        return { filename: `credit-notes-${stamp}.csv`, csv };
      }
      case 'payments': {
        const rows = await this.prisma.payment.findMany({ where: { companyId, status: 'SUCCESS' }, orderBy: { createdAt: 'desc' } });
        const csv = this.toCsv(
          ['Date', 'Reference', 'Customer', 'Channel', 'Amount', 'Currency'],
          rows.map((r) => [d(r.paidAt ?? r.createdAt), r.reference, r.customerName ?? '', r.paystackChannel ?? '', r.amount, r.currency]),
        );
        return { filename: `payments-${stamp}.csv`, csv };
      }
      case 'pastel': {
        return { filename: `pastel-journal-${stamp}.csv`, csv: await this.buildPastelJournal(companyId, q) };
      }
      default:
        throw new BadRequestException(`Unknown export type: ${type}`);
    }
  }

  /**
   * Pastel-style general journal: one debit/credit row per financial document.
   * Columns chosen to import cleanly into Pastel Express/Partner via CSV:
   * Date, Reference, Description, AccountType, Account, Debit, Credit, TaxType, ClientName.
   */
  private async buildPastelJournal(companyId: string, q: any): Promise<string> {
    const from = q.from ? new Date(q.from) : new Date(new Date().getFullYear(), 0, 1);
    const to = q.to ? new Date(q.to) : new Date();
    to.setHours(23, 59, 59, 999);
    const within = { gte: from, lte: to };

    const [invoices, payments, creditNotes, debitNotes] = await Promise.all([
      this.prisma.invoice.findMany({ where: { companyId, status: { not: 'DRAFT' }, createdAt: within } }),
      this.prisma.payment.findMany({ where: { companyId, status: 'SUCCESS', createdAt: within } }),
      this.prisma.creditNote.findMany({ where: { companyId, status: { in: ['ISSUED', 'APPLIED'] }, createdAt: within } }),
      this.prisma.debitNote.findMany({ where: { companyId, status: { in: ['ISSUED', 'SETTLED'] }, createdAt: within } }),
    ]);

    const rows: (string | number)[][] = [];
    // Sales invoices: debit Accounts Receivable, credit Sales (+ VAT line).
    for (const i of invoices) {
      rows.push([d(i.createdAt), i.invoiceNumber, 'Sales invoice', 'Customer', '1100/AR', i.total, 0, 'VAT15', i.clientName]);
      rows.push([d(i.createdAt), i.invoiceNumber, 'Sales (ex VAT)', 'GL', '4000/Sales', 0, i.subtotal, 'VAT15', i.clientName]);
      if (i.tax) rows.push([d(i.createdAt), i.invoiceNumber, 'Output VAT', 'GL', '2200/VAT', 0, i.tax, 'VAT15', i.clientName]);
    }
    // Payments: debit Bank, credit AR.
    for (const p of payments) {
      rows.push([d(p.paidAt ?? p.createdAt), p.reference, 'Payment received', 'GL', '1000/Bank', p.amount, 0, 'NONE', p.customerName ?? '']);
      rows.push([d(p.paidAt ?? p.createdAt), p.reference, 'Allocate to AR', 'Customer', '1100/AR', 0, p.amount, 'NONE', p.customerName ?? '']);
    }
    // Credit notes: reverse of a sale.
    for (const c of creditNotes) {
      rows.push([d(c.issuedAt ?? c.createdAt), c.number, 'Credit note', 'GL', '4000/Sales', c.subtotal, 0, 'VAT15', c.clientName]);
      if (c.tax) rows.push([d(c.issuedAt ?? c.createdAt), c.number, 'Output VAT reversal', 'GL', '2200/VAT', c.tax, 0, 'VAT15', c.clientName]);
      rows.push([d(c.issuedAt ?? c.createdAt), c.number, 'Credit to customer', 'Customer', '1100/AR', 0, c.total, 'VAT15', c.clientName]);
    }
    // Debit notes: additional charge to a customer.
    for (const dn of debitNotes) {
      rows.push([d(dn.issuedAt ?? dn.createdAt), dn.number, 'Debit note', 'Customer', '1100/AR', dn.total, 0, 'VAT15', dn.clientName]);
      rows.push([d(dn.issuedAt ?? dn.createdAt), dn.number, 'Additional revenue', 'GL', '4000/Sales', 0, dn.subtotal, 'VAT15', dn.clientName]);
      if (dn.tax) rows.push([d(dn.issuedAt ?? dn.createdAt), dn.number, 'Output VAT', 'GL', '2200/VAT', 0, dn.tax, 'VAT15', dn.clientName]);
    }

    return this.toCsv(
      ['Date', 'Reference', 'Description', 'AccountType', 'Account', 'Debit', 'Credit', 'TaxType', 'ClientName'],
      rows,
    );
  }

  // ═══════════════════════════ AI FINANCE ASSISTANT ═══════════════════════════

  /**
   * FlowOps AI finance assistant. Reads the company's live receivables, credit
   * notes and commissions and returns a prioritised, actionable briefing:
   * collection targets, credit-risk flags, anomalies and a plain-language
   * summary. Heuristic + deterministic so it works offline; designed to be
   * surfaced in the Accounting page's "AI Assist" panel.
   */
  async aiAssist(companyId: string) {
    const now = Date.now();
    const [aging, openInvoices, clients, creditNotes, commissions, paidLast30] = await Promise.all([
      this.getAgeAnalysis(companyId),
      this.prisma.invoice.findMany({
        where: { companyId, status: { in: ['SENT', 'OVERDUE'] } },
        select: { invoiceNumber: true, clientName: true, clientEmail: true, total: true, dueDate: true },
      }),
      this.prisma.client.findMany({
        where: { companyId },
        select: { name: true, creditLimit: true, paymentTerms: true, billingType: true, email: true },
      }),
      this.prisma.creditNote.findMany({
        where: { companyId, status: 'ISSUED' },
        select: { number: true, clientName: true, total: true, appliedAmount: true },
      }),
      this.prisma.commission.aggregate({
        where: { companyId, status: { in: ['PENDING', 'APPROVED'] } },
        _sum: { amount: true }, _count: { _all: true },
      }),
      this.prisma.invoice.aggregate({
        where: { companyId, status: 'PAID', paidAt: { gte: new Date(now - 30 * 86400000) } },
        _sum: { total: true },
      }),
    ]);

    const creditLimitOf = new Map(clients.map((c) => [c.name, c.creditLimit ?? null]));
    const totalOutstanding = aging.totals.total;
    const seriouslyOverdue = round2(aging.totals.d60 + aging.totals.d90 + aging.totals.d90plus);

    // Collection targets — biggest exposure first, with a tailored next action.
    const collectionTargets = aging.clients.slice(0, 5).map((c) => {
      const overdue = round2(c.d30 + c.d60 + c.d90 + c.d90plus);
      let action: string;
      if (c.d90plus > 0) action = 'Escalate: place on credit hold + phone the accounts contact today.';
      else if (c.d60 > 0) action = 'Call the client and email a statement; flag for credit review.';
      else if (c.d30 > 0) action = 'Send a payment reminder with the outstanding statement.';
      else action = 'On track — monitor; no action needed yet.';
      return { client: c.clientName, outstanding: c.total, overdue, oldest90Plus: c.d90plus, action };
    });

    // Credit-risk flags — clients whose outstanding exceeds their credit limit.
    const outstandingByClient = new Map<string, number>();
    for (const inv of openInvoices) {
      outstandingByClient.set(inv.clientName, round2((outstandingByClient.get(inv.clientName) ?? 0) + inv.total));
    }
    const creditRisks: { client: string; outstanding: number; creditLimit: number; over: number }[] = [];
    for (const [client, outstanding] of outstandingByClient) {
      const limit = creditLimitOf.get(client);
      if (limit != null && limit > 0 && outstanding > limit) {
        creditRisks.push({ client, outstanding, creditLimit: limit, over: round2(outstanding - limit) });
      }
    }
    creditRisks.sort((a, b) => b.over - a.over);

    const unappliedCredits = creditNotes
      .map((c) => ({ ...c, remaining: Money.subtract(c.total, c.appliedAmount) }))
      .filter((c) => c.remaining > 0);
    const unappliedTotal = Money.sum(unappliedCredits.map((c) => c.remaining));

    // Build prioritised recommendations.
    const recommendations: { priority: 'HIGH' | 'MEDIUM' | 'LOW'; title: string; detail: string }[] = [];
    if (aging.totals.d90plus > 0) {
      recommendations.push({
        priority: 'HIGH',
        title: `${money(aging.totals.d90plus)} is 90+ days overdue`,
        detail: 'Debt this old rarely self-cures. Place the worst offenders on credit hold and begin a formal collection process.',
      });
    }
    if (creditRisks.length) {
      recommendations.push({
        priority: 'HIGH',
        title: `${creditRisks.length} client(s) over their credit limit`,
        detail: `Top exposure: ${creditRisks[0].client} is ${money(creditRisks[0].over)} over limit. Pause new credit orders until paid down.`,
      });
    }
    if (unappliedTotal > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        title: `${money(unappliedTotal)} in issued credit notes not yet applied`,
        detail: `${unappliedCredits.length} credit note(s) can be offset against open invoices to clean up the ledger.`,
      });
    }
    if ((commissions._sum.amount ?? 0) > 0) {
      recommendations.push({
        priority: 'LOW',
        title: `${money(commissions._sum.amount ?? 0)} commission awaiting payout`,
        detail: `${commissions._count._all} commission record(s) are pending approval/payment in the Commission tab.`,
      });
    }
    if (!recommendations.length) {
      recommendations.push({
        priority: 'LOW',
        title: 'Receivables look healthy',
        detail: 'No 90+ day debt, no clients over limit, no stranded credits. Keep sending reminders before due dates.',
      });
    }

    // Risk score 0–100 (share of book that is seriously overdue, weighted).
    const riskScore = totalOutstanding > 0
      ? Math.min(100, Math.round((seriouslyOverdue / totalOutstanding) * 100 + creditRisks.length * 5))
      : 0;

    const collectedLast30 = paidLast30._sum.total ?? 0;
    const summary =
      totalOutstanding > 0
        ? `You have ${money(totalOutstanding)} outstanding across ${aging.clients.length} client(s), of which ${money(seriouslyOverdue)} is 60+ days overdue. ` +
          `${money(collectedLast30)} was collected in the last 30 days. ` +
          (creditRisks.length ? `${creditRisks.length} client(s) are over their credit limit — act first. ` : '') +
          (collectionTargets[0] ? `Start with ${collectionTargets[0].client}.` : '')
        : `No outstanding receivables right now. ${money(collectedLast30)} collected in the last 30 days. Nice and clean.`;

    return {
      generatedAt: new Date().toISOString(),
      assistant: 'FlowOps AI',
      summary,
      riskScore,
      kpis: {
        totalOutstanding,
        seriouslyOverdue,
        collectedLast30: round2(collectedLast30),
        unappliedCredits: unappliedTotal,
        pendingCommission: round2(commissions._sum.amount ?? 0),
      },
      recommendations,
      collectionTargets,
      creditRisks: creditRisks.slice(0, 8),
    };
  }

  // ════════════════════════════════ HELPERS ════════════════════════════════

  private lineItems(items: { description: string; quantity?: number; unitPrice: number }[]) {
    return items.map((it) => {
      const qty = it.quantity ?? 1;
      return { description: it.description, quantity: qty, unitPrice: it.unitPrice, total: Money.multiply(it.unitPrice, qty) };
    });
  }

  private computeTotals(dto: { items: { description: string; quantity?: number; unitPrice: number }[]; taxRate?: number }) {
    const items = this.lineItems(dto.items ?? []);
    const subtotal = Money.sum(items.map((it) => it.total));
    const rate = dto.taxRate != null ? dto.taxRate : 15;
    const tax = Money.percent(subtotal, rate);
    const total = Money.add(subtotal, tax);
    return { subtotal, tax, total, items };
  }

  private async nextNumber(companyId: string, prefix: string, model: 'creditNote' | 'debitNote'): Promise<string> {
    const year = new Date().getFullYear();
    const count = await (this.prisma as any)[model].count({ where: { companyId } });
    return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private toCsv(headers: string[], rows: (string | number)[][]): string {
    const esc = (v: string | number) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
  }
}

/** Date → YYYY-MM-DD for CSV/statements. */
function d(value?: Date | string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

/** ZAR money formatting for AI assistant narrative. */
function money(n?: number | null): string {
  return `R${Number(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
