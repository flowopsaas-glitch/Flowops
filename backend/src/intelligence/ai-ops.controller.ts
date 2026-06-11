import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AiOpsService } from './ai-ops.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ai-ops')
export class AiOpsController {
  constructor(private readonly aiOpsService: AiOpsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('supervisor/overview')
  async getOverview(@Request() req: any) {
    const companyId = Number(req.user.companyId);
    return this.aiOpsService.getSupervisorOverview(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('assist')
  async triggerRepair(@Body() body: { repairId: string }, @Request() req: any) {
    const companyId = Number(req.user.companyId);
    return this.aiOpsService.executeRepair(body.repairId, companyId);
  }
}
