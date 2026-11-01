import {
  Body, Controller, Get, Param, Post, Patch, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TripDocumentPackService } from './trip-document-pack.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

/**
 * WP3 Stage 3: Cross-border document pack + expiry alerts endpoints.
 *
 * All routes are tenant-scoped: companyId comes from the current user.
 * The pack records what the operator holds — it does not file anything
 * with any authority. Reference data from SadcCorridorService is shown
 * as "TYPICALLY REQUIRED — verify", never as "REQUIRED".
 */
@ApiTags('Trip Documents (WP3)')
@ApiBearerAuth()
@Controller('trip-documents')
export class TripDocumentPackController {
  constructor(private readonly svc: TripDocumentPackService) {}

  /** GET /trip-documents — list documents for the tenant (optionally by trip/status) */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Get()
  getDocuments(
    @CurrentUser() u: any,
    @Query('tripId') tripId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.getDocuments(u.companyId, tripId, status);
  }

  /** GET /trip-documents/:docId — get a single document */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.DRIVER,
  )
  @Get(':docId')
  getDocument(@CurrentUser() u: any, @Param('docId') docId: string) {
    return this.svc.getDocument(u.companyId, docId);
  }

  /** POST /trip-documents — capture a document for a trip */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.DRIVER,
  )
  @Post()
  createDocument(
    @CurrentUser() u: any,
    @Body() body: {
      tripId: string;
      documentType: string;
      status?: 'HELD' | 'MISSING' | 'EXPIRED' | 'NOT_APPLICABLE';
      issuedAt?: string;
      expiresAt?: string;
      evidenceRef?: string;
    },
  ) {
    return this.svc.createDocument(u.companyId, {
      tripId: body.tripId,
      documentType: body.documentType,
      status: body.status ?? 'HELD',
      issuedAt: body.issuedAt ? new Date(body.issuedAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      capturedBy: u.id,
      evidenceRef: body.evidenceRef ?? undefined,
    });
  }

  /** PATCH /trip-documents/:docId — update a document */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.DRIVER,
  )
  @Patch(':docId')
  updateDocument(
    @CurrentUser() u: any,
    @Param('docId') docId: string,
    @Body() body: {
      status?: 'HELD' | 'MISSING' | 'EXPIRED' | 'NOT_APPLICABLE';
      issuedAt?: string;
      expiresAt?: string;
      evidenceRef?: string;
    },
  ) {
    return this.svc.updateDocument(u.companyId, docId, {
      status: body.status,
      issuedAt: body.issuedAt ? new Date(body.issuedAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      capturedBy: u.id,
      evidenceRef: body.evidenceRef ?? undefined,
    });
  }

  /** GET /trip-documents/thresholds — expiry alert thresholds for the tenant */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Get('thresholds')
  getThresholds(@CurrentUser() u: any) {
    return this.svc.getThresholds(u.companyId);
  }

  /** POST /trip-documents/thresholds — set an expiry alert threshold */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('thresholds')
  setThreshold(
    @CurrentUser() u: any,
    @Body() body: {
      documentType?: string;
      thresholdDays: number;
    },
  ) {
    return this.svc.setThreshold(u.companyId, {
      documentType: body.documentType ?? undefined,
      thresholdDays: body.thresholdDays,
    });
  }

  /** POST /trip-documents/sweep — sweep for due expiry alerts (cron-like) */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
  @Post('sweep')
  sweep(@CurrentUser() u: any) {
    return this.svc.sweepExpiryAlerts(u.companyId);
  }
}
