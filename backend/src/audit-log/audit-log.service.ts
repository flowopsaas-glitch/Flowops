import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'LOGIN' | 'LOGOUT'
  | 'CREATED' | 'UPDATED' | 'DELETED'
  | 'VIEWED' | 'EXPORTED'
  | 'PASSWORD_RESET' | 'STATUS_CHANGED'
  | 'INVOICE_SENT' | 'INVOICE_PAID'
  | 'WAYBILL_DELIVERED' | 'POD_CAPTURED' | 'POC_CAPTURED'
  | 'DRIVER_ASSIGNED' | 'COLLECTION_COMPLETED'
  | 'TENANT_APPROVED' | 'TENANT_SUSPENDED'
  | 'SEEDER_RUN';

export interface LogActionDto {
  action: AuditAction;
  description: string;
  entityType?: string;
  entityId?: string;
  companyId: number;
  userId?: number;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('AuditLog');

  constructor(private prisma: PrismaService) {}

  async log(dto: LogActionDto): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          action: dto.action,
          description: dto.description,
          entityType: dto.entityType || null,
          entityId: dto.entityId || null,
          companyId: dto.companyId,
          userId: dto.userId || null,
          ipAddress: dto.ipAddress || null,
          metadata: dto.metadata || undefined,
        },
      });
    } catch (e: any) {
      this.logger.error(`Audit log failed: ${e.message}`);
    }
  }

  async getLogs(companyId: number, options?: {
    entityType?: string;
    action?: string;
    userId?: number;
    limit?: number;
    offset?: number;
    from?: Date;
    to?: Date;
  }) {
    const where: any = { companyId };
    if (options?.entityType) where.entityType = options.entityType;
    if (options?.action) where.action = { contains: options.action, mode: 'insensitive' };
    if (options?.userId) where.userId = options.userId;
    if (options?.from || options?.to) {
      where.createdAt = {};
      if (options.from) where.createdAt.gte = options.from;
      if (options.to) where.createdAt.lte = options.to;
    }

    const [total, logs] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
    ]);

    return { total, logs };
  }

  async getStats(companyId: number) {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const weekAgo = new Date(Date.now() - 7 * 86400000);

    const [totalLogs, todayLogs, weekLogs, topActions] = await Promise.all([
      this.prisma.activityLog.count({ where: { companyId } }),
      this.prisma.activityLog.count({ where: { companyId, createdAt: { gte: today } } }),
      this.prisma.activityLog.count({ where: { companyId, createdAt: { gte: weekAgo } } }),
      this.prisma.activityLog.groupBy({
        by: ['action'],
        where: { companyId, createdAt: { gte: weekAgo } },
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 5,
      }),
    ]);

    return {
      totalLogs,
      todayLogs,
      weekLogs,
      topActions: topActions.map(a => ({ action: a.action, count: a._count.action })),
    };
  }
}
