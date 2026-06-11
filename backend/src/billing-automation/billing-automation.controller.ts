import { Controller, Post, Param, ParseIntPipe, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AutoSweepService } from './auto-sweep.service';

@Controller('billing-automation')
@UseGuards(JwtAuthGuard)
export class BillingAutomationController {
  constructor(private readonly autoSweep: AutoSweepService) {}

  @Post('sweep')
  async triggerSweep(@Request() req: any) {
    const companyId = req.user.companyId;
    return this.autoSweep.triggerSweep(companyId);
  }
}
