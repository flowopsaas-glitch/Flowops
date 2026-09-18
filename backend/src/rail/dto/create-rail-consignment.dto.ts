import {
  IsString, IsOptional, IsNumber, IsInt, IsEnum, IsDateString, Min,
} from 'class-validator';
import { RiskLevel } from '@prisma/client';

export class CreateRailConsignmentDto {
  @IsString()
  commodity!: string;

  @IsOptional() @IsString()
  clientName?: string;

  @IsOptional() @IsNumber()
  tonnage?: number;

  @IsOptional() @IsInt() @Min(0)
  wagonsPlanned?: number;

  @IsOptional() @IsString()
  corridor?: string;

  @IsOptional() @IsString()
  originSiding?: string;

  @IsOptional() @IsString()
  destinationSiding?: string;

  @IsOptional() @IsString()
  railOperator?: string;

  @IsOptional() @IsString()
  serviceRef?: string;

  @IsOptional() @IsString()
  interchangePoint?: string;

  @IsOptional() @IsDateString()
  plannedDeparture?: string;

  @IsOptional() @IsDateString()
  plannedArrival?: string;

  @IsOptional() @IsInt() @Min(0)
  slaHours?: number;

  @IsOptional() @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional() @IsString()
  riskNote?: string;
}
