import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BorderDwellService } from './border-dwell.service';
import { IngestFixDto, ListSessionsQueryDto } from './dto/border-dwell.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * Border dwell — the writer and reader the model has been missing.
 *
 * `BorderDwellSession` existed, was read by trip-leg derivation, and was never
 * written; the Border Dwell screen has been calling `GET /border-dwell/sessions`
 * against a route that did not exist. These two endpoints close that gap.
 *
 * Both are tenant-scoped: companyId comes from the session on read and from the
 * session plus a tenant-checked driverId on ingest.
 */

const READ_ROLES = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
  UserRole.WAREHOUSE,
];

// Ingest is a machine path: devices and the driver portal post fixes. DRIVER is
// included because the driver app is the source of most fixes, and the service
// refuses a driver who names anybody but themselves.
const INGEST_ROLES = [...READ_ROLES, UserRole.DRIVER];

@ApiTags('Border Dwell')
@ApiBearerAuth()
@Controller('border-dwell')
export class BorderDwellController {
  constructor(private readonly svc: BorderDwellService) {}

  /** POST /border-dwell/ingest — record a GPS fix and reconcile open sessions. */
  @Roles(...INGEST_ROLES)
  @Post('ingest')
  @ApiOperation({ summary: 'Record a GPS fix; opens, extends and closes dwell sessions' })
  ingest(@CurrentUser() u: any, @Body() dto: IngestFixDto) {
    return this.svc.ingestFix(u.companyId, dto, u);
  }

  /** GET /border-dwell/sessions — dwell sessions for this tenant. */
  @Roles(...READ_ROLES)
  @Get('sessions')
  @ApiOperation({ summary: 'Border dwell sessions, newest first' })
  list(@CurrentUser() u: any, @Query() query: ListSessionsQueryDto) {
    return this.svc.listSessions(u.companyId, query);
  }
}
