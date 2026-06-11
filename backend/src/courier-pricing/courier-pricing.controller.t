import { Controller, Get, Post, Delete } from '@nestjs/common';
import { CourierPricingService } from './courier-pricing.service';

@Controller('courier-pricing')
export class CourierPricingController {
  constructor(private readonly service: CourierPricingService) {}

  @Post()
  create() {
    return this.service.create();
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Delete()
  clear() {
    return this.service.clear();
  }
}
