import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditTrailService } from './audit-trail.service';
import { TrailQueryDto, TrailSummaryQueryDto } from './dto/trail-query.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { TrailKind } from './audit-trail.types';

/**
 * The tenant audit trail — the endpoint behind the three nav entries that were
 * calling `/api/v1/audit/transactions` against nothing.
 *
 * Read scope, and why it is not "everyone": the records carry actor names,
 * delivery locations and timestamps, which together are a movement history of a
 * company's freight and staff. DISPATCH and WAREHOUSE are included because they
 * are the roles that actually need it — a dispatcher proving a driver was at the
 * gate, a warehouse clerk proving a scan happened.
 *
 * There is no write endpoint, deliberately. An audit trail that the application
 * can amend is not an audit trail.
 */
@ApiTags('Audit Trail')
@ApiBearerAuth()
@Roles(
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
  UserRole.WAREHOUSE,
)
@Controller('audit')
export class AuditController {
  constructor(private readonly trail: AuditTrailService) {}

  @Get('trail')
  @ApiOperation({ summary: 'Tenant activity trail, newest first (keyset paginated)' })
  list(@CurrentUser() u: any, @Query() query: TrailQueryDto) {
    // `u.companyId` comes from the verified JWT — never from the request. The
    // service treats it as the only tenancy boundary in every query it builds.
    return this.trail.list(u.companyId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Counts over a window: by source, by actor type, distinct entities touched' })
  summary(@CurrentUser() u: any, @Query() query: TrailSummaryQueryDto) {
    return this.trail.summary(u.companyId, query.days);
  }

  /**
   * Full history for one entity, oldest first, with `fromStatus` filled in.
   *
   * Declared after the two static routes above so a literal path can never be
   * swallowed by the parameterised one.
   */
  @Get('trail/:kind/:entityId')
  @ApiOperation({ summary: 'Complete event history for one waybill or rail consignment' })
  history(
    @CurrentUser() u: any,
    @Param('kind') kind: TrailKind,
    @Param('entityId') entityId: string,
  ) {
    return this.trail.history(u.companyId, kind, entityId);
  }
}
