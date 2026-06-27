import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private billing: BillingService) {}

  async findByCompany(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        permissions: true, isActive: true, emailVerified: true, createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      include: { notificationPreference: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async create(companyId: string, dto: any) {
    await this.billing.assertCanCreate(companyId, 'user');
    const passwordHash = await bcrypt.hash(dto.password ?? uuid(), 12);
    const user = await this.prisma.user.create({
      data: {
        email: String(dto.email).toLowerCase(),
        name: dto.name ?? String(dto.email).split('@')[0],
        phone: dto.phone ?? null,
        role: dto.role ?? 'USER',
        permissions: dto.permissions ?? undefined,
        passwordHash,
        companyId,
      },
    });
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async update(id: string, companyId: string, dto: any) {
    // Whitelist updatable fields so stray keys never reach Prisma.
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.permissions !== undefined) data.permissions = dto.permissions;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async remove(id: string, companyId: string) {
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'User deactivated' };
  }
}
