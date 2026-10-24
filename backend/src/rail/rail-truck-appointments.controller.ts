import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailTruckAppointmentsService } from './rail-truck-appointments.service';
import { BookTruckAppointmentDto, TruckAppointmentTransitionDto } from './dto/rail-truck-appointment.dto';
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
}
