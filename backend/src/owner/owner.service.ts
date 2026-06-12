import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class OwnerService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  // ── Tenants ───────────────────────────────────────────────────────────

  async listTenants(query?: any) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 50;
    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        skip: (page - 1) * limit, take: limit,
        include: { _count: { select: { users: true, waybills: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count(),
    ]);
    return { data: companies, total, page, limit };
  }

  async getTenant(id: string) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id },
      include: {
        users: { where: { role: 'ADMIN' }, select: { id: true, email: true, name: true } },
        _count: { select: { waybills: true, collections: true } },
      },
    });
  }

  /** Draft a new tenant (creates Company without users). */
  async draftTenant(dto: any) {
    return this.prisma.company.create({ data: { ...dto, isActive: false } });
  }

  /** Approve/reject/suspend a tenant. */
  async tenantAction(tenantId: string, action: 'approve' | 'reject' | 'suspend', opts?: any) {
    if (action === 'approve') {
      // Find the ApprovalRequest, create the admin user
      const req = await this.prisma.approvalRequest.findFirst({ where: { companyId: tenantId } });
      if (req) {
        let passwordHash: string;
        try {
          const parsed = JSON.parse(req.notes ?? '{}');
          passwordHash = parsed.passwordHash;
        } catch {
          passwordHash = await bcrypt.hash('ChangeMe123!', 12);
        }
        await this.prisma.user.create({
          data: {
            email: req.email.toLowerCase(),
            passwordHash,
            name: req.fullName,
            phone: req.phone,
            role: 'ADMIN',
            companyId: tenantId,
          },
        });
        await this.prisma.approvalRequest.update({
          where: { id: req.id },
          data: { status: 'APPROVED' },
        });

        // Send welcome email to the newly approved admin user
        await this.email.sendWelcomeEmail(req.email, req.fullName, req.company);
      }
      return this.prisma.company.update({ where: { id: tenantId }, data: { isActive: true } });
    }

    if (action === 'reject') {
      await this.prisma.approvalRequest.updateMany({
        where: { companyId: tenantId },
        data: { status: 'REJECTED', notes: opts?.reason },
      });
      return this.prisma.company.update({ where: { id: tenantId }, data: { isActive: false } });
    }

    if (action === 'suspend') {
      return this.prisma.company.update({ where: { id: tenantId }, data: { isActive: false } });
    }

    throw new Error('Unknown action');
  }

  /** Generate a temporary view-as-tenant context. */
  async viewModeContext(tenantId: string) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, name: true, logoUrl: true, primaryColor: true },
    });
  }

  // ── Platform metrics ──────────────────────────────────────────────────

  async platformMetrics() {
    const [tenants, users, waybills, collections, revenue] = await Promise.all([
      this.prisma.company.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.waybill.count(),
      this.prisma.collection.count(),
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } }),
    ]);
    return { tenants, users, waybills, collections, totalRevenue: revenue._sum.amount ?? 0 };
  }

  // ── AI alerts (critical events across all tenants) ────────────────────

  async getPlatformAlerts() {
    return this.prisma.aiEvent.findMany({
      where: { severity: 'critical', resolved: false },
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── Audit log ─────────────────────────────────────────────────────────

  async getAuditLog(query?: any) {
    return this.prisma.aiEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { company: { select: { name: true } } },
    });
  }

  // ── Plans ─────────────────────────────────────────────────────────────

  /**
   * FlowOps billing plans — synced from Paystack (Flowops Holdings, ID: 1839930).
   *
   *   Starter:      FREE   (no Paystack plan — instant activation, no billing)
   *   Professional: ZAR 14,999 / month  PLN_l3kobthzahnkpf3
   *   Enterprise:   ZAR 29,999 / month  PLN_9at9kn2ra8jtae0
   */
  async getPlans() {
    return [
      {
        id: 'starter',
        name: 'Starter',
        description: 'For small couriers getting started — free, no credit card required',
        maxUsers: 5,
        maxWaybills: 200,
        price: 0,
        currency: 'ZAR',
        interval: null,            // free — not billed
        paystackPlanCode: null,    // no Paystack subscription — activated instantly via planId:'starter'
        popular: false,
      },
      {
        id: 'professional',
        name: 'Professional',
        description: 'Full FlowOps feature suite for growing couriers',
        maxUsers: 50,
        maxWaybills: 10000,
        price: 14999,
        currency: 'ZAR',
        interval: 'month',
        paystackPlanCode: 'PLN_l3kobthzahnkpf3',
        popular: true,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'Unlimited scale + white-label + dedicated support',
        maxUsers: -1,
        maxWaybills: -1,
        price: 29999,
        currency: 'ZAR',
        interval: 'month',
        paystackPlanCode: 'PLN_9at9kn2ra8jtae0',
        popular: false,
      },
    ];
  }

  async updateTenantPlan(tenantId: string, plan: string) {
    return this.prisma.company.update({ where: { id: tenantId }, data: { plan } });
  }

  // ── Approval requests ─────────────────────────────────────────────────

  async getApprovalRequests(query?: any) {
    return this.prisma.approvalRequest.findMany({
      where: query?.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveRequest(requestId: string) {
    const req = await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
    // Create company + user
    let passwordHash: string;
    try { passwordHash = JSON.parse(req.notes ?? '{}').passwordHash; } catch { passwordHash = await bcrypt.hash('ChangeMe123!', 12); }

    const company = await this.prisma.company.create({
      data: { name: req.company, email: req.email, isActive: true },
    });
    await this.prisma.user.create({
      data: { email: req.email, passwordHash, name: req.fullName, phone: req.phone, role: 'ADMIN', companyId: company.id },
    });
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', companyId: company.id },
    });
    return { company, message: 'Approved and onboarded' };
  }

  async rejectRequest(requestId: string, reason?: string) {
    return this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', notes: reason },
    });
  }
}
