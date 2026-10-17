import { CollectionStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateCollectionDto {
  @IsString() clientName: string;
  @IsOptional() @IsString() clientPhone?: string;
  @IsOptional() @IsString() clientEmail?: string;
  @IsString() pickupAddress: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() scheduledDate?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class UpdateCollectionDto {
  @IsOptional() @IsEnum(CollectionStatus) status?: CollectionStatus;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() pickupAddress?: string;
  @IsOptional() @IsDateString() scheduledDate?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}
