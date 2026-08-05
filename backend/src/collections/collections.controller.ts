import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CollectionsService } from './collections.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Collections')
@ApiBearerAuth()
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
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body);
  }

  @Get('collections/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch('collections/:id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.update(id, u.companyId, body);
  }

  @Delete('collections/:id')
  cancel(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.cancel(id, u.companyId);
  }

  /**
   * POST /collections/:id/confirm-collected
   * Office/dispatch marks a collection as COLLECTED → auto-creates Waybill + Shipment.
   * Same flow as the driver endpoint, but triggered from the dispatch desk.
   */
  @Post('collections/:id/confirm-collected')
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
