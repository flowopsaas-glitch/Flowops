import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailHubService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, resolved?: boolean) {
    return this.prisma.emailHubItem.findMany({
      where: {
        companyId,
        ...(resolved !== undefined ? { resolved } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async stats(companyId: string) {
    const [total, unread, unresolved] = await Promise.all([
      this.prisma.emailHubItem.count({ where: { companyId } }),
      this.prisma.emailHubItem.count({ where: { companyId, read: false } }),
      this.prisma.emailHubItem.count({ where: { companyId, resolved: false } }),
    ]);
    return { total, unread, unresolved };
  }

  async create(companyId: string, dto: {
    subject: string; from: string; to: string; body?: string; category?: string;
  }) {
    return this.prisma.emailHubItem.create({
      data: { ...dto, companyId },
    });
  }

  async markRead(id: string, companyId: string) {
    return this.prisma.emailHubItem.update({
      where: { id },
      data: { read: true },
    });
  }

  async resolve(id: string, companyId: string) {
    return this.prisma.emailHubItem.update({
      where: { id },
      data: { resolved: true },
    });
  }
}
