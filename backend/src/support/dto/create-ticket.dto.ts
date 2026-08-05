import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high'])
  priority?: 'low' | 'normal' | 'high';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  /** The agent conversation that led to the escalation (optional). */
  @IsOptional()
  transcript?: any;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aiSummary?: string;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  resolution?: string;
}
