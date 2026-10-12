import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailAlertStatus } from '@prisma/client';
import { RailTelemetryService } from './rail-telemetry.service';
import {
  AlertActionDto, BulkIngestDto, CreateTelemetryDeviceDto, DeviceIngestDto, TelemetryQueryDto, UpdateTelemetryDeviceDto,
} from './dto/rail-telemetry.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { RAIL_READ_ROLES, RAIL_WRITE_ROLES } from './rail-roles';

/**
 * Telemetry — device registry, ingest, positions, alerts.
 *
 * `POST /rail/telemetry/ingest` is the machine endpoint: it skips the user JWT
 * guard and authenticates with `X-Device-Token` (a per-device secret stored
 * only as a hash). The same request contract is what an MQTT bridge will POST
 * when hardware partners arrive. Everything else is tenant-scoped RBAC.
 */
@ApiTags('Rail / Telemetry')
@Controller('rail/telemetry')
export class RailTelemetryController {
  constructor(private readonly telemetry: RailTelemetryService) {}

  // ── Machine ingest (device token, no user session) ────────────────────────

  @Post('ingest')
  @Public()
  @ApiOperation({ summary: 'Device ingest: batch of points authenticated with X-Device-Token' })
  @ApiHeader({ name: 'X-Device-Token', required: true })
  ingest(@Headers('x-device-token') token: string, @Body() dto: DeviceIngestDto) {
    return this.telemetry.ingestByToken(token, dto.points ?? []);
  }

  @Post('ingest/bulk')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Bulk ingest on a user session; every point names its deviceCode' })
  ingestBulk(@CurrentUser() u: AuthenticatedUser, @Body() dto: BulkIngestDto) {
    return this.telemetry.ingestBulk(u.companyId, dto.points ?? [], u);
  }

  // ── Device registry ──────────────────────────────────────────────────────

  @Get('devices')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_READ_ROLES)
  listDevices(@CurrentUser() u: AuthenticatedUser) {
    return this.telemetry.listDevices(u.companyId);
  }

  @Post('devices')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Register a device — the ingest token is returned exactly once' })
  createDevice(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateTelemetryDeviceDto) {
    return this.telemetry.createDevice(u.companyId, dto, u);
  }

  @Get('devices/:id/points')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_READ_ROLES)
  points(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Query() q: TelemetryQueryDto) {
    return this.telemetry.points(u.companyId, id, {
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      limit: q.limit,
    });
  }

  @Get('devices/:id/summary')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_READ_ROLES)
  summary(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Query('sinceHours') sinceHours?: string) {
    return this.telemetry.summary(u.companyId, id, sinceHours ? Number(sinceHours) : 24);
  }

  @Patch('devices/:id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_WRITE_ROLES)
  updateDevice(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTelemetryDeviceDto) {
    return this.telemetry.updateDevice(u.companyId, id, dto, u);
  }

  @Post('devices/:id/rotate-token')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Rotate the ingest token — new plaintext returned exactly once' })
  rotateToken(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.telemetry.rotateToken(u.companyId, id, u);
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  @Get('alerts')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_READ_ROLES)
  listAlerts(@CurrentUser() u: AuthenticatedUser, @Query('status') status?: RailAlertStatus, @Query('deviceId') deviceId?: string) {
    return this.telemetry.listAlerts(u.companyId, { status, deviceId });
  }

  @Post('alerts/:id/acknowledge')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_WRITE_ROLES)
  acknowledge(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: AlertActionDto) {
    return this.telemetry.acknowledgeAlert(u.companyId, id, u, dto.note);
  }

  @Post('alerts/:id/resolve')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...RAIL_WRITE_ROLES)
  resolve(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: AlertActionDto) {
    return this.telemetry.resolveAlert(u.companyId, id, u, dto.note);
  }
}
