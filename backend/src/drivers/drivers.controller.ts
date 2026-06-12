import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DriversService } from './drivers.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly svc: DriversService) {}

  @Get()
  findAll(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.findAll(u.companyId, q);
  }

  @Post()
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.update(id, u.companyId, body);
  }

  @Patch(':id/location')
  updateLocation(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.updateLocation(id, u.companyId, body.lat, body.lng);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }
}
