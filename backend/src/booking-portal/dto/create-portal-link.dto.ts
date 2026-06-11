import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePortalLinkDto {
  @IsOptional()
  @IsInt()
  clientId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}