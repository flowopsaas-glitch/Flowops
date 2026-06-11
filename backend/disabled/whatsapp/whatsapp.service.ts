import { Injectable } from '@nestjs/common';

@Injectable()
export class WhatsappService {
  async handleIncomingWebhook(body: any): Promise<{ received: boolean; payload: any }> {
    return { received: true, payload: body };
  }

  async sendDriverAssignment(
    driverPhone: string,
    collectionId: number,
    pickupAddress: string,
  ): Promise<{ success: boolean }> {
    // Placeholder – integrate WhatsApp API later
    console.log('📲 Sending WhatsApp message');
    console.log('Driver:', driverPhone);
    console.log('Collection ID:', collectionId);
    console.log('Pickup Address:', pickupAddress);

    return { success: true };
  }
}
