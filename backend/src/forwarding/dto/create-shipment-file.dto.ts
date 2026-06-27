import { IsEnum, IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';
import { FreightMode, FreightDirection, LoadType } from '@prisma/client';

export class CreateShipmentFileDto {
  @IsEnum(FreightMode)
  mode: FreightMode;

  @IsEnum(FreightDirection)
  direction: FreightDirection;

  @IsEnum(LoadType)
  loadType: LoadType;

  @IsOptional() @IsString() incoterm?: string;

  // Parties
  @IsOptional() @IsString() shipperName?: string;
  @IsOptional() @IsString() consigneeName?: string;
  @IsOptional() @IsString() notifyParty?: string;
  @IsOptional() @IsString() carrierName?: string;
  @IsOptional() @IsString() agentName?: string;

  // Cargo summary
  @IsOptional() @IsString() goodsDescription?: string;
  @IsOptional() @IsNumber() packages?: number;
  @IsOptional() @IsNumber() grossWeightKg?: number;
  @IsOptional() @IsNumber() volumeCbm?: number;

  // Routing
  @IsOptional() @IsString() pol?: string;
  @IsOptional() @IsString() pod?: string;
  @IsOptional() @IsString() vesselVoyage?: string;
  @IsOptional() @IsDateString() etd?: string;
  @IsOptional() @IsDateString() eta?: string;
}
