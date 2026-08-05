import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DeliveryNotesService } from './delivery-notes.service';
import { CreateDeliveryNoteDto, UpdateDeliveryNoteDto } from './dto/delivery-note.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Delivery Notes')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('deliveryNotes')
@Controller('delivery-notes')
export class DeliveryNotesController {
  constructor(private readonly svc: DeliveryNotesService) {}

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

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() dto: UpdateDeliveryNoteDto) {
    return this.svc.update(id, u.companyId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.resolve(id, u.companyId);
  }

  @Get('waybill/:waybillId')
  getByWaybill(@Param('waybillId') waybillId: string, @CurrentUser() u: any) {
    return this.svc.getByWaybill(waybillId, u.companyId);
  }
}
