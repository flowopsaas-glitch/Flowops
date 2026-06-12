import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByCompany(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        isActive: true, emailVerified: true, createdAt: true,
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
    const passwordHash = await bcrypt.hash(dto.password ?? uuid(), 12);
    const { password, ...rest } = dto;
    const user = await this.prisma.user.create({
      data: { ...rest, email: dto.email.toLowerCase(), passwordHash, companyId },
    });
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async update(id: string, companyId: string, dto: any) {
    const { password, passwordHash, ...data } = dto;
    const extra: any = {};
    if (password) extra.passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...data, ...extra },
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
