import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { OutboxService } from '../webhooks/outbox.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
    private outbox: OutboxService,
    private whatsapp: WhatsAppService,
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
    // Tenant-scoped: a user can only mark their own company's notification read.
    const res = await this.prisma.notification.updateMany({
      where: { id, companyId },
      data: { read: true, readAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Notification not found');
    return { read: true };
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
    { title: string; line: string; emoji: string }
  > = {
    PENDING: { title: 'Booking confirmed', line: 'has been booked and is awaiting pickup', emoji: '📦' },
    COLLECTED: { title: 'Parcel collected', line: 'has been collected and is entering our network', emoji: '✅' },
    IN_TRANSIT: { title: 'On its way', line: 'is now in transit', emoji: '🚚' },
    OUT_FOR_DELIVERY: { title: 'Out for delivery', line: 'is out for delivery today', emoji: '🏃' },
    DELIVERED: { title: 'Delivered', line: 'has been delivered', emoji: '🎉' },
    FAILED_DELIVERY: { title: 'Delivery attempt failed', line: 'could not be delivered — we will retry', emoji: '⚠️' },
    RETURNED: { title: 'Returned to sender', line: 'is being returned to the sender', emoji: '↩️' },
  };

  /**
   * Fired when a waybill's status changes. Logs an internal notification for
   * the tenant and emails BOTH the sender and receiver with a branded,
   * world-class status update including live tracking link and POD details.
   *
   * Also sends a WhatsApp notification to the recipient via the Business API.
   * Falls back to generating a click-to-chat link if WhatsApp is not configured.
   *
   * FULL LOGISTICS LIFECYCLE:
   *   PENDING → Booking confirmation ("your parcel has been booked")
   *   COLLECTED → "picked up and entering our network"
   *   IN_TRANSIT → "on its way"
   *   OUT_FOR_DELIVERY → "out for delivery today"
   *   DELIVERED → POD confirmation + rating request
   *   FAILED_DELIVERY → "could not be delivered — we will retry"
   *   RETURNED → "being returned to sender"
   */
  async notifyWaybillStatus(waybill: {
    companyId: string;
    trackingNumber: string;
    senderName?: string | null;
    senderEmail?: string | null;
    senderPhone?: string | null;
    recipientName?: string | null;
    recipientEmail?: string | null;
    recipientPhone?: string | null;
    podImageUrl?: string | null;
    podSignatureUrl?: string | null;
    podRecipient?: string | null;
    podDeliveredAt?: Date | string | null;
    status: string;
  }) {
    const copy = NotificationsService.CUSTOMER_STATUS_COPY[waybill.status];
    if (!copy) return; // not a customer-facing status

    const trackUrl = `${this.config.get('APP_URL', 'http://localhost:8080')}/track/${waybill.trackingNumber}`;
    const recipientFirst = (waybill.recipientName || 'there').split(/\s+/)[0];
    const senderFirst = (waybill.senderName || 'there').split(/\s+/)[0];

    // Build a WhatsApp click-to-chat URL when we have the recipient's phone.
    const waLink = this.buildWaLink(waybill.recipientPhone, recipientFirst, waybill.trackingNumber, copy.line, trackUrl);

    // 0) Webhook event for tenant integrations — via the transactional outbox
    // so the event survives a crash between here and delivery.
    void this.outbox.enqueue(this.prisma, waybill.companyId, 'waybill.status_changed', {
      trackingNumber: waybill.trackingNumber,
      status: waybill.status,
      trackUrl,
    });

    // 1) Internal tenant notification (includes WA link when available).
    try {
      await this.prisma.notification.create({
        data: {
          companyId: waybill.companyId,
          title: `${copy.emoji} ${copy.title} · ${waybill.trackingNumber}`,
          body: waLink
            ? `${waybill.trackingNumber} ${copy.line}. [WhatsApp: ${waLink}]`
            : `Parcel ${waybill.trackingNumber} ${copy.line}.`,
          type: 'STATUS_UPDATE',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to log status notification: ${err?.message ?? err}`);
    }

    // 2) Customer email — send to BOTH sender AND receiver.
    const deliveredAt = waybill.podDeliveredAt
      ? new Date(waybill.podDeliveredAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });

    const podBlock = waybill.status === 'DELIVERED' ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#f0fdf4;padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#16a34a;">✓ Proof of Delivery</p>
          <p style="margin:0;font-size:14px;color:#1e293b;"><strong>Received by:</strong> ${waybill.podRecipient || waybill.recipientName || '—'}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#475569;"><strong>Date &amp; Time:</strong> ${deliveredAt}</p>
          ${waybill.podImageUrl ? `<p style="margin:10px 0 0;"><a href="${waybill.podImageUrl}" style="color:#2563eb;font-size:13px;font-weight:600;">📷 View POD Photo</a></p>` : ''}
          ${waybill.podSignatureUrl ? `<p style="margin:6px 0 0;"><a href="${waybill.podSignatureUrl}" style="color:#2563eb;font-size:13px;font-weight:600;">✍️ View Signature</a></p>` : ''}
        </td></tr>
      </table>
    ` : '';

    const buildEmailHtml = (greeting: string, role: 'sender' | 'receiver') => `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
          <tr><td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:28px 32px;text-align:center;">
                <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${copy.emoji} ${copy.title}</h1>
                <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">Tracking: ${waybill.trackingNumber}</p>
              </td></tr>
              <!-- Body -->
              <tr><td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
                  ${greeting}, ${role === 'receiver' ? 'your' : 'the'} parcel <strong style="color:#0f172a;">${waybill.trackingNumber}</strong> ${copy.line}.
                </p>
                ${podBlock}
                <!-- CTA Button -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                  <tr><td align="center">
                    <a href="${trackUrl}" style="display:inline-block;padding:14px 32px;background:#10b981;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">
                      Track ${role === 'receiver' ? 'Your' : 'This'} Delivery →
                    </a>
                  </td></tr>
                </table>
              </td></tr>
              <!-- Footer -->
              <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
                <p style="margin:0;font-size:11px;color:#94a3b8;">
                  Powered by FlowOps • Parcel tracking and logistics management<br/>
                  <a href="${trackUrl}" style="color:#64748b;">Track online</a>
                </p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `;

    // Send to RECEIVER
    if (waybill.recipientEmail) {
      await this.email
        .send({
          to: waybill.recipientEmail,
          subject: `${copy.emoji} ${copy.title} — ${waybill.trackingNumber}`,
          text: `Hi ${recipientFirst}, your parcel ${waybill.trackingNumber} ${copy.line}. Track it live: ${trackUrl}`,
          html: buildEmailHtml(`Hi ${recipientFirst}`, 'receiver'),
        })
        .catch((err) => this.logger.warn(`Recipient email failed: ${err?.message ?? err}`));
    }

    // Send to SENDER (confirmation that their shipment status changed)
    if (waybill.senderEmail) {
      const senderSubject = waybill.status === 'DELIVERED'
        ? `✅ Delivered — ${waybill.trackingNumber} (to ${waybill.recipientName || 'recipient'})`
        : `${copy.emoji} ${copy.title} — ${waybill.trackingNumber}`;
      await this.email
        .send({
          to: waybill.senderEmail,
          subject: senderSubject,
          text: `Hi ${senderFirst}, the parcel ${waybill.trackingNumber} (to ${waybill.recipientName || 'recipient'}) ${copy.line}. Track: ${trackUrl}`,
          html: buildEmailHtml(`Hi ${senderFirst}`, 'sender'),
        })
        .catch((err) => this.logger.warn(`Sender email failed: ${err?.message ?? err}`));
    }

    // 3) WhatsApp auto-send to RECIPIENT via Business API.
    if (waybill.recipientPhone) {
      const waMessage = `${copy.emoji} Hi ${recipientFirst}, your parcel *${waybill.trackingNumber}* ${copy.line}.\n\n` +
        `📍 Track live: ${trackUrl}`;
      try {
        await this.whatsapp.sendMessage(waybill.companyId, waybill.recipientPhone, waMessage);
      } catch (err: any) {
        // WhatsApp send is best-effort — fails silently when not configured
        this.logger.debug(`WhatsApp auto-notify skipped/failed: ${err?.message ?? err}`);
      }
    }

    // 4) WhatsApp auto-send to SENDER (they want to know their parcel is moving).
    if (waybill.senderPhone && waybill.status !== 'PENDING') {
      const senderWaMessage = `${copy.emoji} Hi ${senderFirst}, your shipment *${waybill.trackingNumber}* (to ${waybill.recipientName || 'recipient'}) ${copy.line}.\n\n` +
        `📍 Track: ${trackUrl}`;
      try {
        await this.whatsapp.sendMessage(waybill.companyId, waybill.senderPhone, senderWaMessage);
      } catch (err: any) {
        this.logger.debug(`WhatsApp sender notify skipped/failed: ${err?.message ?? err}`);
      }
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
          title: `🚚 ETA alert sent · ${waybill.trackingNumber}`,
          body: `${stopsText} — ETA${etaText}. Customer notified via WhatsApp + email.`,
          type: 'ETA_ALERT',
        },
      });
    } catch (e) { this.logger.warn(`notification side-effect failed: ${(e as Error)?.message}`); }

    // Customer email
    if (waybill.recipientEmail) {
      await this.email.send({
        to: waybill.recipientEmail,
        subject: `🚚 Your delivery is ${stopsText} — ${waybill.trackingNumber}`,
        text: message,
        html: `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
              <tr><td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                  <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:28px 32px;text-align:center;">
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">🚚 Almost there!</h1>
                    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">Tracking: ${waybill.trackingNumber}</p>
                  </td></tr>
                  <tr><td style="padding:32px;">
                    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
                      Hi ${name}, your delivery is <strong style="color:#10b981;">${stopsText}</strong>${etaText}!
                    </p>
                    <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:16px 20px;border-radius:8px;margin:20px 0;">
                      <p style="margin:0;font-size:24px;font-weight:800;color:#166534;">${stopsAhead <= 1 ? '🎯 Next stop!' : `${stopsAhead} stops away`}</p>
                      ${etaMinutes ? `<p style="margin:4px 0 0;font-size:14px;color:#374151;">Arriving in ~<strong>${etaMinutes} minutes</strong></p>` : ''}
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                      <tr><td align="center">
                        <a href="${trackUrl}" style="display:inline-block;padding:14px 32px;background:#10b981;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">
                          Track Your Delivery Live →
                        </a>
                      </td></tr>
                    </table>
                  </td></tr>
                  <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
                    <p style="margin:0;font-size:11px;color:#94a3b8;">Powered by FlowOps • <a href="${trackUrl}" style="color:#64748b;">Track online</a></p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </body></html>
        `,
      }).catch((e) => this.logger.warn(`ETA email failed: ${e?.message}`));
    }

    // WhatsApp auto-send (Business API — not just a link!)
    if (waybill.recipientPhone) {
      const waMessage = `🚚 Hi ${name}, your delivery (*${waybill.trackingNumber}*) is *${stopsText}*${etaText}!\n\n` +
        `📍 Track live: ${trackUrl}\n\n` +
        `Please be ready to receive your parcel. 🙏`;
      try {
        await this.whatsapp.sendMessage(waybill.companyId, waybill.recipientPhone, waMessage);
      } catch (err: any) {
        this.logger.debug(`ETA WhatsApp auto-send failed: ${err?.message ?? err}`);
      }
    }

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
        subject: `⭐ How was your delivery? — ${waybill.trackingNumber}`,
        text: `Hi ${name}, your FlowOps delivery ${waybill.trackingNumber} is complete. Rate your experience: ${rateUrl}`,
        html: `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
              <tr><td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                  <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:28px 32px;text-align:center;">
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">⭐ Rate Your Delivery</h1>
                    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">Tracking: ${waybill.trackingNumber}</p>
                  </td></tr>
                  <tr><td style="padding:32px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:15px;color:#334155;">Hi ${name}, your delivery is complete!</p>
                    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">We'd love to hear about your experience.</p>
                    <p style="margin:0;font-size:36px;">⭐⭐⭐⭐⭐</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                      <tr><td align="center">
                        <a href="${rateUrl}" style="display:inline-block;padding:14px 32px;background:#f59e0b;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">
                          Rate Your Experience →
                        </a>
                      </td></tr>
                    </table>
                    <p style="margin-top:16px;font-size:12px;color:#94a3b8;">Takes less than 10 seconds. Your feedback helps us improve!</p>
                  </td></tr>
                  <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
                    <p style="margin:0;font-size:11px;color:#94a3b8;">Powered by FlowOps</p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </body></html>
        `,
      }).catch((e) => this.logger.warn(`Rating email failed: ${e?.message}`));
    }

    // WhatsApp auto-send rating request via Business API
    if (waybill.recipientPhone) {
      const waMessage = `⭐ Hi ${name}, your delivery (*${waybill.trackingNumber}*) is complete!\n\n` +
        `How was your experience? Rate it here (takes 10 seconds):\n${rateUrl}\n\n` +
        `Your feedback helps us deliver better every time. Thank you! 🙏`;
      try {
        await this.whatsapp.sendMessage(waybill.companyId, waybill.recipientPhone, waMessage);
      } catch (err: any) {
        this.logger.debug(`Rating WhatsApp auto-send failed: ${err?.message ?? err}`);
      }
    }

    // Log internal notification
    try {
      await this.prisma.notification.create({
        data: {
          companyId: waybill.companyId,
          title: `⭐ Rating request sent · ${waybill.trackingNumber}`,
          body: `Customer ${name} notified via ${waybill.recipientEmail ? 'email' : ''}${waybill.recipientEmail && waybill.recipientPhone ? ' + ' : ''}${waybill.recipientPhone ? 'WhatsApp' : ''}.`,
          type: 'RATING_REQUEST',
        },
      });
    } catch (e) { this.logger.warn(`notification side-effect failed: ${(e as Error)?.message}`); }
  }

  // ── Driver Dispatched notification (WhatsApp + email) ───────────────

  /**
   * Fired when a driver is assigned to a waybill. Notifies the recipient
   * that a driver is on the way with driver details + tracking link.
   * This is a PROPER logistics procedure — clients should always know
   * who is coming and when.
   */
  async notifyDriverDispatched(
    waybill: { companyId: string; trackingNumber: string; recipientName?: string | null; recipientEmail?: string | null; recipientPhone?: string | null },
    driver: { name: string; phone?: string | null; vehicleType?: string | null; vehicleReg?: string | null } | null,
  ) {
    const appUrl = this.config.get('APP_URL', 'http://localhost:8080');
    const trackUrl = `${appUrl}/track/${waybill.trackingNumber}`;
    const name = (waybill.recipientName || 'there').split(/\s+/)[0];
    const driverName = driver?.name?.split(/\s+/)[0] || 'Your driver';
    const vehicleInfo = driver?.vehicleType
      ? `${driver.vehicleType}${driver.vehicleReg ? ` (${driver.vehicleReg})` : ''}`
      : '';

    // Internal notification
    try {
      await this.prisma.notification.create({
        data: {
          companyId: waybill.companyId,
          title: `🚗 Driver dispatched · ${waybill.trackingNumber}`,
          body: `${driverName} assigned to ${waybill.trackingNumber}. Customer notified.`,
          type: 'DISPATCH',
        },
      });
    } catch (e) { this.logger.warn(`notification side-effect failed: ${(e as Error)?.message}`); }

    // WhatsApp auto-send to recipient
    if (waybill.recipientPhone) {
      const waMessage = `🚗 Hi ${name}, a driver has been assigned to your delivery!\n\n` +
        `📦 Tracking: *${waybill.trackingNumber}*\n` +
        `👤 Driver: *${driverName}*\n` +
        (vehicleInfo ? `🚐 Vehicle: ${vehicleInfo}\n` : '') +
        `\n📍 Track live: ${trackUrl}\n\n` +
        `You'll receive another message when your parcel is on its way. 🙌`;
      try {
        await this.whatsapp.sendMessage(waybill.companyId, waybill.recipientPhone, waMessage);
      } catch (err: any) {
        this.logger.debug(`Dispatch WhatsApp failed: ${err?.message ?? err}`);
      }
    }

    // Email to recipient
    if (waybill.recipientEmail) {
      await this.email.send({
        to: waybill.recipientEmail,
        subject: `🚗 Driver assigned — ${waybill.trackingNumber}`,
        text: `Hi ${name}, driver ${driverName} has been assigned to your delivery ${waybill.trackingNumber}. Track: ${trackUrl}`,
        html: `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
              <tr><td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                  <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:28px 32px;text-align:center;">
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">🚗 Driver on the way!</h1>
                    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">Tracking: ${waybill.trackingNumber}</p>
                  </td></tr>
                  <tr><td style="padding:32px;">
                    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
                      Hi ${name}, a driver has been assigned to your delivery!
                    </p>
                    <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:16px 20px;border-radius:8px;margin:20px 0;">
                      <table style="width:100%;border-collapse:collapse;">
                        <tr><td style="color:#6b7280;padding:6px 0;width:100px;">Driver</td><td style="font-weight:700;color:#1e3a5f;">${driverName}</td></tr>
                        ${vehicleInfo ? `<tr><td style="color:#6b7280;padding:6px 0;">Vehicle</td><td style="color:#374151;">${vehicleInfo}</td></tr>` : ''}
                        <tr><td style="color:#6b7280;padding:6px 0;">Tracking</td><td style="font-weight:700;color:#1e3a5f;">${waybill.trackingNumber}</td></tr>
                      </table>
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                      <tr><td align="center">
                        <a href="${trackUrl}" style="display:inline-block;padding:14px 32px;background:#10b981;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">
                          Track Your Delivery →
                        </a>
                      </td></tr>
                    </table>
                  </td></tr>
                  <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
                    <p style="margin:0;font-size:11px;color:#94a3b8;">Powered by FlowOps • <a href="${trackUrl}" style="color:#64748b;">Track online</a></p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </body></html>
        `,
      }).catch((e) => this.logger.warn(`Dispatch email failed: ${e?.message}`));
    }
  }

  // ── Collection Scheduled notification (WhatsApp + email to sender) ────

  /**
   * Notify the sender/client that their collection pickup has been scheduled.
   * Proper logistics procedure — sender should know exactly when to expect the driver.
   */
  async notifyCollectionScheduled(
    companyId: string,
    collection: {
      clientName?: string | null;
      clientPhone?: string | null;
      clientEmail?: string | null;
      pickupAddress?: string | null;
      scheduledAt?: Date | string | null;
      driverName?: string | null;
    },
  ) {
    const name = (collection.clientName || 'there').split(/\s+/)[0];
    const scheduledDate = collection.scheduledAt
      ? new Date(collection.scheduledAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
      : 'shortly';
    const driverText = collection.driverName ? `Driver: *${collection.driverName}*` : '';

    // WhatsApp auto-send to sender
    if (collection.clientPhone) {
      const waMessage = `📋 Hi ${name}, your collection has been scheduled!\n\n` +
        `📍 Pickup: ${collection.pickupAddress || 'your address'}\n` +
        `🕐 When: ${scheduledDate}\n` +
        (driverText ? `👤 ${driverText}\n` : '') +
        `\nPlease have your parcels ready for pickup. The driver will contact you when nearby. 📞`;
      try {
        await this.whatsapp.sendMessage(companyId, collection.clientPhone, waMessage);
      } catch (err: any) {
        this.logger.debug(`Collection scheduled WhatsApp failed: ${err?.message ?? err}`);
      }
    }

    // Email to sender
    if (collection.clientEmail) {
      await this.email.send({
        to: collection.clientEmail,
        subject: `📋 Collection scheduled — ${scheduledDate}`,
        text: `Hi ${name}, your collection has been scheduled for ${scheduledDate} at ${collection.pickupAddress || 'your address'}.${collection.driverName ? ` Driver: ${collection.driverName}` : ''} Please have your parcels ready.`,
        html: `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
              <tr><td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                  <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:28px 32px;text-align:center;">
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">📋 Collection Scheduled</h1>
                  </td></tr>
                  <tr><td style="padding:32px;">
                    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
                      Hi ${name}, your pickup has been scheduled!
                    </p>
                    <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;border-radius:8px;margin:20px 0;">
                      <table style="width:100%;border-collapse:collapse;">
                        <tr><td style="color:#6b7280;padding:6px 0;width:100px;">When</td><td style="font-weight:700;color:#166534;">${scheduledDate}</td></tr>
                        <tr><td style="color:#6b7280;padding:6px 0;">Pickup at</td><td style="color:#374151;">${collection.pickupAddress || 'your address'}</td></tr>
                        ${collection.driverName ? `<tr><td style="color:#6b7280;padding:6px 0;">Driver</td><td style="font-weight:700;color:#1e3a5f;">${collection.driverName}</td></tr>` : ''}
                      </table>
                    </div>
                    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;background:#fefce8;padding:12px 16px;border-radius:8px;">
                      💡 <strong>Please have your parcels packed and ready.</strong> The driver will contact you when they are nearby.
                    </p>
                  </td></tr>
                  <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
                    <p style="margin:0;font-size:11px;color:#94a3b8;">Powered by FlowOps • Logistics operations platform</p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </body></html>
        `,
      }).catch((e) => this.logger.warn(`Collection scheduled email failed: ${e?.message}`));
    }

    // Internal notification
    try {
      await this.prisma.notification.create({
        data: {
          companyId,
          title: `📋 Collection scheduled · ${name}`,
          body: `${collection.pickupAddress || 'Address'} — ${scheduledDate}. Customer notified via WhatsApp + email.`,
          type: 'COLLECTION_SCHEDULED',
        },
      });
    } catch (e) { this.logger.warn(`notification side-effect failed: ${(e as Error)?.message}`); }
  }

  // ── Returns (RMA) status notifications ───────────────────────────────

  private static readonly RETURN_STATUS_COPY: Record<
    string,
    { title: string; line: string }
  > = {
    APPROVED: { title: 'Return approved', line: 'has been approved — we will arrange collection' },
    REJECTED: { title: 'Return declined', line: 'could not be approved. Please contact support if you have questions' },
    SCHEDULED: { title: 'Collection scheduled', line: 'is scheduled for collection' },
    IN_TRANSIT: { title: 'Return collected', line: 'has been collected and is on its way back to us' },
    RECEIVED: { title: 'Return received', line: 'has arrived at our facility and is being processed' },
    COMPLETED: { title: 'Return completed', line: 'has been completed' },
    CANCELLED: { title: 'Return cancelled', line: 'has been cancelled' },
  };

  /**
   * Fired when a return (RMA) transitions. Logs an internal tenant
   * notification (surfaced in the staff bell) and — when a customer email is
   * on file — emails the customer a branded update. Best-effort: a failure
   * here never blocks the RMA transition itself.
   */
  async notifyReturnStatus(ret: {
    companyId: string;
    rmaNumber: string;
    trackingNumber?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    status: string;
    resolution?: string | null;
    refundAmount?: number | null;
  }) {
    const copy = NotificationsService.RETURN_STATUS_COPY[ret.status];
    if (!copy) return; // not a customer-facing transition

    const ref = ret.rmaNumber || ret.trackingNumber || 'your return';
    const name = (ret.customerName || 'there').split(/\s+/)[0];

    const refundLine =
      ret.status === 'COMPLETED' && ret.refundAmount && ret.refundAmount > 0
        ? ` A refund of R${ret.refundAmount.toFixed(2)} is being processed.`
        : '';

    // Webhook event for tenant integrations — via the transactional outbox.
    void this.outbox.enqueue(this.prisma, ret.companyId, 'return.status_changed', {
      rmaNumber: ret.rmaNumber,
      trackingNumber: ret.trackingNumber,
      status: ret.status,
      resolution: ret.resolution ?? null,
    });

    // 1) Internal tenant notification (staff bell).
    try {
      await this.prisma.notification.create({
        data: {
          companyId: ret.companyId,
          title: `${copy.title} · ${ref}`,
          body: `Return ${ref} ${copy.line}.${refundLine}`,
          type: 'RETURN_UPDATE',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to log return notification: ${err?.message ?? err}`);
    }

    // 2) Customer email (best-effort).
    if (ret.customerEmail) {
      await this.email
        .send({
          to: ret.customerEmail,
          subject: `${copy.title} — ${ref}`,
          text: `Hi ${name}, your return ${ref} ${copy.line}.${refundLine}`,
          html: `
            <!DOCTYPE html>
            <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
                <tr><td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                    <tr><td style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:28px 32px;text-align:center;">
                      <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">↩️ ${copy.title}</h1>
                      <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">Reference: ${ref}</p>
                    </td></tr>
                    <tr><td style="padding:32px;">
                      <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.6;">
                        Hi ${name}, your return <strong>${ref}</strong> ${copy.line}.${refundLine}
                      </p>
                    </td></tr>
                    <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
                      <p style="margin:0;font-size:11px;color:#94a3b8;">Powered by FlowOps</p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
          `,
        })
        .catch((err) => this.logger.warn(`Return status email failed: ${err?.message ?? err}`));
    }

    // 3) WhatsApp auto-send to customer (Business API)
    if (ret.customerPhone) {
      const waMessage = `↩️ Hi ${name}, your return (*${ref}*) ${copy.line}.${refundLine}\n\n` +
        `Questions? Reply to this message and we'll help. 🤝`;
      try {
        await this.whatsapp.sendMessage(ret.companyId, ret.customerPhone, waMessage);
      } catch (err: any) {
        this.logger.debug(`Return WhatsApp auto-send failed: ${err?.message ?? err}`);
      }
    }
  }

}
