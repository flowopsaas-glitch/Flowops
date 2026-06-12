import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ManifestsService } from './manifests.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Manifests')
@ApiBearerAuth()
@Controller()
export class ManifestsController {
  constructor(private readonly svc: ManifestsService) {}

  @Get('manifests')
  findAll(@CurrentUser() u: any) {
    return this.svc.findAll(u.companyId);
  }

  @Post('manifests/create')
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body);
  }

  @Get('manifests/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch('manifests/:id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.update(id, u.companyId, body);
  }

  /** POST /branches/manifest/:id/receive — incoming linehaul from another branch */
  @Post('branches/manifest/:id/receive')
  receive(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.receiveManifest(id, u.companyId);
  }

  /** POST /branches/linehaul — create an inter-branch transfer manifest */
  @Post('branches/linehaul')
  createLinehaul(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.createLinehaul(u.companyId, body);
  }
}
