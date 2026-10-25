import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnDto, ReturnTransitionDto } from './dto/update-return.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
const RETURN_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.DISPATCH, UserRole.WAREHOUSE,
];


@ApiTags('Returns')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('returns')
@Roles(...RETURN_ROLES)
@Controller()
export class ReturnsController {
  constructor(private readonly svc: ReturnsService) {}

  @Get('returns')
  findAll(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get('returns/stats')
  stats(@CurrentUser() u: any) {
    return this.svc.stats(u.companyId);
  }

  @Get('returns/insights')
  insights(@CurrentUser() u: any) {
    return this.svc.insights(u.companyId);
  }

  @Get('returns/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Post('returns')
  create(@CurrentUser() u: any, @Body() body: CreateReturnDto) {
    return this.svc.create(u.companyId, body);
  }

  @Patch('returns/:id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateReturnDto) {
    return this.svc.update(id, u.companyId, body);
  }

  /**
   * Drive the RMA lifecycle:
   *   approve | reject | schedule | collect | receive | inspect | resolve | cancel
   * e.g. POST /returns/:id/transition/resolve  { resolution: 'REFUND', refundAmount: 1499 }
   */
  @Post('returns/:id/transition/:action')
  transition(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentUser() u: any,
    @Body() body: ReturnTransitionDto,
  ) {
    return this.svc.transition(id, u.companyId, action, body ?? {}, u.id);
  }

  // Hard-delete is restricted to tenant admins/managers; everyday users cancel instead.
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Delete('returns/:id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }
}
