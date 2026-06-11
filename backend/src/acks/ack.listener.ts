// src/acks/ack.listener.ts
import { Injectable } from '@nestjs/common';
import { AckService } from './ack.service';

@Injectable()
export class AckListener {
  constructor(private readonly ackService: AckService) {}

  async handleAck(payload: { userId: number; collectionId: number }) {
    const { userId, collectionId } = payload;
    return this.ackService.acknowledge(userId, collectionId);
  }
}