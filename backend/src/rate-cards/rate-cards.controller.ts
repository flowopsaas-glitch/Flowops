import { Body, Controller, Delete, Get, Param, Patch, Post, Logger } from '@nestjs/common';
import { RateCardsService } from './rate-cards.service';

@Controller('v2/rate-cards')
export class RateCardsController {
  constructor(private readonly service: RateCardsService) {}

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Post()
  async create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
