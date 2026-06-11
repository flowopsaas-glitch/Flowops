// backend/src/shipments/shipments.controller.ts
import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get(':id')
  async getShipment(@Param('id') id: number) {
    return this.shipmentsService.getShipmentById(id);
  }

  @Post()
  async createShipment(@Body() data: any) {
    return this.shipmentsService.createShipment(data);
  }
}
