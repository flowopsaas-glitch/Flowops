// File: src/whatsapp/ack.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { WhatsappAckService } from './ack.service';

@Controller('whatsapp')
export class WhatsappAckController {
  constructor(private readonly service: WhatsappAckService) {}

  @Get('user/:id')
  async getUser(@Param('id') id: string) {
    return this.service.getUserById(id);
  }
}
