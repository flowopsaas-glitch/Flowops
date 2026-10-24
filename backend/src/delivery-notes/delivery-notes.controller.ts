import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DeliveryNotesService } from './delivery-notes.service';
import { CreateDeliveryNoteDto, UpdateDeliveryNoteDto } from './dto/delivery-note.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
const DELIVERY_NOTE_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
  UserRole.USER,
];


@ApiTags('Delivery Notes')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('deliveryNotes')
@Roles(...DELIVERY_NOTE_READ_ROLES)
@Controller('delivery-notes')
export class DeliveryNotesController {
  constructor(private readonly svc: DeliveryNotesService) {}

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post()
  create(@CurrentUser() u: any, @Body() dto: CreateDeliveryNoteDto) {
    return this.svc.create(u.companyId, u.sub || u.id, u.name || 'System', dto);
  }

  @Get()
  findAll(@CurrentUser() u: any, @Query() query: any) {
    return this.svc.findAll(u.companyId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: UpdateDeliveryNoteDto) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post(':id/resolve')
  resolve(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.resolve(id, u.companyId);
  }

  @Get('waybill/:waybillId')
  getByWaybill(@Param('waybillId') waybillId: string, @CurrentUser() u: any) {
    return this.svc.getByWaybill(waybillId, u.companyId);
  }
}
