import { IsIn, IsOptional, IsString } from 'class-validator';

export class AIEventQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
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
  source?:
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
  type?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  @IsIn(['OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'])
  status?: 'OPEN' | 'TRIAGED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';
}