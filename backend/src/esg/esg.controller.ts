import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EsgService } from './esg.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('ESG / Carbon Reporting')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.VIEWER)
@Controller('esg')
export class EsgController {
  constructor(private readonly svc: EsgService) {}

  /** GET /esg/report — current period carbon report */
  @Get('report')
  getReport(@CurrentUser() u: any, @Query('period') period?: string) {
    return this.svc.getReport(u.companyId, period);
  }

  /** GET /esg/trends — last 6 months carbon trend */
  @Get('trends')
  getTrends(@CurrentUser() u: any) {
    return this.svc.getTrends(u.companyId);
  }

  /** POST /esg/refresh — force-recompute current period */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post('refresh')
  refresh(@CurrentUser() u: any) {
    return this.svc.computeForCompany(u.companyId);
  }
}
