import { Controller, Get, Patch, Body, Param, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // Adjust path to your guard

@Controller('drivers')
@UseGuards(JwtAuthGuard) // 🚀 This ensures req.user.companyId exists
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  async getDrivers(@Req() req: any) {
    // Extracts companyId from the logged-in admin's token
    const companyId = Number(req.user?.companyId);
    return this.driversService.findAll(companyId);
  }

  @Patch(':id')
  async updateDriver(
    @Param('id', ParseIntPipe) id: number, 
    @Body() data: any
  ) {
    return this.driversService.update(id, data);
  }
}
