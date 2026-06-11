import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEmailHubItemDto {
  @IsOptional()
  @IsIn([
    'COLLECTION_REQUEST',
    'POD',
    'QUOTE',
    'FEEDBACK',
    'NOTIFICATION',
    'AI_MONITOR',
    'GENERAL',
  ])
  type?:
    | 'COLLECTION_REQUEST'
    | 'POD'
    | 'QUOTE'
    | 'FEEDBACK'
    | 'NOTIFICATION'
    | 'AI_MONITOR'
    | 'GENERAL';

  @IsOptional()
  @IsIn(['NEW', 'TRIAGED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'ARCHIVED'])
  status?:
    | 'NEW'
    | 'TRIAGED'
    | 'IN_PROGRESS'
    | 'WAITING'
    | 'RESOLVED'
    | 'ARCHIVED';

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  aiSummary?: string;

  @IsOptional()
  @IsNumber()
  aiConfidence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aiCategory?: string;

  @IsOptional()
  @IsString()
  aiSuggestedAction?: string;

  @IsOptional()
  @IsString()
  opsNote?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedToId?: number;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsBoolean()
  needsOpsAction?: boolean;
}