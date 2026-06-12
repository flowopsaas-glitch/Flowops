import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, companyId: string, query?: any) {
    const take = Number(query?.limit) || 50;
    const where: any = { companyId };
    if (query?.unread === 'true') where.read = false;

    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });
    return notifications;
  }

  async markRead(id: string, companyId: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });
  }

  async markAllRead(companyId: string) {
    await this.prisma.notification.updateMany({
      where: { companyId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { message: 'All notifications marked as read' };
  }

  async create(companyId: string, dto: any) {
    return this.prisma.notification.create({
      data: { ...dto, companyId },
    });
  }

  // ── Notification Preferences ────────────────────────────────────────

  async getPreferences(userId: string) {
    let prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Return defaults without persisting (created on first update)
      prefs = {
        id: '',
        userId,
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
        operationsEmail: true,
        operationsSms: false,
        operationsPush: true,
        billingEmail: true,
        billingPush: false,
        securityEmail: true,
        securityPush: true,
        systemEmail: false,
        systemPush: false,
        digestFrequency: 'INSTANT' as any,
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        timezone: 'Africa/Johannesburg',
        updatedAt: new Date(),
      };
    }

    return prefs;
  }

  async updatePreferences(userId: string, dto: any) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: { ...dto, updatedAt: new Date() },
      create: { userId, ...dto },
    });
  }

  // ── Internal: broadcast a notification to a whole company ────────────

  async broadcast(companyId: string, title: string, body: string, type = 'info') {
    return this.prisma.notification.create({
      data: { title, body, type, companyId },
    });
  }
}
