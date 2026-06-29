import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CarriersService } from './carriers.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Carriers & Procurement')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
@Controller('carriers')
export class CarriersController {
  constructor(private readonly carriers: CarriersService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Carrier & buy-rate counts' })
  metrics(@CurrentUser() u: any) {
    return this.carriers.metrics(u.companyId);
  }

  @Get('lane-analysis')
  @ApiOperation({ summary: 'Lane Rate Explorer: best buy-rate, spread & savings per lane' })
  laneAnalysis(@CurrentUser() u: any) {
    return this.carriers.laneAnalysis(u.companyId);
  }

  @Get()
  @ApiOperation({ summary: 'List carriers (with buy-rates)' })
  list(@CurrentUser() u: any, @Query() query: any) {
    return this.carriers.list(u.companyId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a carrier' })
  get(@CurrentUser() u: any, @Param('id') id: string) {
    return this.carriers.get(u.companyId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a carrier / vendor' })
  create(@CurrentUser() u: any, @Body() dto: any) {
    return this.carriers.create(u.companyId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a carrier' })
  update(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.carriers.update(u.companyId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a carrier' })
  remove(@CurrentUser() u: any, @Param('id') id: string) {
    return this.carriers.remove(u.companyId, id);
  }

  @Post(':id/rates')
  @ApiOperation({ summary: 'Add a buy-rate contract to a carrier' })
  addRate(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.carriers.addRate(u.companyId, id, dto);
  }

  @Delete(':id/rates/:rateId')
  @ApiOperation({ summary: 'Remove a buy-rate' })
  removeRate(@CurrentUser() u: any, @Param('id') id: string, @Param('rateId') rateId: string) {
    return this.carriers.removeRate(u.companyId, id, rateId);
  }
}
