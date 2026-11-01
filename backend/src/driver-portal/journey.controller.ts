import {
  Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { DriverAuthGuard } from '../common/guards/driver-auth.guard';
import { JourneyService } from './journey.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * Journey truth + communication endpoints (WP2 slice).
 *
 * Driver-facing routes are @Public() + DriverAuthGuard: the driver identity
 * always comes from the token (req.driver.id), never from the body.
 *
 * Dispatch-facing routes require @Roles() tenant JWT: companyId comes from
 * the current user, never from the body.
 */
@Controller('driver-portal/journey')
export class JourneyController {
  constructor(private readonly svc: JourneyService) {}

  // ── Driver-facing (token-authenticated; single active session enforced) ─

  /** POST /driver-portal/journey/:journeyId/update — driver sends a journey update. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Post(':journeyId/update')
  sendUpdate(
    @Req() req: any,
    @Param('journeyId') journeyId: string,
    @Body() body: {
      type: string;
      message: string;
      clientMessageId?: unknown;
      deviceOccurredAt?: string;
      stageId?: string;
    },
  ) {
    return this.svc.sendUpdate(
      req.driver.id,
      req.driver.companyId,
      journeyId,
      {
        type: body.type,
        message: body.message,
        clientMessageId: body.clientMessageId,
        deviceOccurredAt: body.deviceOccurredAt ? new Date(body.deviceOccurredAt) : undefined,
        stageId: body.stageId,
      },
    );
  }

  /** GET /driver-portal/journey/mine — this driver's assigned journeys. */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get('mine')
  myJourneys(@Req() req: any, @Query('status') status?: string) {
    return this.svc.listJourneys(req.driver.companyId, status as any);
  }

  /** GET /driver-portal/journey/:journeyId — a specific journey (driver must be assigned). */
  @Public()
  @UseGuards(DriverAuthGuard)
  @Get(':journeyId')
  getJourney(@Req() req: any, @Param('journeyId') journeyId: string) {
    return this.svc.getJourney(req.driver.companyId, journeyId);
  }

  // ── Dispatch-facing (tenant JWT required) ────────────────────────────────

  /** POST /driver-portal/journey — office creates a journey. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post()
  createJourney(
    @CurrentUser() u: any,
    @Body() body: {
      reference: string;
      driverId?: string;
      origin?: string;
      destination?: string;
      plannedStart?: string;
      plannedEnd?: string;
    },
  ) {
    return this.svc.createJourney(u.companyId, {
      reference: body.reference,
      driverId: body.driverId ?? undefined,
      origin: body.origin ?? undefined,
      destination: body.destination ?? undefined,
      plannedStart: body.plannedStart ? new Date(body.plannedStart) : undefined,
      plannedEnd: body.plannedEnd ? new Date(body.plannedEnd) : undefined,
    });
  }

  /** POST /driver-portal/journey/:journeyId/stage — office adds a stage. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post(':journeyId/stage')
  addStage(
    @CurrentUser() u: any,
    @Param('journeyId') journeyId: string,
    @Body() body: {
      stageNumber: number;
      type: string;
      locationName?: string;
      locationRef?: string;
      plannedAt?: string;
      notes?: string;
    },
  ) {
    return this.svc.addStage(u.companyId, journeyId, {
      stageNumber: body.stageNumber,
      type: body.type as any,
      locationName: body.locationName ?? undefined,
      locationRef: body.locationRef ?? undefined,
      plannedAt: body.plannedAt ? new Date(body.plannedAt) : undefined,
      notes: body.notes ?? undefined,
    });
  }

  /** POST /driver-portal/journey/:journeyId/assign — office assigns a driver. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post(':journeyId/assign')
  assignDriver(
    @CurrentUser() u: any,
    @Param('journeyId') journeyId: string,
    @Body() body: { driverId: string },
  ) {
    return this.svc.assignDriver(u.companyId, journeyId, body.driverId);
  }

  /** GET /driver-portal/journey — office lists journeys for the company. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Get()
  listJourneys(@CurrentUser() u: any, @Query('status') status?: string) {
    return this.svc.listJourneys(u.companyId, status as any);
  }

  /** GET /driver-portal/journey/:journeyId — office gets a journey. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Get(':journeyId')
  getJourneyDispatch(@CurrentUser() u: any, @Param('journeyId') journeyId: string) {
    return this.svc.getJourney(u.companyId, journeyId);
  }

  /** POST /driver-portal/journey/update/:updateId/ack — dispatcher acknowledges. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('update/:updateId/ack')
  acknowledge(
    @CurrentUser() u: any,
    @Param('updateId') updateId: string,
  ) {
    return this.svc.acknowledgeUpdate(u.companyId, updateId, u.id);
  }

  /** POST /driver-portal/journey/update/:updateId/resolve — dispatcher resolves. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('update/:updateId/resolve')
  resolve(
    @CurrentUser() u: any,
    @Param('updateId') updateId: string,
    @Body() body: { resolutionNote?: string },
  ) {
    return this.svc.resolveUpdate(u.companyId, updateId, u.id, body?.resolutionNote ?? null);
  }

  /** GET /driver-portal/journey/:journeyId/updates — list updates for a journey. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Get(':journeyId/updates')
  listUpdates(
    @CurrentUser() u: any,
    @Param('journeyId') journeyId: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.svc.getJourneyUpdates(u.companyId, journeyId, Number(limit) || 50, Number(skip) || 0);
  }

  /** POST /driver-portal/journey/:journeyId/status — office updates journey status. */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post(':journeyId/status')
  updateStatus(
    @CurrentUser() u: any,
    @Param('journeyId') journeyId: string,
    @Body() body: { status: string },
  ) {
    return this.svc.updateJourneyStatus(u.companyId, journeyId, body.status as any);
  }
}
