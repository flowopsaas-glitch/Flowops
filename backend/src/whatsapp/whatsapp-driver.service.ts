import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';

@Injectable()
export class WhatsAppDriverService {
  private readonly logger = new Logger('WhatsAppDriverService');

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
  ) {}

  /**
   * Handle incoming message from driver
   */
  async handleDriverMessage(phone: string, message: string, companyId: number) {
    this.logger.log(`📱 Driver message from ${phone}: ${message}`);

    // Find driver by phone
    const driver = await this.prisma.driver.findFirst({
      where: { phone, companyId },
    });

    if (!driver) {
      await this.whatsapp.sendMessage(
        phone,
        `❌ Phone number ${phone} not registered as a driver. Contact dispatch.`,
        companyId,
      );
      return;
    }

    // Parse command
    const text = message.trim().toUpperCase();

    // Command: HELP
    if (text === 'HELP' || text === 'COMMANDS') {
      await this.sendHelpMenu(phone, companyId);
      return;
    }

    // Command: COLLECTED WB-XXX
    if (text.startsWith('COLLECTED')) {
      await this.handleCollected(driver, text, companyId);
      return;
    }

    // Command: DELIVERED WB-XXX
    if (text.startsWith('DELIVERED')) {
      await this.handleDelivered(driver, text, companyId);
      return;
    }

    // Command: LOCATION
    if (text === 'LOCATION' || text === 'GPS') {
      await this.handleLocationRequest(driver, companyId);
      return;
    }

    // Command: MY DELIVERIES
    if (text === 'DELIVERIES' || text === 'MY DELIVERIES') {
      await this.sendMyDeliveries(driver, companyId);
      return;
    }

    // Command: STATUS WB-XXX
    if (text.startsWith('STATUS')) {
      await this.handleStatusCheck(driver, text, companyId);
      return;
    }

    // Unknown command
    await this.whatsapp.sendMessage(
      phone,
      `❓ Unknown command. Send "HELP" to see available commands.`,
      companyId,
    );
  }

  /**
   * Send help menu
   */
  private async sendHelpMenu(phone: string, companyId: number) {
    const helpText = `
🚛 *FlowOps Driver Commands*

*COLLECTED WB-XXX* - Mark waybill as collected
*DELIVERED WB-XXX* - Mark waybill as delivered
*LOCATION* - Share your current location
*DELIVERIES* - View your assigned deliveries
*STATUS WB-XXX* - Check waybill status
*HELP* - Show this menu

Example: "COLLECTED WB-TEST-001"
    `.trim();

    await this.whatsapp.sendMessage(phone, helpText, companyId);
  }

  /**
   * Handle "COLLECTED WB-XXX" command
   */
  private async handleCollected(driver: any, text: string, companyId: number) {
    const waybillNumber = this.extractWaybillNumber(text);
    
    if (!waybillNumber) {
      await this.whatsapp.sendMessage(
        driver.phone,
        `❌ Please specify waybill number. Example: "COLLECTED WB-TEST-001"`,
        companyId,
      );
      return;
    }

    const waybill = await this.prisma.waybill.findFirst({
      where: { waybillNumber, companyId },
    });

    if (!waybill) {
      await this.whatsapp.sendMessage(
        driver.phone,
        `❌ Waybill ${waybillNumber} not found.`,
        companyId,
      );
      return;
    }

    // Update waybill status
    await this.prisma.waybill.update({
      where: { id: waybill.id },
      data: { 
        status: 'IN_TRANSIT',
        driverId: driver.id,
      },
    });

    // Log communication
    await this.prisma.communication.create({
      data: {
        companyId,
        waybillId: waybill.id,
        source: 'WHATSAPP',
        direction: 'INBOUND',
        content: `Driver ${driver.name} collected waybill ${waybillNumber}`,
        phoneNumber: driver.phone,
        status: 'SENT',
      },
    });

    await this.whatsapp.sendMessage(
      driver.phone,
      `✅ Waybill *${waybillNumber}* marked as COLLECTED!\n\n📍 Destination: ${waybill.destination}\n👤 Receiver: ${waybill.receiverName || 'N/A'}`,
      companyId,
    );

    this.logger.log(`✅ Driver ${driver.name} collected waybill ${waybillNumber}`);
  }

  /**
   * Handle "DELIVERED WB-XXX" command
   */
  private async handleDelivered(driver: any, text: string, companyId: number) {
    const waybillNumber = this.extractWaybillNumber(text);
    
    if (!waybillNumber) {
      await this.whatsapp.sendMessage(
        driver.phone,
        `❌ Please specify waybill number. Example: "DELIVERED WB-TEST-001"`,
        companyId,
      );
      return;
    }

    const waybill = await this.prisma.waybill.findFirst({
      where: { waybillNumber, companyId },
    });

    if (!waybill) {
      await this.whatsapp.sendMessage(
        driver.phone,
        `❌ Waybill ${waybillNumber} not found.`,
        companyId,
      );
      return;
    }

    // Update waybill status
    await this.prisma.waybill.update({
      where: { id: waybill.id },
      data: { 
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });

    // Create POD record
    await this.prisma.proofOfDelivery.create({
      data: {
        waybillId: waybill.id,
        driverId: driver.id,
        source: 'WHATSAPP',
        notes: `Delivered via WhatsApp command`,
      },
    });

    // Log communication
    await this.prisma.communication.create({
      data: {
        companyId,
        waybillId: waybill.id,
        source: 'WHATSAPP',
        direction: 'INBOUND',
        content: `Driver ${driver.name} delivered waybill ${waybillNumber}`,
        phoneNumber: driver.phone,
        status: 'SENT',
      },
    });

    await this.whatsapp.sendMessage(
      driver.phone,
      `✅ Waybill *${waybillNumber}* marked as DELIVERED!\n\n📸 Please send a photo of the delivered parcel for POD.`,
      companyId,
    );

    this.logger.log(`✅ Driver ${driver.name} delivered waybill ${waybillNumber}`);
  }

  /**
   * Handle "LOCATION" command
   */
  private async handleLocationRequest(driver: any, companyId: number) {
    await this.whatsapp.sendMessage(
      driver.phone,
      `📍 Please share your location using WhatsApp's location feature.\n\nOr visit: https://driver.flowop.work to enable GPS tracking.`,
      companyId,
    );
  }

  /**
   * Handle "DELIVERIES" command
   */
  private async sendMyDeliveries(driver: any, companyId: number) {
    const waybills = await this.prisma.waybill.findMany({
      where: { 
        OR: [
          { driverId: driver.id },
          { status: 'PENDING', companyId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (waybills.length === 0) {
      await this.whatsapp.sendMessage(
        driver.phone,
        `📭 You have no assigned deliveries.`,
        companyId,
      );
      return;
    }

    let message = `🚛 *Your Deliveries*\n\n`;
    waybills.forEach((wb, idx) => {
      message += `${idx + 1}. *${wb.waybillNumber}*\n`;
      message += `   Status: ${wb.status}\n`;
      message += `   To: ${wb.receiverName || 'N/A'}\n`;
      message += `   Dest: ${wb.destination || 'N/A'}\n\n`;
    });

    await this.whatsapp.sendMessage(driver.phone, message, companyId);
  }

  /**
   * Handle "STATUS WB-XXX" command
   */
  private async handleStatusCheck(driver: any, text: string, companyId: number) {
    const waybillNumber = this.extractWaybillNumber(text);
    
    if (!waybillNumber) {
      await this.whatsapp.sendMessage(
        driver.phone,
        `❌ Please specify waybill number. Example: "STATUS WB-TEST-001"`,
        companyId,
      );
      return;
    }

    const waybill = await this.prisma.waybill.findFirst({
      where: { waybillNumber, companyId },
    });

    if (!waybill) {
      await this.whatsapp.sendMessage(
        driver.phone,
        `❌ Waybill ${waybillNumber} not found.`,
        companyId,
      );
      return;
    }

    const statusMessage = `
📦 *Waybill Status*

*Number:* ${waybill.waybillNumber}
*Status:* ${waybill.status}
*Origin:* ${waybill.origin || 'N/A'}
*Destination:* ${waybill.destination || 'N/A'}
*Receiver:* ${waybill.receiverName || 'N/A'}
*Phone:* ${waybill.receiverPhone || 'N/A'}
    `.trim();

    await this.whatsapp.sendMessage(driver.phone, statusMessage, companyId);
  }

  /**
   * Extract waybill number from command text
   */
  private extractWaybillNumber(text: string): string | null {
    const match = text.match(/WB[-\s]?[A-Z0-9]+/i);
    return match ? match[0].toUpperCase() : null;
  }

  /**
   * Send dispatch notification to driver
   */
  async sendDispatchNotification(driverPhone: string, waybillNumber: string, destination: string, companyId: number) {
    const message = `
🚀 *New Dispatch Assignment*

*Waybill:* ${waybillNumber}
*Destination:* ${destination}

Reply "COLLECTED ${waybillNumber}" when you pick up the parcel.
Reply "HELP" to see all commands.
    `.trim();

    await this.whatsapp.sendMessage(driverPhone, message, companyId);
  }
}
