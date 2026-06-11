import { Body, Controller, Get, Post } from '@nestjs/common';
import { CouriersService } from './couriers.service';

@Controller('couriers')
export class CouriersController {
  constructor(private readonly service: CouriersService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.create(body.name, body.phone);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
