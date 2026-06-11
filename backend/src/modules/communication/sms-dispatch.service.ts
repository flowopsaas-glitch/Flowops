import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SmsDispatchService {
  private readonly logger = new Logger(SmsDispatchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 📤 Dispatches localized automated SMS text alerts directly to South African driver mobile lines
   */
  async sendDriverPayloadAssignment(driverId: number, waybillNumber: string) {
    this.logger.log(`📱 Triggering automated SMS dispatch pass for Driver ID: ${driverId}`);

    try {
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId },
        include: { company: true },
      });

      if (!driver || !driver.phone) {
        this.logger.error(`❌ Driver profile or mobile contact number reference missing.`);
        return { success: false };
      }

      const { twilioSid, twilioToken, twilioPhone } = driver.company;

      const standardizedMobile = driver.phone.replace(/^0/, '+27');
      const smsMessageBody = `FlowOps Alert: Hi ${driver.name}, waybill tracking reference ${waybillNumber} has been assigned to your active cargo manifest. Proceed safely to the distribution hub.`;

      // Check if credentials are stubs or missing to enforce safe development simulation fallback
      if (!twilioSid || !twilioToken || twilioSid.includes('your_') || twilioSid === '') {
        this.logger.warn(`⚠️ Twilio API tokens matching configuration stubs.`);
        this.logger.log(`📟 [SIMULATED SMS OUTBOUND TO ${standardizedMobile}] -> "${smsMessageBody}"`); // 🚀 FIXED: Changed from .info to .log
        return { success: true, trackingMode: 'SIMULATED' };
      }

      // Dynamic package evaluation wrapper to clear hard compile dependency checks
      const ObjectFromTwilio = require('twilio');
      const client = ObjectFromTwilio(twilioSid, twilioToken);

      const twilioResponse = await client.messages.create({
        body: smsMessageBody,
        from: twilioPhone || '',
        to: standardizedMobile,
      });

      this.logger.log(`✅ Outbound SMS delivery handshake completed cleanly via Twilio API. Message SID: ${twilioResponse.sid}`);
      return { success: true, twilioSid: twilioResponse.sid };

    } catch (error: any) {
      this.logger.error(`❌ SMS engine communication pipeline breakdown: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

