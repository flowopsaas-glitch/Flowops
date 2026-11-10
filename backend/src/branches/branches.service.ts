import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class BranchesService {
  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
  ) {}

  async findAll(companyId: string) {
    return this.prisma.branch.findMany({ where: { companyId }, include: { _count: { select: { drivers: true } } } });
  }

  async snapshot(companyId: string) {
    // Used by NetworkMap component — branch locations + driver counts
    return this.prisma.branch.findMany({
      where: { companyId },
      include: {
        drivers: { where: { status: 'ON_ROUTE' }, select: { id: true, status: true } },
      },
    });
  }

  async create(companyId: string, dto: any) {
    // Enforce the plan's branch limit (Starter = 1; Pro/Enterprise unlimited).
    await this.billing.assertCanCreate(companyId, 'branch');
    return this.prisma.branch.create({ data: { ...dto, companyId } });
  }

  async update(id: string, companyId: string, dto: any) {
    // Tenant-scoped: only the owning company may edit its branch.
    // companyId is re-asserted last, not just filtered in the WHERE clause.
    // `dto` is an untyped body, so a caller could otherwise put `companyId`
    // in the payload and move their branch into another tenant's company —
    // the WHERE would still match (they own it now) and the write would
    // re-home it. Setting it explicitly makes the tenant of record the
    // authenticated one, never the requested one.
    const { companyId: _ignored, ...rest } = dto ?? {};
    const res = await this.prisma.branch.updateMany({
      where: { id, companyId },
      data: { ...rest, companyId },
    });
    if (res.count === 0) throw new NotFoundException('Branch not found');
    return this.prisma.branch.findFirst({ where: { id, companyId } });
  }
}
