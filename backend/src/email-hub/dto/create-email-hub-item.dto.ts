import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsIn,
} from 'class-validator';

export class CreateEmailHubItemDto {
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

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string;

  @IsEmail()
  senderEmail!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  collectionId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quoteId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  clientId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  waybillNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  podNumber?: string;

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