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
   * the customer a branded update with a live tracking link.
   *
   * When the waybill has a recipientPhone, also prepares a pre-built WhatsApp
   * click-to-chat URL — the operator sees a "Send WhatsApp" link in the
   * notification feed and can forward it to the customer in one tap.
   */
  async notifyWaybillStatus(waybill: {
    companyId: string;
    trackingNumber: string;
    recipientName?: string | null;
    recipientEmail?: string | null;
    recipientPhone?: string | null;
    status: string;
  }) {
    const copy = NotificationsService.CUSTOMER_STATUS_COPY[waybill.status];
    if (!copy) return; // not a customer-facing status

    const trackUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/track/${waybill.trackingNumber}`;
    const name = (waybill.recipientName || 'there').split(/\s+/)[0];

    // Build a WhatsApp click-to-chat URL when we have the recipient's phone.
    const waLink = this.buildWaLink(waybill.recipientPhone, name, waybill.trackingNumber, copy.line, trackUrl);

    // 0) Webhook event for tenant integrations.
    void this.webhooks.dispatch(waybill.companyId, 'waybill.status_changed', {
      trackingNumber: waybill.trackingNumber,
      status: waybill.status,
      trackUrl,
    });

    // 1) Internal tenant notification (includes WA link when available).
    try {
      await this.prisma.notification.create({
        data: {
          companyId: waybill.companyId,
          title: `${copy.title} · ${waybill.trackingNumber}`,
          body: waLink
            ? `${waybill.trackingNumber} ${copy.line}. [WhatsApp: ${waLink}]`
            : `Parcel ${waybill.trackingNumber} ${copy.line}.`,
          type: 'STATUS_UPDATE',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to log status notification: ${err?.message ?? err}`);
    }

    // 2) Customer email.
    if (waybill.recipientEmail) {
      await this.email
        .send({
          to: waybill.recipientEmail,
          subject: `${copy.title} — ${waybill.trackingNumber}`,
          text: `Hi ${name}, your parcel ${waybill.trackingNumber} ${copy.line}. Track it live: ${trackUrl}`,
          html: `
            <h2 style="margin-top:0;color:#1e3a5f;">${copy.title}</h2>
            <p>Hi ${name}, your parcel <strong>${waybill.trackingNumber}</strong> ${copy.line}.</p>
            <a href="${trackUrl}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Track your delivery</a>
            ${waLink ? `<p style="margin-top:12px;font-size:12px;color:#888;">Reply on WhatsApp: <a href="${waLink}">${waLink}</a></p>` : ''}
          `,
        })
        .catch((err) => this.logger.warn(`Status email failed: ${err?.message ?? err}`));
    }
  }

  /**
   * Builds a wa.me click-to-chat URL with a pre-filled message.
   * Returns null if no valid phone number is available.
   */
  private buildWaLink(
    phone?: string | null,
    recipientName = 'there',
    trackingNumber = '',
    statusLine = '',
    trackUrl = '',
  ): string | null {
    if (!phone) return null;
    // Normalise: keep only digits, strip leading 0, add 27 country code for SA
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) return null;
    const intl = digits.startsWith('0') ? `27${digits.slice(1)}` : digits;

    const text = `Hi ${recipientName}, your FlowOps parcel (${trackingNumber}) ${statusLine}. Track it here: ${trackUrl}`;
    return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
  }

  // ── ETA + Stops-ahead alert ───────────────────────────────────────

  async sendEtaAlert(
    waybill: { companyId: string; trackingNumber: string; recipientName?: string | null; recipientEmail?: string | null; recipientPhone?: string | null },
    stopsAhead: number,
    etaMinutes?: number,
  ) {
    const appUrl = this.config.get('APP_URL', 'http://localhost:8080');
    const trackUrl = `${appUrl}/track/${waybill.trackingNumber}`;
    const name = (waybill.recipientName || 'there').split(/\s+/)[0];
    const etaText = etaMinutes ? ` in approximately ${etaMinutes} min` : '';
    const stopsText = stopsAhead <= 1 ? 'next stop' : `${stopsAhead} stops away`;

    const message = `Hi ${name}, your FlowOps delivery (${waybill.trackingNumber}) is ${stopsText} — arriving${etaText}. Track live: ${trackUrl}`;

    // Internal notification
    try {
      await this.prisma.notification.create({
        data: {
          companyId: waybill.companyId,
          title: `ETA alert sent · ${waybill.trackingNumber}`,
          body: `${stopsText} — ETA${etaText}. Customer notified.`,
          type: 'ETA_ALERT',
        },
      });
    } catch {}

    // Customer email
    if (waybill.recipientEmail) {
      await this.email.send({
        to: waybill.recipientEmail,
        subject: `Your delivery is ${stopsText} — ${waybill.trackingNumber}`,
        text: message,
        html: `
          <h2 style="margin-top:0;color:#1e3a5f;">🚚 Your delivery is almost here!</h2>
          <p>Hi ${name}, your parcel <strong>${waybill.trackingNumber}</strong> is <strong>${stopsText}</strong>${etaText}.</p>
          <a href="${trackUrl}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Track your delivery live →</a>
        `,
      }).catch((e) => this.logger.warn(`ETA email failed: ${e?.message}`));
    }

    // WhatsApp link
    const waLink = this.buildWaLink(waybill.recipientPhone, name, waybill.trackingNumber, `is ${stopsText}${etaText}`, trackUrl);
    return { waLink, message };
  }

  // ── Delivery rating request ───────────────────────────────────────

  async sendRatingRequest(waybill: {
    companyId: string; trackingNumber: string; recipientName?: string | null;
    recipientEmail?: string | null; recipientPhone?: string | null;
    ratingToken?: string | null;
  }) {
    if (!waybill.ratingToken) return;
    const appUrl = this.config.get('APP_URL', 'http://localhost:8080');
    const rateUrl = `${appUrl}/rate/${waybill.ratingToken}`;
    const name = (waybill.recipientName || 'there').split(/\s+/)[0];

    if (waybill.recipientEmail) {
      await this.email.send({
        to: waybill.recipientEmail,
        subject: `How was your delivery? — ${waybill.trackingNumber}`,
        text: `Hi ${name}, your FlowOps delivery ${waybill.trackingNumber} is complete. Rate your experience: ${rateUrl}`,
        html: `
          <h2 style="margin-top:0;color:#1e3a5f;">How was your delivery?</h2>
          <p>Hi ${name}, your parcel <strong>${waybill.trackingNumber}</strong> has been delivered. We'd love your feedback!</p>
          <a href="${rateUrl}" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#f59e0b;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">Rate your experience ★</a>
          <p style="margin-top:12px;font-size:12px;color:#888;">This link expires in 7 days.</p>
        `,
      }).catch((e) => this.logger.warn(`Rating email failed: ${e?.message}`));
    }

    // WhatsApp
    const digits = (waybill.recipientPhone || '').replace(/\D/g, '');
    if (digits.length >= 9) {
      const intl = digits.startsWith('0') ? `27${digits.slice(1)}` : digits;
      const text = `Hi ${name}, your FlowOps delivery (${waybill.trackingNumber}) is complete! Rate your experience here: ${rateUrl}`;
      const waLink = `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
      try {
        await this.prisma.notification.create({
          data: {
            companyId: waybill.companyId,
            title: `Rating request sent · ${waybill.trackingNumber}`,
            body: `[WhatsApp rating link: ${waLink}]`,
            type: 'RATING_REQUEST',
          },
        });
      } catch {}
    }
  }

}
