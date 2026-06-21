import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAIEventDto {
  @IsIn([
    'EMAIL_HUB',
    'WHATSAPP_HUB',
    'COLLECTIONS',
    'QUOTES',
    'BILLING',
    'NOTIFICATIONS',
    'SUPERADMIN',
    'AI_SUPERVISOR',
    'SYSTEM',
    'MANUAL',
  ])
  source!:
    | 'EMAIL_HUB'
    | 'WHATSAPP_HUB'
    | 'COLLECTIONS'
    | 'QUOTES'
    | 'BILLING'
    | 'NOTIFICATIONS'
    | 'SUPERADMIN'
    | 'AI_SUPERVISOR'
    | 'SYSTEM'
    | 'MANUAL';

  @IsOptional()
  @IsIn([
    'DELAY_RISK',
    'POD_MISSING',
    'QUOTE_STALE',
    'BILLING_ANOMALY',
    'COLLECTION_RISK',
    'CLIENT_CHURN',
    'UPGRADE_INTENT',
    'DEMO_REQUEST',
    'SUPPORT_ESCALATION',
    'ONBOARDING_INCOMPLETE',
    'FRAUD_SIGNAL',
    'ROUTE_ANOMALY',
    'GENERAL',
  ])
  type?:
    | 'DELAY_RISK'
    | 'POD_MISSING'
    | 'QUOTE_STALE'
    | 'BILLING_ANOMALY'
    | 'COLLECTION_RISK'
    | 'CLIENT_CHURN'
    | 'UPGRADE_INTENT'
    | 'DEMO_REQUEST'
    | 'SUPPORT_ESCALATION'
    | 'ONBOARDING_INCOMPLETE'
    | 'FRAUD_SIGNAL'
    | 'ROUTE_ANOMALY'
    | 'GENERAL';

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  @IsIn(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'])
  status?: 'OPEN' | 'TRIAGED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  summary!: string;

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsString()
  suggestedAction?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiScore?: number;

  @IsOptional()
  @IsNumber()
  aiConfidence?: number;

  @IsOptional()
  @IsString()
  aiModel?: string;

  @IsOptional()
  @IsArray()
  aiSignals?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  clientId?: number;

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
  emailHubItemId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedToId?: number;
}