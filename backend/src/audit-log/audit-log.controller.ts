import { Controller, Get, Query, Req, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditLogService } from './audit-log.service';

@Controller('audit-log')
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  /** GET /api/v1/audit-log — Paginated audit log for current company */
  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN')
  async getLogs(
    @Req() req: any,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const companyId = Number(req.user?.companyId || 1);
    return this.auditLog.getLogs(companyId, {
      entityType,
      action,
      userId: userId ? Number(userId) : undefined,
      limit,
      offset,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  /** GET /api/v1/audit-log/stats — Summary stats */
  @Get('stats')
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN')
  async getStats(@Req() req: any) {
    const companyId = Number(req.user?.companyId || 1);
    return this.auditLog.getStats(companyId);
  }
}
