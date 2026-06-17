import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
    private webhooks: WebhooksService,
  ) {}

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

  // ── Event-driven customer status notifications ───────────────────────

  private static readonly CUSTOMER_STATUS_COPY: Record<
    string,
    { title: string; line: string }
  > = {
    COLLECTED: { title: 'Parcel collected', line: 'has been collected and is entering our network' },
    IN_TRANSIT: { title: 'On its way', line: 'is now in transit' },
    OUT_FOR_DELIVERY: { title: 'Out for delivery', line: 'is out for delivery today' },
    DELIVERED: { title: 'Delivered', line: 'has been delivered' },
    FAILED_DELIVERY: { title: 'Delivery attempt failed', line: 'could not be delivered — we will retry' },
    RETURNED: { title: 'Returned to sender', line: 'is being returned to the sender' },
  };

  /**
   * Fired when a waybill's status changes. Logs an internal notification for
   * the tenant and (when the recipient email + SendGrid are available) emails
   * the customer a branded update with a live tracking link. Best-effort:
   * failures are logged and never block the status change.
   */
  async notifyWaybillStatus(waybill: {
    companyId: string;
    trackingNumber: string;
    recipientName?: string | null;
    recipientEmail?: string | null;
    status: string;
  }) {
    const copy = NotificationsService.CUSTOMER_STATUS_COPY[waybill.status];
    if (!copy) return; // not a customer-facing status

    const trackUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/track/${waybill.trackingNumber}`;

    // 0) Emit a webhook event for tenant integrations (Shopify, etc.).
    void this.webhooks.dispatch(waybill.companyId, 'waybill.status_changed', {
      trackingNumber: waybill.trackingNumber,
      status: waybill.status,
      trackUrl,
    });

    // 1) Internal notification for the tenant operations feed.
    try {
      await this.prisma.notification.create({
        data: {
          companyId: waybill.companyId,
          title: `${copy.title} · ${waybill.trackingNumber}`,
          body: `Parcel ${waybill.trackingNumber} ${copy.line}.`,
          type: 'STATUS_UPDATE',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to log status notification: ${err?.message ?? err}`);
    }

    // 2) Customer email (only if we have an address + a configured sender).
    if (waybill.recipientEmail) {
      const name = (waybill.recipientName || 'there').split(/\s+/)[0];
      await this.email
        .send({
          to: waybill.recipientEmail,
          subject: `${copy.title} — ${waybill.trackingNumber}`,
          text: `Hi ${name}, your parcel ${waybill.trackingNumber} ${copy.line}. Track it live: ${trackUrl}`,
          html: `
            <h2 style="margin-top:0;color:#1e3a5f;">${copy.title}</h2>
            <p>Hi ${name}, your parcel <strong>${waybill.trackingNumber}</strong> ${copy.line}.</p>
            <a href="${trackUrl}" class="btn">Track your delivery</a>
          `,
        })
        .catch((err) => this.logger.warn(`Status email failed: ${err?.message ?? err}`));
    }
  }
}
