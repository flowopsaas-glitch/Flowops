import { IsString, IsOptional, IsInt, IsEnum, IsDateString, Min } from 'class-validator';
import { IntermodalLegMode, IntermodalLegStatus } from '@prisma/client';

export class CreateIntermodalLegDto {
  @IsInt() @Min(1)
  sequence!: number;

  @IsEnum(IntermodalLegMode)
  mode!: IntermodalLegMode;

  @IsOptional() @IsEnum(IntermodalLegStatus)
  status?: IntermodalLegStatus;

  @IsOptional() @IsString()
  fromLocation?: string;

  @IsOptional() @IsString()
  toLocation?: string;

  @IsOptional() @IsString()
  handler?: string;

  @IsOptional() @IsDateString()
  plannedStart?: string;

  @IsOptional() @IsDateString()
  plannedEnd?: string;

  @IsOptional() @IsString()
  note?: string;
}

export class AdvanceStatusDto {
  @IsString()
  status!: string;

  @IsOptional() @IsString()
  note?: string;

  @IsOptional() @IsString()
  location?: string;
}
