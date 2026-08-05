import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarketTrendsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() segment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timeframe?: string; // '7d' | '30d' | '90d' | '1y'
}

export class AskMarketInsightDto {
  @ApiPropertyOptional() @IsOptional() @IsString() question?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() context?: string;
}
