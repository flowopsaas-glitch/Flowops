import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AutopilotService } from './autopilot.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Autopilot')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
@RequireFeature('clawAutopilot')
@Controller('autopilot')
export class AutopilotController {
  constructor(private readonly autopilot: AutopilotService) {}

  /** Enable/disable + aggression, plus whether the plan includes the feature. */
  @Get('config')
  @ApiOperation({ summary: 'Get CLAW Autopilot config + entitlement' })
  getConfig(@CurrentUser() u: any) {
    return this.autopilot.getConfig(u.companyId);
  }

  @Put('config')
  @ApiOperation({ summary: 'Update Autopilot config (Enterprise)' })
  setConfig(@CurrentUser() u: any, @Body() dto: { enabled?: boolean; aggression?: string | null }) {
    return this.autopilot.setConfig(u.companyId, dto ?? {});
  }

  /** Read-only scan — every operational signal right now. */
  @Get('signals')
  @ApiOperation({ summary: 'Detect operational signals (no actions taken)' })
  signals(@CurrentUser() u: any) {
    return this.autopilot.detectSignals(u.companyId);
  }

  /** Detect + auto-execute eligible signals. */
  @Post('run')
  @ApiOperation({ summary: 'Run Autopilot — detect and auto-execute safe actions' })
  run(@CurrentUser() u: any, @Body() body: { auto?: boolean }) {
    return this.autopilot.run(u.companyId, body?.auto ?? true);
  }

  /** Recent autopilot activity. */
  @Get('log')
  @ApiOperation({ summary: 'Recent Autopilot activity log' })
  log(@CurrentUser() u: any, @Query('limit') limit?: string) {
    return this.autopilot.getLog(u.companyId, limit ? parseInt(limit, 10) : 50);
  }
}
