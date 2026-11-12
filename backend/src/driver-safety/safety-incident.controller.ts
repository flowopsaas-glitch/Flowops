import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SafetyIncidentService } from './safety-incident.service';
import { ReportIncidentDto } from './dto/incident-document.dto';
import { VerdictDto } from './dto/verdict.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

const REVIEW_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.WAREHOUSE,
];

const REPORT_ROLES = [...REVIEW_ROLES, UserRole.DRIVER];

@ApiTags('Safety Incidents')
@ApiBearerAuth()
@Controller('safety-incidents')
export class SafetyIncidentController {
  constructor(private readonly svc: SafetyIncidentService) {}

  @Roles(...REPORT_ROLES)
  @Post()
  @ApiOperation({ summary: 'Report a safety incident in the field' })
  report(@CurrentUser() u: any, @Body() dto: ReportIncidentDto) {
    return this.svc.report(u.companyId, dto, u);
  }

  @Roles(...REVIEW_ROLES)
  @Get()
  @ApiOperation({ summary: 'Incidents for review, newest first' })
  list(@CurrentUser() u: any, @Query('status') status?: string) {
    return this.svc.list(u.companyId, status);
  }

  @Roles(...REVIEW_ROLES)
  @Patch(':id/verdict')
  @ApiOperation({ summary: 'Verify or reject a reported incident' })
  decide(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Body() body: VerdictDto,
  ) {
    if (!body?.verdict || !['VERIFIED', 'REJECTED'].includes(body.verdict)) {
      throw new BadRequestException('verdict must be VERIFIED or REJECTED');
    }
    return this.svc.decide(u.companyId, id, body.verdict as 'VERIFIED' | 'REJECTED', body.reason, u);
  }
}
