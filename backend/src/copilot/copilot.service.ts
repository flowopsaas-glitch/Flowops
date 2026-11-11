import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../common/money.util';

/**
 * "Ask FlowOps" — a natural-language analytics copilot.
 *
 * Turns a plain-English question about the tenant's live operation into a safe,
 * company-scoped Prisma aggregation and a spoken-language answer (+ optional
 * chart). Fully deterministic: it parses the question into an intent, runs a
 * read-only query, and phrases the result — so it works offline with zero
 * external AI keys. (It can later be wrapped by an LLM for fuzzier phrasing.)
 */

export interface CopilotAnswer {
  question: string;
  answer: string;
  value?: number | string | null;
  unit?: 'count' | 'currency' | 'percent' | null;
  chart?: { type: 'bar' | 'line' | 'donut'; labels: string[]; values: number[] } | null;
  table?: Array<Record<string, any>> | null;
  intent: string;
  matched: boolean;
  tookMs: number;
}

const money = (n: number) =>
  `R${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Money.round(n);
const cap = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

type Timeframe = { gte?: Date; lte?: Date; label: string };

@Injectable()
export class CopilotService {
  constructor(private prisma: PrismaService) {}

  suggestions(): string[] {
    return [
      'How many deliveries failed this week?',
      'How many parcels are in transit?',
      'What is my revenue this month?',
      'Total COD outstanding',
      'Top 5 drivers by deliveries',
      'Top clients by revenue',
      'Delivery success rate this month',
      'How many active drivers?',
      'Waybills created today',
      'How much did we collect last week?',
    ];
  }

  async ask(companyId: string, rawQuestion: string): Promise<CopilotAnswer> {
    const started = Date.now();
    const q = (rawQuestion || '').toLowerCase().trim();
    const base = { question: rawQuestion, matched: true, tookMs: 0 };

    const finish = (a: Omit<CopilotAnswer, 'tookMs' | 'question' | 'matched'> & Partial<CopilotAnswer>): CopilotAnswer =>
      ({ ...base, ...a, tookMs: Date.now() - started } as CopilotAnswer);

    if (!q) {
      return finish({ answer: 'Ask me anything about your operation — deliveries, drivers, revenue, COD…', intent: 'empty', matched: false, value: null });
    }

    const tf = this.parseTimeframe(q);
    const location = this.parseLocation(q);

    try {
      // ── Rankings / top-N ──────────────────────────────────────────────
      if (/\b(top|best|most|ranking|leaderboard|busiest)\b/.test(q) || /\bby (driver|client|customer)\b/.test(q)) {
        if (/\b(client|customer)\b/.test(q)) return finish(await this.topClientsByRevenue(companyId, tf));
        return finish(await this.topDriversByDeliveries(companyId, tf));
      }

      // ── Revenue / money ───────────────────────────────────────────────
      if (/\b(revenue|sales|turnover|income|invoiced?|billed)\b/.test(q)) {
        return finish(await this.revenue(companyId, tf, q));
      }
      if (/\b(collected|received|payments?)\b/.test(q) && !/cod|cash on delivery/.test(q)) {
        return finish(await this.collected(companyId, tf));
      }
      if (/\bcod\b|cash on delivery/.test(q)) {
        return finish(await this.cod(companyId, tf, q));
      }
      if (/\boutstanding|owe|owing|unpaid|overdue\b/.test(q)) {
        return finish(await this.outstanding(companyId));
      }

      // ── Success rate ───────────────────────────────────────────────────
      if (/\b(success rate|delivery rate|on.?time|failure rate|fail rate)\b/.test(q)) {
        return finish(await this.successRate(companyId, tf));
      }

      // ── Drivers ────────────────────────────────────────────────────────
      if (/\b(active )?drivers?\b/.test(q) && /\b(how many|number of|count|active|available|online)\b/.test(q)) {
        return finish(await this.driverStatus(companyId, q));
      }

      // ── Trends ─────────────────────────────────────────────────────────
      if (/\b(trend|per day|each day|daily|over time|by day)\b/.test(q)) {
        return finish(await this.trend(companyId, tf, q));
      }

      // ── Generic counts (waybills / collections / shipments) ────────────
      return finish(await this.count(companyId, tf, location, q));
    } catch (e: any) {
      return finish({ answer: `I hit a snag answering that: ${e?.message ?? 'unknown error'}`, intent: 'error', matched: false, value: null });
    }
  }

  // ════════════════════════════ HANDLERS ════════════════════════════

  private async count(companyId: string, tf: Timeframe, location: string | null, q: string) {
    const entity = this.entity(q);
    const where: any = { companyId };
    if (tf.gte || tf.lte) where.createdAt = { ...(tf.gte && { gte: tf.gte }), ...(tf.lte && { lte: tf.lte }) };

    let label: string;
    let n: number;

    if (entity === 'collection') {
      const status = this.collectionStatus(q);
      if (status) where.status = status;
      n = await this.prisma.collection.count({ where });
      label = `${status ? cap(status) + ' ' : ''}collection${n === 1 ? '' : 's'}`;
    } else if (entity === 'shipment') {
      const status = this.shipmentStatus(q);
      if (status) where.status = status;
      n = await this.prisma.shipment.count({ where });
      label = `${status ? cap(status) + ' ' : ''}shipment${n === 1 ? '' : 's'}`;
    } else if (entity === 'driver') {
      n = await this.prisma.driver.count({ where: { companyId, isActive: true } });
      label = `active driver${n === 1 ? '' : 's'}`;
    } else {
      // waybills (default)
      const status = this.waybillStatus(q);
      if (status) where.status = status;
      if (location) where.recipientAddress = { contains: location, mode: 'insensitive' };
      n = await this.prisma.waybill.count({ where });
      label = `${status ? cap(status) + ' ' : ''}waybill${n === 1 ? '' : 's'}${location ? ` to ${cap(location)}` : ''}`;
    }

    const when = tf.label ? ` ${tf.label}` : '';
    return {
      answer: `You have ${n.toLocaleString()} ${label}${when}.`,
      value: n, unit: 'count' as const, intent: `count:${entity}`,
    };
  }

  private async revenue(companyId: string, tf: Timeframe, q: string) {
    // Revenue = value of PAID invoices (fallback to SENT+PAID if "invoiced/billed").
    const statuses = /\binvoiced?|billed\b/.test(q) ? ['SENT', 'PAID', 'OVERDUE'] : ['PAID'];
    const where: any = { companyId, status: { in: statuses } };
    if (tf.gte || tf.lte) where.createdAt = { ...(tf.gte && { gte: tf.gte }), ...(tf.lte && { lte: tf.lte }) };
    const agg = await this.prisma.invoice.aggregate({ where, _sum: { total: true }, _count: { _all: true } });
    const total = round2(agg._sum.total ?? 0);
    const verb = statuses.length === 1 ? 'paid revenue' : 'invoiced';
    return {
      answer: `Your ${verb}${tf.label ? ' ' + tf.label : ''} is ${money(total)} across ${agg._count._all} invoice${agg._count._all === 1 ? '' : 's'}.`,
      value: total, unit: 'currency' as const, intent: 'revenue',
    };
  }

  private async collected(companyId: string, tf: Timeframe) {
    const where: any = { companyId, status: 'SUCCESS' };
    if (tf.gte || tf.lte) where.paidAt = { ...(tf.gte && { gte: tf.gte }), ...(tf.lte && { lte: tf.lte }) };
    const agg = await this.prisma.payment.aggregate({ where, _sum: { amount: true }, _count: { _all: true } });
    const total = round2(agg._sum.amount ?? 0);
    return {
      answer: `You collected ${money(total)}${tf.label ? ' ' + tf.label : ''} across ${agg._count._all} payment${agg._count._all === 1 ? '' : 's'}.`,
      value: total, unit: 'currency' as const, intent: 'collected',
    };
  }

  private async cod(companyId: string, tf: Timeframe, q: string) {
    const collected = /\bcollected|received\b/.test(q);
    const where: any = { companyId, codAmount: { gt: 0 }, status: { not: 'CANCELLED' } };
    if (collected) where.codCollected = true;
    else where.codCollected = false;
    if (tf.gte || tf.lte) where.createdAt = { ...(tf.gte && { gte: tf.gte }), ...(tf.lte && { lte: tf.lte }) };
    const agg = await this.prisma.waybill.aggregate({ where, _sum: { codAmount: true }, _count: { _all: true } });
    const total = round2(agg._sum.codAmount ?? 0);
    const word = collected ? 'COD collected' : 'COD outstanding';
    return {
      answer: `${word}${tf.label ? ' ' + tf.label : ''}: ${money(total)} across ${agg._count._all} parcel${agg._count._all === 1 ? '' : 's'}.`,
      value: total, unit: 'currency' as const, intent: 'cod',
    };
  }

  private async outstanding(companyId: string) {
    const agg = await this.prisma.invoice.aggregate({
      where: { companyId, status: { in: ['SENT', 'OVERDUE'] } },
      _sum: { total: true }, _count: { _all: true },
    });
    const total = round2(agg._sum.total ?? 0);
    return {
      answer: `Outstanding receivables: ${money(total)} across ${agg._count._all} unpaid invoice${agg._count._all === 1 ? '' : 's'}.`,
      value: total, unit: 'currency' as const, intent: 'outstanding',
    };
  }

  private async successRate(companyId: string, tf: Timeframe) {
    const where: any = { companyId };
    if (tf.gte || tf.lte) where.createdAt = { ...(tf.gte && { gte: tf.gte }), ...(tf.lte && { lte: tf.lte }) };
    const [delivered, failed] = await Promise.all([
      this.prisma.waybill.count({ where: { ...where, status: 'DELIVERED' } }),
      this.prisma.waybill.count({ where: { ...where, status: 'FAILED_DELIVERY' } }),
    ]);
    const total = delivered + failed;
    const rate = total ? round2((delivered / total) * 100) : 0;
    return {
      answer: total
        ? `Delivery success rate${tf.label ? ' ' + tf.label : ''} is ${rate}% (${delivered.toLocaleString()} delivered, ${failed.toLocaleString()} failed).`
        : `No completed deliveries${tf.label ? ' ' + tf.label : ''} yet to measure a success rate.`,
      value: rate, unit: 'percent' as const, intent: 'success_rate',
      chart: total ? { type: 'donut' as const, labels: ['Delivered', 'Failed'], values: [delivered, failed] } : null,
    };
  }

  private async driverStatus(companyId: string, q: string) {
    if (/\b(available|online|on.?route|offline)\b/.test(q)) {
      const grouped = await this.prisma.driver.groupBy({ by: ['status'], where: { companyId, isActive: true }, _count: { _all: true } });
      const map: Record<string, number> = {};
      for (const g of grouped) map[g.status] = g._count._all;
      const avail = map['AVAILABLE'] ?? 0;
      return {
        answer: `${avail} driver${avail === 1 ? '' : 's'} available right now (${map['ON_ROUTE'] ?? 0} on route, ${map['OFFLINE'] ?? 0} offline).`,
        value: avail, unit: 'count' as const, intent: 'driver_status',
        chart: { type: 'donut' as const, labels: ['Available', 'On route', 'Offline'], values: [avail, map['ON_ROUTE'] ?? 0, map['OFFLINE'] ?? 0] },
      };
    }
    const n = await this.prisma.driver.count({ where: { companyId, isActive: true } });
    return { answer: `You have ${n} active driver${n === 1 ? '' : 's'}.`, value: n, unit: 'count' as const, intent: 'driver_status' };
  }

  private async topDriversByDeliveries(companyId: string, tf: Timeframe) {
    const where: any = { companyId, status: 'DELIVERED', driverId: { not: null } };
    if (tf.gte || tf.lte) where.deliveredAt = { ...(tf.gte && { gte: tf.gte }), ...(tf.lte && { lte: tf.lte }) };
    const grouped = await this.prisma.shipment.groupBy({
      by: ['driverId'], where, _count: { _all: true },
      orderBy: { _count: { driverId: 'desc' } }, take: 5,
    });
    if (!grouped.length) return { answer: `No completed deliveries${tf.label ? ' ' + tf.label : ''} to rank drivers by yet.`, value: null, intent: 'top_drivers', matched: true };
    const drivers = await this.prisma.driver.findMany({ where: { id: { in: grouped.map((g) => g.driverId!) } }, select: { id: true, name: true } });
    const nameOf = new Map(drivers.map((d) => [d.id, d.name]));
    const rows = grouped.map((g) => ({ driver: nameOf.get(g.driverId!) ?? 'Unknown', deliveries: g._count._all }));
    return {
      answer: `Top driver${tf.label ? ' ' + tf.label : ''}: ${rows[0].driver} with ${rows[0].deliveries} deliveries.`,
      intent: 'top_drivers', value: rows[0].deliveries, unit: 'count' as const,
      table: rows,
      chart: { type: 'bar' as const, labels: rows.map((r) => r.driver), values: rows.map((r) => r.deliveries) },
    };
  }

  private async topClientsByRevenue(companyId: string, tf: Timeframe) {
    const where: any = { companyId, status: 'PAID' };
    if (tf.gte || tf.lte) where.createdAt = { ...(tf.gte && { gte: tf.gte }), ...(tf.lte && { lte: tf.lte }) };
    const grouped = await this.prisma.invoice.groupBy({
      by: ['clientName'], where, _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } }, take: 5,
    });
    if (!grouped.length) return { answer: `No paid invoices${tf.label ? ' ' + tf.label : ''} to rank clients by yet.`, value: null, intent: 'top_clients', matched: true };
    const rows = grouped.map((g) => ({ client: g.clientName, revenue: round2(g._sum.total ?? 0) }));
    return {
      answer: `Top client${tf.label ? ' ' + tf.label : ''}: ${rows[0].client} at ${money(rows[0].revenue)}.`,
      intent: 'top_clients', value: rows[0].revenue, unit: 'currency' as const,
      table: rows.map((r) => ({ client: r.client, revenue: money(r.revenue) })),
      chart: { type: 'bar' as const, labels: rows.map((r) => r.client), values: rows.map((r) => r.revenue) },
    };
  }

  private async trend(companyId: string, tf: Timeframe, q: string) {
    const isRevenue = /\b(revenue|sales|invoice|income)\b/.test(q);
    const gte = tf.gte ?? new Date(Date.now() - 7 * 86400000);
    const lte = tf.lte ?? new Date();
    const buckets: { label: string; value: number }[] = [];
    const days = Math.min(31, Math.max(1, Math.ceil((lte.getTime() - gte.getTime()) / 86400000)));
    for (let i = 0; i < days; i++) {
      const start = new Date(gte); start.setDate(gte.getDate() + i); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setHours(23, 59, 59, 999);
      if (isRevenue) {
        const agg = await this.prisma.invoice.aggregate({ where: { companyId, status: 'PAID', createdAt: { gte: start, lte: end } }, _sum: { total: true } });
        buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, value: round2(agg._sum.total ?? 0) });
      } else {
        const c = await this.prisma.waybill.count({ where: { companyId, createdAt: { gte: start, lte: end } } });
        buckets.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, value: c });
      }
    }
    const sum = round2(buckets.reduce((s, b) => s + b.value, 0));
    return {
      answer: isRevenue
        ? `Revenue${tf.label ? ' ' + tf.label : ' (last 7 days)'}: ${money(sum)} total — see the daily trend.`
        : `Waybills${tf.label ? ' ' + tf.label : ' (last 7 days)'}: ${sum.toLocaleString()} total — see the daily trend.`,
      value: sum, unit: isRevenue ? ('currency' as const) : ('count' as const), intent: 'trend',
      chart: { type: 'line' as const, labels: buckets.map((b) => b.label), values: buckets.map((b) => b.value) },
    };
  }

  // ════════════════════════════ PARSERS ════════════════════════════

  private entity(q: string): 'waybill' | 'collection' | 'shipment' | 'driver' {
    if (/\b(collection|pickup|pick.?up)s?\b/.test(q)) return 'collection';
    if (/\bshipments?\b/.test(q)) return 'shipment';
    if (/\bdrivers?\b/.test(q)) return 'driver';
    // deliveries/parcels/waybills/packages → waybill
    return 'waybill';
  }

  private waybillStatus(q: string): string | null {
    if (/\bout for delivery\b/.test(q)) return 'OUT_FOR_DELIVERY';
    if (/\bfailed|failure|undelivered\b/.test(q)) return 'FAILED_DELIVERY';
    if (/\bdelivered|completed\b/.test(q)) return 'DELIVERED';
    if (/\bin transit|transit|on the way\b/.test(q)) return 'IN_TRANSIT';
    if (/\bcollected\b/.test(q)) return 'COLLECTED';
    if (/\bpending|new|awaiting\b/.test(q)) return 'PENDING';
    if (/\breturned\b/.test(q)) return 'RETURNED';
    if (/\bcancelled|canceled\b/.test(q)) return 'CANCELLED';
    return null;
  }

  private shipmentStatus(q: string): string | null {
    if (/\bdelivered|completed\b/.test(q)) return 'DELIVERED';
    if (/\bfailed|failure\b/.test(q)) return 'FAILED';
    if (/\bin transit|transit\b/.test(q)) return 'IN_TRANSIT';
    if (/\bpending|new\b/.test(q)) return 'PENDING';
    return null;
  }

  private collectionStatus(q: string): string | null {
    if (/\bcollected|completed\b/.test(q)) return 'COLLECTED';
    if (/\bfailed\b/.test(q)) return 'FAILED';
    if (/\bin progress|ongoing\b/.test(q)) return 'IN_PROGRESS';
    if (/\bassigned\b/.test(q)) return 'ASSIGNED';
    if (/\bpending|new\b/.test(q)) return 'PENDING';
    if (/\bcancelled|canceled\b/.test(q)) return 'CANCELLED';
    return null;
  }

  private parseTimeframe(q: string): Timeframe {
    const now = new Date();
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

    if (/\btoday\b/.test(q)) return { gte: startOfDay(now), lte: endOfDay(now), label: 'today' };
    if (/\byesterday\b/.test(q)) { const y = new Date(now); y.setDate(now.getDate() - 1); return { gte: startOfDay(y), lte: endOfDay(y), label: 'yesterday' }; }
    if (/\blast week\b/.test(q)) { const s = new Date(now); s.setDate(now.getDate() - now.getDay() - 7); const e = new Date(s); e.setDate(s.getDate() + 6); return { gte: startOfDay(s), lte: endOfDay(e), label: 'last week' }; }
    if (/\bthis week\b/.test(q)) { const s = new Date(now); s.setDate(now.getDate() - now.getDay()); return { gte: startOfDay(s), lte: endOfDay(now), label: 'this week' }; }
    if (/\blast month\b/.test(q)) { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { gte: startOfDay(s), lte: endOfDay(e), label: 'last month' }; }
    if (/\bthis month\b/.test(q)) { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { gte: startOfDay(s), lte: endOfDay(now), label: 'this month' }; }
    if (/\bthis year\b/.test(q)) { const s = new Date(now.getFullYear(), 0, 1); return { gte: startOfDay(s), lte: endOfDay(now), label: 'this year' }; }
    const lastN = q.match(/\blast (\d{1,3}) days?\b/);
    if (lastN) { const n = parseInt(lastN[1], 10); const s = new Date(now); s.setDate(now.getDate() - n); return { gte: startOfDay(s), lte: endOfDay(now), label: `in the last ${n} days` }; }
    return { label: '' };
  }

  private parseLocation(q: string): string | null {
    // "... in <place>" where place isn't a timeframe keyword.
    const m = q.match(/\bin ([a-z\s]+?)(?:\?|$|\s(?:today|yesterday|this|last|over|per))/);
    if (!m) return null;
    const place = m[1].trim();
    const stop = ['transit', 'progress', 'the last', 'total'];
    if (!place || place.length < 3 || stop.some((s) => place.includes(s))) return null;
    return place;
  }
}
