import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { WagonType } from '@prisma/client';

export class CreateWagonDto {
  @IsString()
  wagonNumber!: string;

  @IsOptional() @IsEnum(WagonType)
  type?: WagonType;

  @IsOptional() @IsNumber()
  tareTonnes?: number;

  @IsOptional() @IsNumber()
  loadedTonnes?: number;

  @IsOptional() @IsString()
  commodity?: string;

  @IsOptional() @IsString()
  sealNumbers?: string;

  @IsOptional() @IsString()
  lastKnownSiding?: string;
}
