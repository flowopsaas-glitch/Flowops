import { IsString, IsOptional, IsBoolean, IsEnum, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum IntegrationTypeEnum {
  SHOPIFY = 'SHOPIFY',
  WOOCOMMERCE = 'WOOCOMMERCE',
  MAGENTO = 'MAGENTO',
  CUSTOM_API = 'CUSTOM_API',
  CSV_IMPORT = 'CSV_IMPORT',
  WEBHOOK = 'WEBHOOK',
}

export class CreateIntegrationDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: IntegrationTypeEnum }) @IsEnum(IntegrationTypeEnum) type: IntegrationTypeEnum;
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsObject() credentials?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoDispatch?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() dispatchRules?: Record<string, any>;
}

export class UpdateIntegrationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoDispatch?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() dispatchRules?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}

export class IngestOrderDto {
  @ApiProperty() @IsString() integrationId: string;
  @ApiProperty() @IsString() externalOrderId: string;
  @ApiProperty() @IsObject() orderData: Record<string, any>;
}
