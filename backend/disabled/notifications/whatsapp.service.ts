import { Injectable } from '@nestjs/common';

@Injectable()
export class WhatsappService {
  // Add your WhatsApp integration logic here

  async sendDriverAssignedNotification(driverId: string, collectionId: string): Promise<void> {
    // Implement WhatsApp notification logic here
    // For example, send a message to the driver about their new assignment
    console.log(`Notify driver ${driverId} about collection ${collectionId}`);
    // ...actual WhatsApp API call...
  }
}