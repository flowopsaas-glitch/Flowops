import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEntry = {
  action: string;
  actorType?: 'owner' | 'tenant' | 'system';
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: Record<string, any> | null;
  ip?: string | null;
};

/**
 * Central audit trail for privileged platform actions. Best-effort: a logging
 * failure must never break the underlying action, so writes are wrapped and
 * errors are swallowed (with a server-side warning).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /** Returns the id of the audit_logs row, or null if the write failed (it never throws). */
  async record(entry: AuditEntry): Promise<string | null> {
    try {
      const row = await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorType: entry.actorType ?? 'owner',
          actorId: entry.actorId ?? null,
          actorEmail: entry.actorEmail ?? null,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          targetName: entry.targetName ?? null,
          metadata: entry.metadata ?? undefined,
          ip: entry.ip ?? null,
        },
      });
      return row?.id ?? null;
    } catch (err) {
      this.logger.warn(`Failed to write audit log for ${entry.action}: ${err}`);
      return null;
    }
  }

  async list(query?: { action?: string; actorId?: string; targetId?: string; limit?: number }) {
    const where: any = {};
    if (query?.action) where.action = query.action;
    if (query?.actorId) where.actorId = query.actorId;
    if (query?.targetId) where.targetId = query.targetId;
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query?.limit) || 200, 500),
    });
  }
}
