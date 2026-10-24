import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MarketTrendsService } from './market-trends.service';
import { MarketTrendsQueryDto, AskMarketInsightDto } from './dto/market-trends.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { FeatureGuard } from '../billing/feature.guard';
import { RequireFeature } from '../billing/require-feature.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Market Trends')
@ApiBearerAuth()
@UseGuards(FeatureGuard)
@RequireFeature('marketTrends')
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.VIEWER)
@Controller('market-trends')
export class MarketTrendsController {
  constructor(private readonly svc: MarketTrendsService) {}

  @Get()
  getTrends(@CurrentUser() u: any, @Query() query: MarketTrendsQueryDto) {
    return this.svc.getMarketTrends(u.companyId, query);
  }

  @Post('insight')
  getInsight(@CurrentUser() u: any, @Body() dto: AskMarketInsightDto) {
    return this.svc.getInsight(u.companyId, dto.question, dto.context);
  }
}
