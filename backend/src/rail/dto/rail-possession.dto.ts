import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RailPossessionKind } from '@prisma/client';
import { RawString } from '../../common/decorators/raw-string.decorator';

export class CreatePossessionDto {
  @RawString() @IsString() @Matches(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, { message: 'corridorCode must look like COR-ORE' }) @MaxLength(40)
  corridorCode!: string;
  @IsEnum(RailPossessionKind) kind!: RailPossessionKind;
  @RawString() @IsString() @MinLength(3) @MaxLength(160) title!: string;
  @RawString() @IsOptional() @IsString() @MaxLength(200) location?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(120) imReference?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsDateString() noticeGivenAt?: string;
}
