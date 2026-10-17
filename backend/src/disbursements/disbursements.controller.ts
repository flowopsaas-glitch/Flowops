import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { DisbursementsService } from './disbursements.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

const DISBURSEMENT_READ_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.VIEWER];
const DISBURSEMENT_WRITE_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER];

@ApiTags('Disbursements')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...DISBURSEMENT_READ_ROLES)
@Controller('disbursements')
export class DisbursementsController {
  constructor(private readonly disbursements: DisbursementsService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Outstanding / recovered totals + aging' })
  metrics(@CurrentUser() u: any) {
    return this.disbursements.metrics(u.companyId);
  }

  @Get('recovery-cockpit')
  @ApiOperation({ summary: 'Recovery cockpit: recovery rate, client exposure, needs-invoice & category split' })
  recoveryCockpit(@CurrentUser() u: any) {
    return this.disbursements.recoveryCockpit(u.companyId);
  }

  @Get()
  @ApiOperation({ summary: 'List disbursements' })
  list(@CurrentUser() u: any, @Query() query: any) {
    return this.disbursements.list(u.companyId, query);
  }

  @Post()
  @Roles(...DISBURSEMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Record a disbursement paid on a client behalf' })
  create(@CurrentUser() u: any, @Body() dto: any) {
    return this.disbursements.create(u.companyId, dto);
  }

  @Patch(':id')
  @Roles(...DISBURSEMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Update a disbursement' })
  update(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.disbursements.update(u.companyId, id, dto);
  }

  @Post(':id/recover')
  @Roles(...DISBURSEMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Mark a disbursement recovered from the client' })
  recover(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.disbursements.markRecovered(u.companyId, id, dto?.invoiceId);
  }

  @Patch(':id/status')
  @Roles(...DISBURSEMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Set status (OUTSTANDING|INVOICED|RECOVERED|WRITTEN_OFF)' })
  setStatus(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: { status: string }) {
    return this.disbursements.setStatus(u.companyId, id, dto?.status);
  }

  @Delete(':id')
  @Roles(...DISBURSEMENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Delete a disbursement' })
  remove(@CurrentUser() u: any, @Param('id') id: string) {
    return this.disbursements.remove(u.companyId, id);
  }
}
