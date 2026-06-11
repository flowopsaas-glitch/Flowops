import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('drivers')
@UseGuards(JwtAuthGuard) // 🚀 This ensures req.user.companyId exists
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  async getDrivers(@Req() req: any) {
    const companyId = Number(req.user?.companyId);
    return this.driversService.findAll(companyId);
  }

  @Post()
  async createDriver(@Req() req: any, @Body() data: any) {
    const companyId = Number(req.user?.companyId);
    return this.driversService.create(companyId, data);
  }

  @Patch(':id')
  async updateDriver(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: any,
  ) {
    return this.driversService.update(id, data);
  }

  @Delete(':id')
  async deleteDriver(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const companyId = Number(req.user?.companyId);
    return this.driversService.remove(id, companyId);
  }
}
