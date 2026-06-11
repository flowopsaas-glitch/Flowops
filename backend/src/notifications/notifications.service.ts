// src/notifications/notifications.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private readonly prisma: PrismaService) {}

  private _getModel() {
    // Try possible model names based on common conventions
    const names = ['companyNotification', 'CompanyNotification', 'notification', 'Notification', 'alert', 'Alert'];
    for (const name of names) {
      const model = (this.prisma as any)[name];
      if (model && typeof model.findMany === 'function') return model;
    }
    return null;
  }

  async list(args: { userId: number | null; role: string; companyId: number | null; take?: number; skip?: number; unreadOnly?: boolean }) {
    try {
      const model = this._getModel();
      if (!model) return { total: 0, unreadCount: 0, take: 20, skip: 0, items: [] };

      const take = Math.min(50, Math.max(1, Number(args.take) || 20));
      const skip = Math.max(0, Number(args.skip) || 0);
      const isSuperAdmin = String(args.role || "").toUpperCase() === "SUPER_ADMIN";

      const where: any = {};
      if (!isSuperAdmin) {
        where.OR = [{ companyId: args.companyId }, { companyId: null }];
        if (args.userId) where.OR.push({ userId: args.userId });
      }
      if (args.unreadOnly) where.readAt = null;

      const [total, unreadCount, items] = await Promise.all([
        model.count({ where }),
        model.count({ where: { ...where, readAt: null } }),
        model.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip })
      ]);

      return { total, unreadCount, take, skip, items };
    } catch (error: any) {
      this.logger.error(`List notifications failed: ${error?.message}`);
      return { total: 0, unreadCount: 0, take: 20, skip: 0, items: [] };
    }
  }

  async create(args: { companyId: number | null; userId: number | null; type: string; title: string; message: string; data?: any }) {
    try {
      const model = this._getModel();
      if (!model) return { id: 0, success: false, message: 'Notification model not configured' };

      return model.create({
        data: {
          companyId: args.companyId,
          userId: args.userId,
          type: String(args.type || 'INFO').slice(0, 50),
          title: String(args.title || '').slice(0, 120),
          message: String(args.message || '').slice(0, 2000),
          data: args.data || null,
        }
      });
    } catch (error: any) {
      this.logger.error(`Create notification failed: ${error?.message}`);
      return { id: 0, success: false, message: error?.message || 'Failed to create' };
    }
  }

  async markRead(args: { id: number; userId: number | null; role: string; companyId: number | null }) {
    try {
      const model = this._getModel();
      if (!model) return null;

      const item = await model.findUnique({ where: { id: args.id } });
      if (!item) return null;

      const isSuperAdmin = String(args.role || "").toUpperCase() === "SUPER_ADMIN";
      if (!isSuperAdmin) {
        const companyOk = item.companyId === args.companyId || item.companyId == null;
        const userOk = item.userId == null || (args.userId != null && item.userId === args.userId);
        if (!companyOk || !userOk) return null;
      }

      return model.update({
        where: { id: args.id },
        data: { readAt: new Date() }
      });
    } catch {
      return null;
    }
  }

  async readAll(args: { userId: number | null; role: string; companyId: number | null }) {
    try {
      const model = this._getModel();
      if (!model) return { count: 0 };

      const isSuperAdmin = String(args.role || "").toUpperCase() === "SUPER_ADMIN";
      const where: any = { readAt: null };
      
      if (!isSuperAdmin) {
        where.OR = [{ companyId: args.companyId }, { companyId: null }];
        if (args.userId) where.OR.push({ userId: args.userId });
      }

      return model.updateMany({ where, data: { readAt: new Date() } });
    } catch {
      return { count: 0 };
    }
  }

  async getPendingNotifications(userId: number | null, role: string, companyId: number | null) {
    try {
      const model = this._getModel();
      if (!model) return { count: 0, unread: 0 };

      const isSuperAdmin = String(role || "").toUpperCase() === "SUPER_ADMIN";
      const where: any = { readAt: null };
      
      if (!isSuperAdmin) {
        where.OR = [{ companyId }, { companyId: null }];
        if (userId) where.OR.push({ userId });
      }

      const count = await model.count({ where });
      return { count, unread: count };
    } catch {
      return { count: 0, unread: 0 };
    }
  }
}
