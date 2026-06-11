import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HardwareService } from './hardware.service';

@UseGuards(JwtAuthGuard)
@Controller('v2/hardware')
export class HardwareController {
  constructor(private readonly hardwareService: HardwareService) {}

  @Get()
  async getHardware(@Request() req: any) {
    return this.hardwareService.listTenantHardware(req.user.companyId);
  }

  @Post('auto-register')
  async register(@Request() req: any, @Body() data: any) {
    return this.hardwareService.autoRegisterDevice(req.user.companyId, data);
  }
}
