import {
  Body, Controller, Get, Param, Post, Patch, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TripLegService } from './trip-leg.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * WP3 Stage 4: Trip corridor split endpoints.
 *
 * All routes are tenant-scoped: companyId comes from the current user.
 * Trip provenance labels (MEASURED / DECLARED / REFERENCE) are enforced
 * in the service — the controller never invents a measured total.
 */
@ApiTags('Trip Legs (WP3)')
@ApiBearerAuth()
@Controller('trip-legs')
export class TripLegController {
  constructor(private readonly svc: TripLegService) {}

  /** POST /trip-legs/trips — create a new trip */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('trips')
  createTrip(
    @CurrentUser() u: any,
    @Body() body: {
      reference: string;
      driverId?: string;
      vehicleReg?: string;
      origin?: string;
      destination?: string;
      plannedStart?: string;
      plannedEnd?: string;
    },
  ) {
    return this.svc.createTrip(u.companyId, {
      reference: body.reference,
      driverId: body.driverId ?? undefined,
      vehicleReg: body.vehicleReg ?? undefined,
      origin: body.origin ?? undefined,
      destination: body.destination ?? undefined,
      plannedStart: body.plannedStart ? new Date(body.plannedStart) : undefined,
      plannedEnd: body.plannedEnd ? new Date(body.plannedEnd) : undefined,
    });
  }

  /** GET /trip-legs/trips — list trips for the tenant */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Get('trips')
  getTrips(
    @CurrentUser() u: any,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getTrips(u.companyId, status, limit ? Number(limit) : 50);
  }

  /** GET /trip-legs/trips/:tripId — get a trip with legs and provenance summary */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Get('trips/:tripId')
  getTrip(@CurrentUser() u: any, @Param('tripId') tripId: string) {
    return this.svc.getTrip(u.companyId, tripId);
  }

  /** POST /trip-legs/trips/:tripId/derive-border-legs — derive BORDER legs from dwell sessions */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH,
  )
  @Post('trips/:tripId/derive-border-legs')
  deriveBorderLegs(@CurrentUser() u: any, @Param('tripId') tripId: string) {
    return this.svc.deriveBorderLegsFromDwellSessions(u.companyId, tripId);
  }

  /** POST /trip-legs/trips/:tripId/legs/declared — create a DECLARED BORDER leg */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH,
  )
  @Post('trips/:tripId/legs/declared')
  createDeclaredLeg(
    @CurrentUser() u: any,
    @Param('tripId') tripId: string,
    @Body() body: {
      postId?: string;
      startedAt?: string;
      endedAt?: string;
      durationMinutes?: number;
      confidenceNote?: string;
      notes?: string;
    },
  ) {
    return this.svc.createDeclaredLeg(u.companyId, tripId, {
      postId: body.postId ?? undefined,
      startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
      endedAt: body.endedAt ? new Date(body.endedAt) : undefined,
      durationMinutes: body.durationMinutes ?? undefined,
      confidenceNote: body.confidenceNote ?? undefined,
      notes: body.notes ?? undefined,
      capturedBy: u.id,
    });
  }

  /** POST /trip-legs/trips/:tripId/legs/reference — create a REFERENCE leg (planning only) */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH,
  )
  @Post('trips/:tripId/legs/reference')
  createReferenceLeg(
    @CurrentUser() u: any,
    @Param('tripId') tripId: string,
    @Body() body: {
      kind: 'LINEHAUL' | 'BORDER' | 'CLEARING' | 'BOND' | 'EMPTY_RETURN';
      postId?: string;
      durationMinutes?: number;
      source?: string;
      notes?: string;
    },
  ) {
    return this.svc.createReferenceLeg(u.companyId, tripId, {
      kind: body.kind,
      postId: body.postId ?? undefined,
      durationMinutes: body.durationMinutes ?? undefined,
      source: body.source ?? undefined,
      notes: body.notes ?? undefined,
    });
  }

  /** PATCH /trip-legs/trips/:tripId/status — update trip status */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH,
  )
  @Patch('trips/:tripId/status')
  updateTripStatus(
    @CurrentUser() u: any,
    @Param('tripId') tripId: string,
    @Body() body: { status: string },
  ) {
    return this.svc.updateTripStatus(u.companyId, tripId, body.status);
  }

  /** POST /trip-legs/trips/:tripId/hs-origin — set HS code + origin status */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH,
  )
  @Post('trips/:tripId/hs-origin')
  setHsOrigin(
    @CurrentUser() u: any,
    @Param('tripId') tripId: string,
    @Body() body: {
      hsCode?: string;
      originStatus?: 'PREFERENTIAL' | 'NON_PREFERENTIAL' | 'UNKNOWN';
      certificateOfOriginRef?: string;
    },
  ) {
    return this.svc.setHsOrigin(u.companyId, tripId, {
      hsCode: body.hsCode ?? undefined,
      originStatus: body.originStatus ?? undefined,
      certificateOfOriginRef: body.certificateOfOriginRef ?? undefined,
      capturedBy: u.id,
    });
  }

  /** POST /trip-legs/trips/:tripId/duty/estimate — set ESTIMATED duty from a named reference */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH,
  )
  @Post('trips/:tripId/duty/estimate')
  setDutyEstimate(
    @CurrentUser() u: any,
    @Param('tripId') tripId: string,
    @Body() body: {
      duty: number;
      estimateSource: string;
      estimateVersion: string;
    },
  ) {
    return this.svc.setDutyEstimate(u.companyId, tripId, {
      duty: body.duty,
      estimateSource: body.estimateSource,
      estimateVersion: body.estimateVersion,
      capturedBy: u.id,
    });
  }

  /** POST /trip-legs/trips/:tripId/duty/actual — set ACTUAL duty from a declaration */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH,
  )
  @Post('trips/:tripId/duty/actual')
  setDutyActual(
    @CurrentUser() u: any,
    @Param('tripId') tripId: string,
    @Body() body: {
      duty: number;
      declarationRef: string;
    },
  ) {
    return this.svc.setDutyActual(u.companyId, tripId, {
      duty: body.duty,
      declarationRef: body.declarationRef,
      capturedBy: u.id,
    });
  }
}
