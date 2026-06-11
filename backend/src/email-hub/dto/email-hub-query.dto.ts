import { IsIn, IsOptional, IsString } from 'class-validator';

export class EmailHubQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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
}