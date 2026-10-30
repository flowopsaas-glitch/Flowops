import { Body, Controller, Get, Headers, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TruckWindowAckSource } from '@prisma/client';
import { RequireFeature } from '../billing/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AckTruckWindowDto, UpdateGateAckPolicyDto } from './dto/rail-truck-window-change.dto';
import { RAIL_READ_ROLES, RAIL_WINDOW_CHANGE_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RailTruckWindowChangesService } from './rail-truck-window-changes.service';

/**
 * Terminal truck window changes — the closed loop's tenant-facing surface.
 *
 * Authority model, stated plainly because it is the part most easily got wrong:
 * only an authenticated tenant user with a rail-write role can PUBLISH a window
 * change. Share-token holders and driver-portal sessions can read and can
 * ACKNOWLEDGE, never move a window. In this product's tenancy the terminal
 * operator and the haulier's dispatch desk are users of the tenant that owns
 * the appointment record, and the counterparty outside it is reached through
 * the expiring share link — there is no separate haulier tenant, and nothing
 * here pretends otherwise.
 *
 * Literal routes are declared before `:id` so Nest does not match "board" or
 * "kpis" as an identifier.
 */
@ApiTags('Rail / Truck Window Changes')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/truck-window-changes')
export class RailTruckWindowChangesController {
  constructor(private readonly changes: RailTruckWindowChangesService) {}

  @Get()
  @ApiOperation({ summary: 'List window changes (newest first) with per-recipient delivery + acknowledgement state' })
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('terminalName') terminalName?: string,
    @Query('ackState') ackState?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.changes.listChanges(u.companyId, { status, terminalName, ackState, from, to });
  }

  @Get('board')
  @ApiOperation({ summary: 'Acknowledgement board: who acked, who has not, time since change, counts' })
  board(@CurrentUser() u: AuthenticatedUser, @Query('terminalName') terminalName?: string) {
    return this.changes.ackBoard(u.companyId, { terminalName });
  }

  @Get('kpis')
  @ApiOperation({ summary: 'Measured change→ack median + P90 (with n), % acked before arrival, stale unacked count' })
  kpis(@CurrentUser() u: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.changes.kpis(u.companyId, { from, to });
  }

  @Get('gate-policies')
  @ApiOperation({ summary: 'Per-terminal acknowledgement thresholds, plus the documented defaults' })
  gatePolicies(@CurrentUser() u: AuthenticatedUser) {
    return this.changes.listGatePolicies(u.companyId);
  }

  /**
   * Thresholds decide when the terminal is told that a truck does not know.
   * Loosening them hides overdue changes, so this needs the window-change
   * permission — enforced here and again inside the service.
   */
  @Put('gate-policies')
  @Roles(...RAIL_WINDOW_CHANGE_ROLES)
  @ApiOperation({ summary: 'Set the acknowledgement thresholds for one terminal' })
  upsertGatePolicy(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: UpdateGateAckPolicyDto & { terminalName: string },
  ) {
    const { terminalName, ...rest } = dto as any;
    return this.changes.upsertGatePolicy(u.companyId, String(terminalName ?? ''), rest, u as any);
  }

  @Get('appointment/:appointmentId')
  @ApiOperation({ summary: 'Full version history for one appointment, newest first (superseded windows included)' })
  history(@CurrentUser() u: AuthenticatedUser, @Param('appointmentId') appointmentId: string) {
    return this.changes.listForAppointment(u.companyId, appointmentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One window change: old window → new window, reason, actor, version, recipients' })
  one(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.changes.getChange(u.companyId, id);
  }

  /**
   * A tenant user (dispatcher / terminal operator) confirms the change on
   * behalf of the haulier organisation. This is a SEPARATE state from the
   * driver's acknowledgement — a dispatcher confirming does not mean the truck
   * knows, and the board keeps the two apart.
   */
  @Post(':id/ack')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Acknowledge a window change as a tenant user (haulier-side confirmation)' })
  ack(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AckTruckWindowDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.changes.acknowledge({
      companyId: u.companyId,
      changeId: id,
      source: TruckWindowAckSource.TENANT_USER,
      actorLabel: u.email ?? u.name ?? null,
      deviceAckedAt: dto?.deviceAckedAt ? new Date(dto.deviceAckedAt) : null,
      idempotencyKey: dto?.idempotencyKey ?? idempotencyKey ?? null,
    });
  }
}
