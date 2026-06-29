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

  @Get('collections/:id/auto-suggest')
  autoSuggest(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.autoSuggest(id, u.companyId);
  }

  /** GET /companies/:companyId/collections — company-scoped collection list */
  @Get('companies/:companyId/collections')
  findByCompany(@Param('companyId') companyId: string) {
    return this.svc.findByCompany(companyId);
  }
}
