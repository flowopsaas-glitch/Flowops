import {
  Body, Controller, Get, Param, Post, Patch, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SafetyIncidentService } from './safety-incident.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * WP4 — Safety Incident Layer endpoints.
 *
 * All routes are tenant-scoped: companyId comes from the current user.
 * A report is a claim (SafetyIncident); a zone is an assertion (SafetyZone)
 * created only on verification.
 *
 * Endpoints:
 *   POST   /safety-incidents                              — one-tap report
 *   GET    /safety-incidents                              — dispatch queue
 *   GET    /safety-incidents/:incidentId                  — get incident (+ audited position read)
 *   POST   /safety-incidents/:incidentId/verify           — verify → creates SafetyZone + broadcast
 *   POST   /safety-incidents/:incidentId/reject           — reject with reason
 *   POST   /safety-incidents/:incidentId/withdraw         — reporting driver withdraws
 *   POST   /safety-incidents/:incidentId/corroborate      — second source match
 *   POST   /safety-incidents/sweep-expired                — expiry sweep (admin)
 *   POST   /safety-incidents/sweep-retention              — position nulling sweep (admin)
 */
@ApiTags('Safety Incidents (WP4)')
@ApiBearerAuth()
@Controller('safety-incidents')
export class SafetyIncidentController {
  constructor(private readonly svc: SafetyIncidentService) {}

  /** POST /safety-incidents — one-tap report (claim, not a zone) */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Post()
  report(
    @CurrentUser() u: any,
    @Body() body: {
      type: string;
      reportLat: number;
      reportLng: number;
      reportAccuracyM?: number;
      locationSource?: 'DEVICE_GPS' | 'MAP_PIN' | 'LAST_KNOWN';
      narrative?: string;
      idempotencyKey: string;
    },
  ) {
    return this.svc.reportIncident(u.companyId, {
      id: u.id,
      email: u.email,
      role: u.role,
    }, {
      type: body.type,
      reportLat: body.reportLat,
      reportLng: body.reportLng,
      reportAccuracyM: body.reportAccuracyM,
      locationSource: body.locationSource,
      narrative: body.narrative,
      idempotencyKey: body.idempotencyKey,
    });
  }

  /** GET /safety-incidents — dispatch queue (visible to dispatch only) */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Get()
  list(
    @CurrentUser() u: any,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listIncidents(u.companyId, status, limit ? Number(limit) : 50);
  }

  /** GET /safety-incidents/:incidentId — get incident (position read is audited) */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Get(':incidentId')
  get(@CurrentUser() u: any, @Param('incidentId') incidentId: string) {
    return this.svc.getIncident(u.companyId, incidentId);
  }

  /** POST /safety-incidents/:incidentId/verify — verify → creates zone + broadcast */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post(':incidentId/verify')
  verify(
    @CurrentUser() u: any,
    @Param('incidentId') incidentId: string,
    @Body() body: {
      verificationMethod: 'DISPATCH_CONFIRM' | 'SECOND_SOURCE' | 'AUTHORITY_NOTIFIED';
      severity?: string;
      radiusM?: number;
      ttlHours?: number;
    },
  ) {
    return this.svc.verifyIncident(u.companyId, incidentId, {
      id: u.id,
      email: u.email,
    }, {
      verificationMethod: body.verificationMethod,
      severity: body.severity,
      radiusM: body.radiusM,
      ttlHours: body.ttlHours,
    });
  }

  /** POST /safety-incidents/:incidentId/reject — reject with reason */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post(':incidentId/reject')
  reject(
    @CurrentUser() u: any,
    @Param('incidentId') incidentId: string,
    @Body() body: {
      rejectionReason: 'NOT_THERE' | 'ALREADY_CLEARED' | 'DUPLICATE' | 'MISCLASSIFIED' | 'NOT_CREDIBLE' | 'OTHER';
      rejectionNote?: string;
    },
  ) {
    return this.svc.rejectIncident(u.companyId, incidentId, {
      id: u.id,
      email: u.email,
    }, {
      rejectionReason: body.rejectionReason,
      rejectionNote: body.rejectionNote,
    });
  }

  /** POST /safety-incidents/:incidentId/withdraw — reporting driver withdraws */
  @Roles(UserRole.DRIVER)
  @Post(':incidentId/withdraw')
  withdraw(
    @CurrentUser() u: any,
    @Param('incidentId') incidentId: string,
  ) {
    return this.svc.withdrawIncident(u.companyId, incidentId, u.id);
  }

  /** POST /safety-incidents/:incidentId/corroborate — second source match */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER)
  @Post(':incidentId/corroborate')
  corroborate(
    @CurrentUser() u: any,
    @Param('incidentId') incidentId: string,
    @Body() body: {
      driverId: string;
      reportLat: number;
      reportLng: number;
    },
  ) {
    return this.svc.corroborateIncident(u.companyId, { id: u.id }, {
      incidentId,
      driverId: body.driverId,
      reportLat: body.reportLat,
      reportLng: body.reportLng,
    });
  }

  /** POST /safety-incidents/sweep-expired — expiry sweep (admin) */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('sweep-expired')
  sweepExpired(@CurrentUser() u: any, @Query('companyId') companyId?: string) {
    return this.svc.sweepExpiredIncidents(companyId ?? u.companyId);
  }

  /** POST /safety-incidents/sweep-retention — position nulling sweep (admin) */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('sweep-retention')
  sweepRetention(@CurrentUser() u: any, @Query('companyId') companyId?: string) {
    return this.svc.sweepRetention(companyId ?? u.companyId);
  }
}
