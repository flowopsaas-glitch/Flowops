import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RateCardsService } from './rate-cards.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CalculateRateDto, CreateRateCardDto, UpdateRateCardDto } from './dto/rate-card.dto';
const RATE_CARD_READ_ROLES = [
  UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
  UserRole.VIEWER,
];


@ApiTags('Rate Cards')
@ApiBearerAuth()
@RequireFeature('rateCards')
@Roles(...RATE_CARD_READ_ROLES)
@Controller('rate-cards')
export class RateCardsController {
  constructor(private readonly svc: RateCardsService) {}

  @Get()
  findAll(@CurrentUser() u: any) {
    return this.svc.findAll(u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Post()
  create(@CurrentUser() u: any, @Body() body: CreateRateCardDto) {
    return this.svc.create(u.companyId, body);
  }

  @Post('calculate')
  calculate(@CurrentUser() u: any, @Body() body: CalculateRateDto) {
    return this.svc.calculate(u.companyId, body);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: UpdateRateCardDto) {
    return this.svc.update(id, u.companyId, body);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }
}
