import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

/**
 * SLA Breach Alert Engine — runs every 10 minutes.
 * Checks in-transit deliveries against company SLA thresholds and fires
 * WhatsApp + email alerts when a delivery is about to breach or has breached.
 */
@Injectable()
export class SlaAlertsService {
  private readonly logger = new Logger(SlaAlertsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private whatsapp: WhatsAppService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  @Cron('*/10 * * * *') // Every 10 minutes
  async checkSlaBreaches() {
    try {
      await this.evaluate();
    } catch (err) {
      this.logger.warn(`SLA breach check failed: ${err}`);
    }
  }

  async evaluate() {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slaWarningMinutes: true, slaBreachMinutes: true, slaEscalateMinutes: true, whatsappNumber: true, email: true },
    });

    let totalWarnings = 0;
    let totalBreaches = 0;

    for (const company of companies) {
      const now = Date.now();
      const warningThreshold = now - (company.slaWarningMinutes * 60_000);

      // Find waybills at risk
      const atRiskWaybills = await this.prisma.waybill.findMany({
        where: {
          companyId: company.id,
          status: { in: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'COLLECTED'] },
          updatedAt: { lt: new Date(warningThreshold) },
        },
        select: {
          id: true, trackingNumber: true, recipientName: true,
          recipientPhone: true, recipientEmail: true,
          status: true, updatedAt: true, riskLevel: true,
        },
        take: 100,
      });

      if (atRiskWaybills.length === 0) continue;

      // BATCH DEDUP: Fetch ALL today's SLA notifications for this company in ONE query
      const today = new Date().toISOString().slice(0, 10);
      const existingAlerts = await this.prisma.notification.findMany({
        where: {
          companyId: company.id,
          type: { in: ['SLA_BREACH', 'SLA_WARNING'] },
          createdAt: { gte: new Date(today) },
        },
        select: { title: true },
      });
      const alertedTrackingNumbers = new Set(
        existingAlerts.map(n => {
          const match = n.title.match(/·\s(.+)$/);
          return match ? match[1].trim() : '';
        }).filter(Boolean),
      );

      for (const waybill of atRiskWaybills) {
        const ageMinutes = Math.round((now - new Date(waybill.updatedAt).getTime()) / 60_000);
        const isBreached = ageMinutes >= company.slaBreachMinutes;
        const isWarning = !isBreached && ageMinutes >= company.slaWarningMinutes;

        if (!isWarning && !isBreached) continue;

        // In-memory dedup check (no DB query per waybill)
        if (alertedTrackingNumbers.has(waybill.trackingNumber)) continue;

        const alertType = isBreached ? 'SLA_BREACH' : 'SLA_WARNING';

        // Update waybill risk level
        const newRiskLevel = isBreached ? 'CRITICAL' : 'HIGH';
        if (waybill.riskLevel !== newRiskLevel) {
          await this.prisma.waybill.update({
            where: { id: waybill.id },
            data: { riskLevel: newRiskLevel, riskNotes: `SLA ${isBreached ? 'BREACHED' : 'WARNING'} — ${ageMinutes} min since last status update` },
          });
        }

        // Create internal notification
        const title = isBreached
          ? `🚨 SLA BREACH · ${waybill.trackingNumber}`
          : `⚠️ SLA Warning · ${waybill.trackingNumber}`;
        const body = `${waybill.trackingNumber} → ${waybill.recipientName} has been in ${waybill.status} for ${ageMinutes} min (threshold: ${isBreached ? company.slaBreachMinutes : company.slaWarningMinutes} min).`;

        await this.prisma.notification.create({
          data: { companyId: company.id, title, body, type: alertType },
        });

        // Send WhatsApp alert to company
        if (company.whatsappNumber && isBreached) {
          try {
            await this.whatsapp.sendMessage(
              company.id,
              company.whatsappNumber,
              `🚨 SLA BREACH: ${waybill.trackingNumber} → ${waybill.recipientName} has been in "${waybill.status}" for ${ageMinutes} min. Immediate action required.`,
            );
          } catch (e) {
            this.logger.warn(`WhatsApp SLA alert failed for ${company.name}: ${e}`);
          }
        }

        // Send email alert to company
        if (company.email) {
          const appUrl = this.config.get('APP_URL', 'http://localhost:8080');
          await this.email.send({
            to: company.email,
            subject: title,
            text: body,
            html: `
              <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto">
                <div style="background:${isBreached ? '#ef4444' : '#f59e0b'};color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
                  <h2 style="margin:0;font-size:16px">${title}</h2>
                </div>
                <div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 12px 12px">
                  <p style="margin:0 0 12px">${body}</p>
                  <p style="margin:0 0 8px"><strong>Tracking:</strong> ${waybill.trackingNumber}</p>
                  <p style="margin:0 0 8px"><strong>Recipient:</strong> ${waybill.recipientName}</p>
                  <p style="margin:0 0 16px"><strong>Age:</strong> ${ageMinutes} minutes</p>
                  <a href="${appUrl}/waybills" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">View in FlowOps</a>
                </div>
              </div>
            `,
          }).catch((e) => this.logger.warn(`Email SLA alert failed: ${e}`));
        }

        if (isBreached) totalBreaches++;
        else totalWarnings++;
      }
    }

    if (totalWarnings + totalBreaches > 0) {
      this.logger.log(`SLA check: ${totalWarnings} warnings, ${totalBreaches} breaches`);
    }
    return { warnings: totalWarnings, breaches: totalBreaches };
  }
}
