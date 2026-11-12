import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, JourneyStatus } from '@prisma/client';
import { JourneyService } from './journey.service';
import {
  AddStageDto,
  AssignDriverDto,
  CreateJourneyDto,
  ResolveJourneyUpdateDto,
  UpdateJourneyStatusDto,
} from './dto/journey.dto';

/**
 * Dispatch/office surface for journeys.
 *
 * A Journey is a tenant-scoped container of ordered planned stages; drivers
 * send updates against them from the driver app (see DriverPortalController)
 * and dispatch works those updates here.
 *
 * Every handler takes companyId from the authenticated session — never from
 * the body or the path — so a tenant cannot address another tenant's journey
 * by guessing an id. The service re-scopes every query by companyId as well,
 * so this is belt and braces rather than a single point of failure.
 */

/** Reading journeys is available to anyone who can see operations. */
const JOURNEY_READ_ROLES = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
  UserRole.AGENT,
  UserRole.USER,
  UserRole.VIEWER,
];

/** Changing journeys is a dispatch decision. */
const JOURNEY_WRITE_ROLES = [
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
];

@ApiTags('Journeys')
@ApiBearerAuth()
@Roles(...JOURNEY_READ_ROLES)
@Controller()
export class JourneysController {
  constructor(private readonly journeys: JourneyService) {}

  /** GET /journeys — all journeys for this tenant, newest first. */
  @Get('journeys')
  list(@CurrentUser() u: any, @Query('status') status?: JourneyStatus) {
    return this.journeys.listJourneys(u.companyId, status);
  }

  /** GET /journeys/:id — one journey with its driver, stages and updates. */
  @Get('journeys/:id')
  get(@Param('id') id: string, @CurrentUser() u: any) {
    return this.journeys.getJourney(u.companyId, id);
  }

  /** POST /journeys — plan a new journey. */
  @Post('journeys')
  @Roles(...JOURNEY_WRITE_ROLES)
  create(@CurrentUser() u: any, @Body() body: CreateJourneyDto) {
    return this.journeys.createJourney(u.companyId, {
      reference: body.reference,
      driverId: body.driverId ?? null,
      origin: body.origin ?? null,
      destination: body.destination ?? null,
      plannedStart: body.plannedStart ? new Date(body.plannedStart) : null,
      plannedEnd: body.plannedEnd ? new Date(body.plannedEnd) : null,
    });
  }

  /** POST /journeys/:id/stages — append a planned stage. */
  @Post('journeys/:id/stages')
  @Roles(...JOURNEY_WRITE_ROLES)
  addStage(@Param('id') id: string, @CurrentUser() u: any, @Body() body: AddStageDto) {
    return this.journeys.addStage(u.companyId, id, {
      stageNumber: body.stageNumber,
      type: body.type,
      locationName: body.locationName ?? null,
    });
  }

  /** POST /journeys/:id/assign — assign (or reassign) the driver. */
  @Post('journeys/:id/assign')
  @Roles(...JOURNEY_WRITE_ROLES)
  assign(@Param('id') id: string, @CurrentUser() u: any, @Body() body: AssignDriverDto) {
    return this.journeys.assignDriver(u.companyId, id, body.driverId);
  }

  /** PATCH /journeys/:id/status — move the journey through its lifecycle. */
  @Patch('journeys/:id/status')
  @Roles(...JOURNEY_WRITE_ROLES)
  setStatus(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: UpdateJourneyStatusDto,
  ) {
    return this.journeys.updateJourneyStatus(u.companyId, id, body.status);
  }

  /** GET /journeys/:id/updates — the driver updates on this journey. */
  @Get('journeys/:id/updates')
  updates(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('skip', new ParseIntPipe({ optional: true })) skip?: number,
  ) {
    return this.journeys.getJourneyUpdates(u.companyId, id, limit ?? 50, skip ?? 0);
  }

  /** POST /journeys/updates/:id/acknowledge — dispatch has seen this update. */
  @Post('journeys/updates/:id/acknowledge')
  @Roles(...JOURNEY_WRITE_ROLES)
  acknowledge(@Param('id') id: string, @CurrentUser() u: any) {
    return this.journeys.acknowledgeUpdate(u.companyId, id, u?.id ?? null);
  }

  /**
   * POST /journeys/updates/:id/resolve — close out an update.
   *
   * Resolution records who closed it and why; the original update is never
   * overwritten, so the history of what the driver actually reported survives
   * any amount of later triage.
   */
  @Post('journeys/updates/:id/resolve')
  @Roles(...JOURNEY_WRITE_ROLES)
  resolve(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: ResolveJourneyUpdateDto,
  ) {
    return this.journeys.resolveUpdate(
      u.companyId,
      id,
      u?.id ?? null,
      body?.resolutionNote ?? null,
    );
  }
}
