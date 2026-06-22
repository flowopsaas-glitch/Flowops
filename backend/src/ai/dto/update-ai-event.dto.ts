import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAIEventDto {
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  @IsIn(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'])
  status?: 'OPEN' | 'TRIAGED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsString()
  suggestedAction?: string;

  @IsOptional()
  @IsNumber()
  aiConfidence?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiScore?: number;

  @IsOptional()
  @IsString()
  aiModel?: string;

  @IsOptional()
  @IsString()
  resolutionNote?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedToId?: number;
}