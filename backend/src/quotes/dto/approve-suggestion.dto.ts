import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApproveSuggestionDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}