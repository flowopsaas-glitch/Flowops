import { Injectable } from '@nestjs/common';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly whatsappService: WhatsappService,
  ) {}

  async notifyDriverAssignment(
    driverPhone: string,
    collectionId: number,
    pickupAddress: string,
  ) {
    return this.whatsappService.sendDriverAssignment(
      driverPhone,
      collectionId,
      pickupAddress,
    );
  }
}
