import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.branch.create({ data: { ...dto, companyId } });
  }

  async update(id: string, companyId: string, dto: any) {
    return this.prisma.branch.update({ where: { id }, data: dto });
  }
}
