// File: src/drivers/drivers.controller.ts
import { Controller, Get, Param, Patch, Body } from '@nestjs/common';
import { DriversService } from './drivers.service';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  async getAllDrivers() {
    return this.driversService.getAllDrivers();
  }

  @Get(':id')
  async getDriverById(@Param('id') id: string) {
    return this.driversService.getDriverById(id);
  }

  @Patch(':id')
  async updateDriver(
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    return this.driversService.updateDriver(id, body);
  }
}
