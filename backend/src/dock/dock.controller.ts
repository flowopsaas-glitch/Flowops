import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../billing/require-feature.decorator';
import { UserRole } from '@prisma/client';
import { DockService } from './dock.service';
import {
  CreateAppointmentDto,
  CreateDockSlotDto,
  ListAppointmentsQueryDto,
  RescheduleAppointmentDto,
  TransitionAppointmentDto,
  UpdateDockSlotDto,
} from './dto/dock.dto';

/**
 * Dock scheduling surface.
 *
 * companyId always comes from the session. Every service method re-scopes by
 * it, and slot/warehouse lookups are tenant-scoped too, so a guessed id from
 * another tenant resolves to a 404 rather than to someone else's dock board.
 */

const DOCK_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.WAREHOUSE,
  UserRole.DISPATCH,
  UserRole.AGENT,
  UserRole.USER,
  UserRole.VIEWER,
];

/** Booking and moving vehicles is warehouse/dispatch work. */
const DOCK_WRITE_ROLES = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.WAREHOUSE,
  UserRole.DISPATCH,
];

/** Adding or reconfiguring a physical dock is a management decision. */
const DOCK_ADMIN_ROLES = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.WAREHOUSE,
];

@ApiTags('Dock')
@ApiBearerAuth()
@Roles(...DOCK_READ_ROLES)
@RequireFeature('warehouseManagement')
@Controller()
export class DockController {
  constructor(private readonly docks: DockService) {}

  // ── Docks ────────────────────────────────────────────────────────────────

  @Get('warehouses/:warehouseId/docks')
  listSlots(
    @Param('warehouseId') warehouseId: string,
    @CurrentUser() u: any,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.docks.listSlots(u.companyId, warehouseId, includeInactive === 'true');
  }

  @Post('warehouses/:warehouseId/docks')
  @Roles(...DOCK_ADMIN_ROLES)
  createSlot(
    @Param('warehouseId') warehouseId: string,
    @CurrentUser() u: any,
    @Body() body: CreateDockSlotDto,
  ) {
    return this.docks.createSlot(u.companyId, { ...body, warehouseId });
  }

  @Patch('docks/:id')
  @Roles(...DOCK_ADMIN_ROLES)
  updateSlot(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateDockSlotDto) {
    return this.docks.updateSlot(u.companyId, id, body);
  }

  // ── Appointments ─────────────────────────────────────────────────────────

  @Get('dock-appointments')
  listAppointments(@CurrentUser() u: any, @Query() q: ListAppointmentsQueryDto) {
    return this.docks.listAppointments(u.companyId, {
      dockSlotId: q.dockSlotId,
      status: q.status,
      from: q.from,
      to: q.to,
      take: q.take,
      skip: q.skip,
    });
  }

  @Get('dock-appointments/:id')
  getAppointment(@Param('id') id: string, @CurrentUser() u: any) {
    return this.docks.getAppointment(u.companyId, id);
  }

  /**
   * POST /dock-appointments — book a dock.
   *
   * Returns 409 when the dock is already taken for that window. The conflict is
   * detected inside the same transaction as the insert, so two dispatchers
   * booking the same window cannot both succeed.
   */
  @Post('dock-appointments')
  @Roles(...DOCK_WRITE_ROLES)
  createAppointment(@CurrentUser() u: any, @Body() body: CreateAppointmentDto) {
    return this.docks.createAppointment(u.companyId, body);
  }

  @Patch('dock-appointments/:id/reschedule')
  @Roles(...DOCK_WRITE_ROLES)
  reschedule(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: RescheduleAppointmentDto,
  ) {
    return this.docks.reschedule(u.companyId, id, body.scheduledStart, body.scheduledEnd);
  }

  /**
   * PATCH /dock-appointments/:id/status — arrive, start, complete, cancel.
   *
   * Only legal transitions are accepted; anything else is a 409 naming the
   * moves that are allowed from the current state.
   */
  @Patch('dock-appointments/:id/status')
  @Roles(...DOCK_WRITE_ROLES)
  transition(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: TransitionAppointmentDto,
  ) {
    return this.docks.transition(u.companyId, id, body.status, body.notes ?? null);
  }

  /**
   * GET /docks/:id/availability?day=YYYY-MM-DD — free windows, not bookings.
   *
   * Framed as gaps so the caller is told where they *can* book.
   */
  @Get('docks/:id/availability')
  availability(@Param('id') id: string, @Query('day') day: string, @CurrentUser() u: any) {
    return this.docks.availability(u.companyId, id, day);
  }
}
