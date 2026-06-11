import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SupervisorService } from './supervisor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('si-ops/supervisor')
@UseGuards(JwtAuthGuard)
export class SupervisorController {
  constructor(private readonly supervisorService: SupervisorService) {}

  @Get('overview')
  async getOverview(@Req() req: any) {
    return this.supervisorService.getOverview(req.user.companyId);
  }

  @Get('risks')
  async getRisks(@Req() req: any) {
    return this.supervisorService.getRiskAnalysis(req.user.companyId);
  }
}
