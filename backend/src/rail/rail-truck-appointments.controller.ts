import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailTruckAppointmentsService } from './rail-truck-appointments.service';
import {
  BookTruckAppointmentDto,
  ShiftTruckAppointmentsDto,
  TruckAppointmentTransitionDto,
} from './dto/rail-truck-appointment.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RequireFeature } from '../billing/require-feature.decorator';

/**
 * Terminal truck appointments — booked gate windows for the road side of the
 * road<->rail handoff. Booking REPORTS overlapping windows instead of hiding
 * them; the terminal operator governs conflicts (no auto-rejection).
 */
@ApiTags('Rail / Truck Appointments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/truck-appointments')
export class RailTruckAppointmentsController {
  constructor(private readonly appointments: RailTruckAppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List truck appointments (window order) with measured wait/late figures' })
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('terminalName') terminalName?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.appointments.list(u.companyId, { status, terminalName, from, to });
  }

  /**
   * Read-only counterparty view (haulier / terminal) behind an unguessable
   * share token. No login: the token is the credential, revocable any time.
   */
  @Public()
  @Get('public/:token')
  @ApiOperation({ summary: 'Shared read-only truck appointment (token-gated, no login)' })
  shared(@Param('token') token: string) {
    return this.appointments.getShared(token);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Counts by status + average measured wait (timestamp-based only)' })
  summary(@CurrentUser() u: AuthenticatedUser) {
    return this.appointments.summary(u.companyId);
  }

  @Post()
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Book a gate window; response lists any overlapping appointments' })
  book(@CurrentUser() u: AuthenticatedUser, @Body() dto: BookTruckAppointmentDto) {
    return this.appointments.book(u.companyId, dto, u);
  }

  @Post(':id/arrive')
  @Roles(...RAIL_WRITE_ROLES)
  arrive(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.transition(u.companyId, id, 'ARRIVED', dto);
  }

  @Post(':id/start-loading')
  @Roles(...RAIL_WRITE_ROLES)
  startLoading(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.transition(u.companyId, id, 'LOADING', dto);
  }

  @Post(':id/complete')
  @Roles(...RAIL_WRITE_ROLES)
  complete(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.transition(u.companyId, id, 'COMPLETED', dto);
  }

  @Post(':id/no-show')
  @Roles(...RAIL_WRITE_ROLES)
  noShow(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.transition(u.companyId, id, 'NO_SHOW', dto);
  }

  @Post(':id/cancel')
  @Roles(...RAIL_WRITE_ROLES)
  cancel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.transition(u.companyId, id, 'CANCELLED', dto);
  }

  @Post(':id/reschedule')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Move a BOOKED appointment to a new window; response lists overlaps' })
  reschedule(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: TruckAppointmentTransitionDto) {
    return this.appointments.reschedule(u.companyId, id, dto);
  }

  @Post(':id/share')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Create (or rotate) the counterparty share link for an appointment' })
  share(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appointments.createShareLink(user.companyId, id);
  }

  @Delete(':id/share')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Revoke the counterparty share link for an appointment' })
  revokeShare(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appointments.revokeShareLink(user.companyId, id);
  }

  @Post('replan-day')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Shift every BOOKED window at a terminal on a day (late-train replan)' })
  replanDay(@Body() dto: ShiftTruckAppointmentsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appointments.shiftDay(user.companyId, dto, user);
  }
}
