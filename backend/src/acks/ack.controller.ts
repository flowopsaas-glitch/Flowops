// src/acks/ack.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { AckService } from './ack.service';

@Controller('acks') // ✅ NO "api/"
export class AckController {
  constructor(private readonly ackService: AckService) {}

  @Get('collection/:collectionId')
  listByCollection(@Param('collectionId') collectionId: string) {
    return this.ackService.listForCollection(Number(collectionId));
  }
}