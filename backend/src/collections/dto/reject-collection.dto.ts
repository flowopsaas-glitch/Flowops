import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectCollectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}