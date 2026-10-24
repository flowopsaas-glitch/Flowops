import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RateCardsService } from './rate-cards.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Rate Cards')
@ApiBearerAuth()
@RequireFeature('rateCards')
@Controller('rate-cards')
export class RateCardsController {
  constructor(private readonly svc: RateCardsService) {}

  @Get()
  findAll(@CurrentUser() u: any) {
    return this.svc.findAll(u.companyId);
  }

  @Post()
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body);
  }

  @Post('calculate')
  calculate(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.calculate(u.companyId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.update(id, u.companyId, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.remove(id, u.companyId);
  }
}
