import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SlackAlertService {
  private readonly logger = new Logger(SlackAlertService.name);

  /**
   * Dispatches automated Slack notification blocks when transit exceptions trigger
   */
  async sendTransitExceptionAlert(waybillNumber: string, reason: string, driverName: string) {
    const webhookUrl = process.env.SLACK_DEVOPS_WEBHOOK_URL;
    if (!webhookUrl || webhookUrl === 'slack.com') {
      this.logger.warn('⚠️ Slack webhook url unconfigured or matching stub template. Skipping send.');
      return;
    }

    const slackPayload = {
      text: `🚨 *CRITICAL LOGISTICS ANOMALY DETECTED* 🚨`,
      attachments: [
        {
          color: '#ef4444',
          fields: [
            { title: 'Waybill Reference', value: waybillNumber, short: true },
            { title: 'Assigned Courier', value: driverName, short: true },
            { title: 'Incident Diagnostic Summary', value: reason, short: false },
          ],
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    try {
      await axios.post(`https://${webhookUrl}`, slackPayload);
      this.logger.log(`📟 Slack exception alert dispatched safely for ${waybillNumber}.`);
    } catch (error: any) {
      this.logger.error(`❌ Slack alert transmission failure: ${error.message}`);
    }
  }
}

