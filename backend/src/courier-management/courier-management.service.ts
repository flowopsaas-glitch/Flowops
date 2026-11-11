import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { ApplyPlanDto, CreateCourierOrderDto, UpdateCourierOrderDto } from './dto/courier-order.dto';
import { AI_INTERNAL_PREAMBLE } from '../common/ai-security.util';
import { GROQ_MODEL } from '../ai/groq-model';

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

/**
 * Courier Management Suite — client order management + AI delivery orchestration.
 *
 * Implements CLAW Issue #169. Honest engineering note: the spec literally said
 * "Courier model / create a courier", but FlowOps already models couriers as
 * Drivers — duplicating that would be confusing. The real Onfleet wedge is
 * CLIENT ORDER MANAGEMENT + AI DELIVERY ORCHESTRATION, so this builds that:
 * intake orders, then CLAW assigns + sequences them across available drivers
 * (which Route Optimizer — single-driver stop sequencing — doesn't do).
 *
 * AI orchestration is a RECOMMENDATION: the dispatcher reviews and applies it.
 * Enterprise-gated (feature: courierManagement). Groq-powered with a
 * deterministic fallback when no key is set.
 */
@Injectable()
export class CourierManagementService {
  private readonly logger = new Logger('CLAW_COURIER');
  private readonly GROQ = 'https://api.groq.com/openai/v1/chat/completions';
  private readonly MODEL = GROQ_MODEL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
  ) {}

  // ── Orders ──────────────────────────────────────────────────────────────────
  async createOrder(companyId: string, dto: CreateCourierOrderDto) {
    await this.assertEntitled(companyId);
    // Lock, count and insert in ONE transaction. Doing the allocation in its own
    // transaction would release the advisory lock the moment it committed — before
    // the row that consumed the number was written — which fixes nothing.
    return this.prisma.withTenant(companyId, async (tx) => {
      const year = new Date().getFullYear();
      await this.lockReferenceSpace(tx, companyId, year);
      const count = await (tx as any).courierOrder.count({
        where: { companyId, createdAt: { gte: new Date(year, 0, 1) } },
      });
      const reference = `ORD-${year}-${String(count + 1).padStart(5, '0')}`;

      return (tx as any).courierOrder.create({
        data: {
          companyId,
          reference,
          clientName: dto.clientName,
          clientId: dto.clientId || null,
          pickupAddress: dto.pickupAddress,
          dropoffAddress: dto.dropoffAddress,
          contactName: dto.contactName || null,
          contactPhone: dto.contactPhone || null,
          itemsDesc: dto.itemsDesc || null,
          pieces: dto.pieces ?? 1,
          weightKg: dto.weightKg ?? null,
          priority: dto.priority || 'NORMAL',
          windowStart: dto.windowStart ? new Date(dto.windowStart) : null,
          windowEnd: dto.windowEnd ? new Date(dto.windowEnd) : null,
          notes: dto.notes || null,
          status: 'NEW',
        },
      });
    });
  }

  async listOrders(companyId: string, status?: string) {
    await this.assertEntitled(companyId);
    const where: any = { companyId };
    if (status) where.status = status;
    const orders = await (this.prisma as any).courierOrder.findMany({
      where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 300,
    });
    return this.attachDriverNames(companyId, orders);
  }

  async updateOrder(companyId: string, id: string, dto: UpdateCourierOrderDto) {
    await this.assertEntitled(companyId);
    const existing = await (this.prisma as any).courierOrder.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Order not found');
    return (this.prisma as any).courierOrder.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.assignedDriverId !== undefined ? { assignedDriverId: dto.assignedDriverId || null } : {}),
        ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
        ...(dto.priority ? { priority: dto.priority } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
  }

  async stats(companyId: string) {
    await this.assertEntitled(companyId);
    const grouped = await (this.prisma as any).courierOrder.groupBy({
      by: ['status'], where: { companyId }, _count: { _all: true },
    });
    const map: Record<string, number> = {};
    for (const g of grouped) map[g.status] = g._count._all;
    return {
      new: map['NEW'] ?? 0,
      assigned: map['ASSIGNED'] ?? 0,
      dispatched: map['DISPATCHED'] ?? 0,
      completed: map['COMPLETED'] ?? 0,
      cancelled: map['CANCELLED'] ?? 0,
    };
  }

  // ── AI delivery orchestration ────────────────────────────────────────────────
  async orchestrate(companyId: string) {
    await this.assertEntitled(companyId);

    const orders = await (this.prisma as any).courierOrder.findMany({
      where: { companyId, status: 'NEW' },
      orderBy: { createdAt: 'asc' }, take: 60,
    });
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, status: true },
    });

    if (!orders.length) return { assignments: [], unassigned: [], summary: 'No pending orders to orchestrate.', model: 'none' };
    if (!drivers.length) return { assignments: [], unassigned: orders.map((o: any) => o.id), summary: 'No active drivers available.', model: 'none' };

    const groqKey = this.config.get<string>('GROQ_API_KEY');
    if (groqKey) {
      const plan = await this.groqOrchestrate(groqKey, orders, drivers);
      if (plan) return { ...plan, model: this.MODEL };
    }
    return { ...this.fallbackOrchestrate(orders, drivers), model: 'heuristic' };
  }

  async applyPlan(companyId: string, dto: ApplyPlanDto) {
    await this.assertEntitled(companyId);
    let updated = 0;
    for (const a of dto.assignments || []) {
      let seq = 1;
      for (const orderId of a.orderIds || []) {
        const res = await (this.prisma as any).courierOrder.updateMany({
          where: { id: orderId, companyId, status: { in: ['NEW', 'ASSIGNED'] } },
          data: { assignedDriverId: a.driverId, sequence: seq, status: 'ASSIGNED' },
        });
        updated += res.count;
        seq += 1;
      }
    }
    this.logger.log(`🧭 Applied orchestration plan: ${updated} order(s) assigned for company ${companyId}`);
    return { applied: updated };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  private async assertEntitled(companyId: string) {
    const ok = await this.billing.hasFeature(companyId, 'courierManagement');
    if (!ok) throw new ForbiddenException('The Courier Management Suite is available on the Enterprise plan. Upgrade to unlock it.');
  }

  /**
   * Serialise reference allocation for one company and year.
   *
   * Counting rows and adding one is not allocation: two callers read the same
   * count and are handed the same number. `reference` carries no unique
   * constraint, so nothing rejected the duplicate either — two different orders
   * ended up unidentifiable by the number a customer would quote.
   *
   * `pg_advisory_xact_lock` is released when the transaction ends, so callers
   * queue instead of colliding and nothing leaks if a request dies mid-flight.
   * The lock key is scoped per company and year, so one tenant's allocation never
   * blocks another's.
   *
   * NOTE — a unique constraint on (companyId, reference) is the real backstop,
   * but it can only be added once existing duplicates are known not to exist:
   * the index build fails on a table that already has them. Flagged rather than
   * attempted blind.
   */
  private async lockReferenceSpace(tx: any, companyId: string, year: number): Promise<void> {
    const key = `courier-ref:${companyId}:${year}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  private async attachDriverNames(companyId: string, orders: any[]) {
    const ids = [...new Set(orders.map((o) => o.assignedDriverId).filter(Boolean))];
    if (!ids.length) return orders;
    const drivers = await this.prisma.driver.findMany({ where: { id: { in: ids as string[] }, companyId }, select: { id: true, name: true } });
    const nameOf = new Map(drivers.map((d) => [d.id, d.name]));
    return orders.map((o) => ({ ...o, assignedDriverName: o.assignedDriverId ? nameOf.get(o.assignedDriverId) ?? null : null }));
  }

  private async groqOrchestrate(apiKey: string, orders: any[], drivers: any[]): Promise<any | null> {
    const orderLines = orders.map((o) =>
      `${o.id} | ${o.reference} | ${o.priority} | pickup: ${o.pickupAddress} -> drop: ${o.dropoffAddress}` +
      `${o.weightKg ? ` | ${o.weightKg}kg` : ''}${o.windowEnd ? ` | by ${new Date(o.windowEnd).toISOString()}` : ''}`,
    ).join('\n');
    const driverLines = drivers.map((d) => `${d.id} | ${d.name} | ${d.status}`).join('\n');

    const system =
      `${AI_INTERNAL_PREAMBLE}\n` +
      `You are FlowOps' AI delivery orchestrator for a South African courier operation. Assign each pending ` +
      `order to the most suitable available driver and put each driver's orders in an efficient run sequence. ` +
      `Rules: prefer drivers with status AVAILABLE; group geographically-close drop-offs to the same driver; ` +
      `schedule URGENT/HIGH first and respect delivery windows; balance load so no driver is overloaded. If an ` +
      `order can't be assigned, list it as unassigned. Respond with ONLY JSON: ` +
      `{"assignments":[{"driverId":string,"driverName":string,"orderIds":[string in run order],"reasoning":string}],` +
      `"unassigned":[string],"summary":string}. NEVER include text outside this JSON schema.`;
    const user = `DRIVERS (id | name | status):\n${driverLines}\n\nPENDING ORDERS (id | ref | priority | route | meta):\n${orderLines}`;

    try {
      const res = await fetch(this.GROQ, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.MODEL,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) { this.logger.warn(`Groq orchestrate failed: ${res.status}`); return null; }
      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(text);
      // Validate ids against the real set so a hallucinated id can't slip through.
      return this.sanitisePlan(parsed, orders, drivers);
    } catch (err: any) {
      this.logger.error(`Groq orchestrate error: ${err.message}`);
      return null;
    }
  }

  private sanitisePlan(plan: any, orders: any[], drivers: any[]) {
    const validOrders = new Set(orders.map((o) => o.id));
    const driverName = new Map(drivers.map((d) => [d.id, d.name]));
    const assigned = new Set<string>();
    const assignments = (Array.isArray(plan?.assignments) ? plan.assignments : [])
      .filter((a: any) => driverName.has(a.driverId))
      .map((a: any) => {
        const orderIds = (Array.isArray(a.orderIds) ? a.orderIds : []).filter((id: string) => validOrders.has(id) && !assigned.has(id));
        orderIds.forEach((id: string) => assigned.add(id));
        return { driverId: a.driverId, driverName: driverName.get(a.driverId), orderIds, reasoning: String(a.reasoning || '').slice(0, 400) };
      })
      .filter((a: any) => a.orderIds.length);
    const unassigned = orders.map((o) => o.id).filter((id) => !assigned.has(id));
    return {
      assignments,
      unassigned,
      summary: String(plan?.summary || `Assigned ${assigned.size}/${orders.length} orders across ${assignments.length} driver(s).`).slice(0, 400),
    };
  }

  /** Deterministic fallback: priority-sorted round-robin across available drivers. */
  private fallbackOrchestrate(orders: any[], drivers: any[]) {
    const avail = drivers.filter((d) => d.status === 'AVAILABLE');
    const pool = avail.length ? avail : drivers;
    const sorted = [...orders].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2));
    const buckets = new Map<string, string[]>();
    pool.forEach((d) => buckets.set(d.id, []));
    sorted.forEach((o, i) => buckets.get(pool[i % pool.length].id)!.push(o.id));
    const assignments = [...buckets.entries()]
      .filter(([, ids]) => ids.length)
      .map(([driverId, orderIds]) => ({
        driverId,
        driverName: pool.find((d) => d.id === driverId)?.name,
        orderIds,
        reasoning: 'Balanced round-robin by priority (no AI key configured).',
      }));
    return { assignments, unassigned: [], summary: `Heuristically assigned ${orders.length} orders across ${assignments.length} driver(s).` };
  }
}
