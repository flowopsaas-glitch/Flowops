import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CaptureEpodDto {
  @ApiProperty() @IsString() waybillId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() driverId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatureUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() recipientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() recipientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() geoLat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() geoLng?: number;
}

export class VerifyEpodDto {
  @ApiPropertyOptional() @IsOptional() @IsString() verifiedBy?: string;
}

export class DisputeEpodDto {
  @ApiProperty() @IsString() reason: string;
}
