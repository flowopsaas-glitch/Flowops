import { CreateCollectionDto, UpdateCollectionDto } from './dto/collection.dto';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionsService } from './collections.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { RequireFeature } from '../billing/require-feature.decorator';

const COLLECTION_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.AGENT, UserRole.USER, UserRole.VIEWER,
];
const COLLECTION_DISPATCH_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH,
];

@ApiTags('Collections')
@ApiBearerAuth()
@Roles(...COLLECTION_READ_ROLES)
@RequireFeature('collections')
@Controller()
export class CollectionsController {
  constructor(private readonly svc: CollectionsService) {}

  @Get('collections')
  findAll(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get('collections/insights')
  insights(@CurrentUser() u: any) {
    return this.svc.insights(u.companyId);
  }

  @Post('collections')
  @Roles(...COLLECTION_DISPATCH_ROLES)
  create(@CurrentUser() u: any, @Body() body: CreateCollectionDto) {
    return this.svc.create(u.companyId, body);
  }

  @Get('collections/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch('collections/:id')
  @Roles(...COLLECTION_DISPATCH_ROLES)
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateCollectionDto) {
    return this.svc.update(id, u.companyId, body);
  }

  @Delete('collections/:id')
  @Roles(...COLLECTION_DISPATCH_ROLES)
  cancel(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.cancel(id, u.companyId);
  }

  /**
   * POST /collections/:id/confirm-collected
   * Office/dispatch marks a collection as COLLECTED → auto-creates Waybill + Shipment.
   * Same flow as the driver endpoint, but triggered from the dispatch desk.
   */
  @Post('collections/:id/confirm-collected')
  @Roles(...COLLECTION_DISPATCH_ROLES)
  confirmCollected(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { parcelCount?: number; deliveryAddress?: string; recipientName?: string; recipientPhone?: string; notes?: string },
  ) {
    return this.svc.confirmCollected(id, u.companyId, body);
  }

  @Get('collections/:id/auto-suggest')
  autoSuggest(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.autoSuggest(id, u.companyId);
  }

  /**
   * POST /collections/:id/assign-driver — attach a driver to the collection.
   * Tenant-scoped: the collection and the driver must belong to the caller's company.
   */
  @Post('collections/:id/assign-driver')
  @Roles(...COLLECTION_DISPATCH_ROLES)
  assignDriver(@Param('id') id: string, @CurrentUser() u: any, @Body() body: { driverId: string }) {
    return this.svc.assignDriver(id, u.companyId, body.driverId);
  }

  /**
   * POST /collections/:id/release-driver — detach the driver; ASSIGNED → PENDING.
   */
  @Post('collections/:id/release-driver')
  @Roles(...COLLECTION_DISPATCH_ROLES)
  releaseDriver(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.releaseDriver(id, u.companyId);
  }

  /**
   * GET /collections/:id/workflow — read model for the Collections command center drawer.
   */
  @Get('collections/:id/workflow')
  workflow(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getWorkflow(id, u.companyId);
  }

  /**
   * GET /companies/:companyId/collections — company-scoped collection list.
   * SECURITY: the :companyId path segment is IGNORED for tenant users — we only
   * ever return the authenticated caller's own company, so no one can read
   * another tenant's collections by editing the URL.
   */
  @Get('companies/:companyId/collections')
  findByCompany(@Param('companyId') _companyId: string, @CurrentUser() u: any) {
    return this.svc.findByCompany(u.companyId);
  }
}
