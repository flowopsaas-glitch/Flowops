import { Injectable } from '@nestjs/common';
import { AckService } from './ack.service';

@Injectable()
export class AckListener {
  constructor(private readonly ackService: AckService) {}

  // Example method simulating event listener
  async handleCollectionAcknowledgement(collectionId: string, userId: string) {
    await this.ackService.acknowledgeCollection(collectionId, userId);
  }
}
