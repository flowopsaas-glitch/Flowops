import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ShipmentFileService } from './shipment-file.service';
import { CreateShipmentFileDto } from './dto/create-shipment-file.dto';
import { UpdateShipmentFileDto } from './dto/update-shipment-file.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Freight Forwarding')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
@Controller('forwarding')
export class ForwardingController {
  constructor(private readonly files: ShipmentFileService) {}

  @Post('files')
  @ApiOperation({ summary: 'Create a shipment file (import/export)' })
  create(@CurrentUser() u: any, @Body() dto: CreateShipmentFileDto) {
    return this.files.create(u.companyId, dto);
  }

  @Get('files')
  @ApiOperation({ summary: 'List shipment files (filter: mode, direction, status, q)' })
  list(
    @CurrentUser() u: any,
    @Query('mode') mode?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.files.list(u.companyId, { mode, direction, status, q });
  }

  @Get('files/:id')
  @ApiOperation({ summary: 'Get a shipment file with containers, cargo, charges, docs, milestones' })
  get(@CurrentUser() u: any, @Param('id') id: string) {
    return this.files.get(u.companyId, id);
  }

  @Patch('files/:id')
  @ApiOperation({ summary: 'Update a shipment file header/parties/routing/status' })
  update(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateShipmentFileDto) {
    return this.files.update(u.companyId, id, dto);
  }

  @Delete('files/:id')
  @ApiOperation({ summary: 'Cancel a shipment file (soft)' })
  cancel(@CurrentUser() u: any, @Param('id') id: string) {
    return this.files.cancel(u.companyId, id);
  }
}
