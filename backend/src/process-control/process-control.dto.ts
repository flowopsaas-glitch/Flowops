import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const LIFECYCLE_TARGETS = ['PILOT', 'APPROVED', 'RETIRED', 'DRAFT'];
const STEP_TYPES = ['MANUAL', 'AUTOMATED', 'DECISION', 'INSPECTION', 'APPROVAL', 'HANDOFF', 'WAIT'];
const SEVERITIES = ['MINOR', 'MAJOR', 'BLOCKING', 'CRITICAL'];

export class CreateProcessDefinitionDto {
  @ApiProperty({ example: 'WMS.GOODS_RECEIPT', description: 'Stable SOP key, unique per tenant' })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  code: string;

  @ApiProperty({ example: 'Goods receipt' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ example: 'Warehouse' })
  @IsOptional() @IsString() @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ example: 'WAREHOUSE', description: 'Role accountable for the standard' })
  @IsOptional() @IsString() @MaxLength(80)
  ownerRole?: string;
}

export class ProcessStepDto {
  @ApiProperty({ example: 1 })
  @IsInt() @Min(1)
  stepNumber: number;

  @ApiProperty({ example: 'VERIFY_SKU', description: 'Stable within the version' })
  @IsString() @MinLength(2) @MaxLength(80)
  code: string;

  @ApiProperty({ example: 'Validate product / variant / SKU' })
  @IsString() @MinLength(2) @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: STEP_TYPES })
  @IsOptional() @IsIn(STEP_TYPES)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isAutomated?: boolean;

  @ApiPropertyOptional({
    description: 'High-consequence steps stay human-confirmed even when automation is drafted',
  })
  @IsOptional() @IsBoolean()
  requiresHumanApproval?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  requiresEvidence?: boolean;

  @ApiPropertyOptional({ example: { required: ['countedQty'] } })
  @IsOptional() @IsObject()
  evidenceSchema?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { nonNegative: ['countedQty'] } })
  @IsOptional() @IsObject()
  validationRules?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'INSPECT_QUANTITY' })
  @IsOptional() @IsString()
  nextStepOnSuccess?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  nextStepOnFailure?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  nextStepOnException?: string;

  @ApiPropertyOptional({ example: ['WAREHOUSE', 'MANAGER'] })
  @IsOptional() @IsArray() @IsString({ each: true })
  allowedRoles?: string[];

  @ApiPropertyOptional({ example: 60 })
  @IsOptional() @IsInt() @Min(1)
  slaMinutes?: number;
}

export class CreateProcessVersionDto {
  @ApiProperty({ type: [ProcessStepDto] })
  @IsArray()
  steps: ProcessStepDto[];

  @ApiPropertyOptional({ description: 'Automation rules (draft/assist only by default)' })
  @IsOptional() @IsArray()
  automationRules?: Record<string, unknown>[];
}

export class TransitionProcessVersionDto {
  @ApiProperty({ enum: LIFECYCLE_TARGETS })
  @IsIn(LIFECYCLE_TARGETS)
  to: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;
}

export class StartProcessInstanceDto {
  @ApiPropertyOptional({ example: 'WMS.GOODS_RECEIPT' })
  @IsOptional() @IsString()
  definitionCode?: string;

  @ApiPropertyOptional({ example: 'WMS.GOODS_RECEIPT:GR-2026-00001' })
  @IsOptional() @IsString()
  definitionId?: string;

  @ApiProperty({
    example: 'GR-2026-00001',
    description: 'Tenant-unique business key. Replays return the existing instance.',
  })
  @IsString() @MinLength(1) @MaxLength(160)
  businessKey: string;

  @ApiPropertyOptional({ description: 'Context snapshot (PO, supplier, warehouse …)' })
  @IsOptional() @IsObject()
  context?: Record<string, unknown>;
}

export class CompleteStepDto {
  @ApiProperty({ example: 'SUCCESS', enum: ['SUCCESS', 'FAILURE', 'EXCEPTION'] })
  @IsIn(['SUCCESS', 'FAILURE', 'EXCEPTION'])
  outcome: string;

  @ApiPropertyOptional({ description: 'Evidence captured for this step' })
  @IsOptional() @IsObject()
  evidence?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Structured result of the step' })
  @IsOptional() @IsObject()
  result?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Advance to this step code instead of the configured successor' })
  @IsOptional() @IsString()
  nextStepCode?: string;
}

export class RaiseIncidentDto {
  @ApiProperty({ example: 'QUANTITY_VARIANCE' })
  @IsString() @MinLength(2) @MaxLength(80)
  code: string;

  @ApiProperty({ example: 'Received 98 of 100 units' })
  @IsString() @MinLength(2) @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ enum: SEVERITIES, default: 'MINOR' })
  @IsOptional() @IsIn(SEVERITIES)
  severity?: string;

  @ApiPropertyOptional({
    description: 'Overrides the severity default — BLOCKING and CRITICAL stop the process',
  })
  @IsOptional() @IsBoolean()
  isBlocking?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  stepInstanceId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  evidence?: Record<string, unknown>;
}

export class ResolveIncidentDto {
  @ApiProperty({ example: 'Short-shipped by supplier, credit note raised' })
  @IsString() @MinLength(2) @MaxLength(4000)
  resolution: string;

  @ApiPropertyOptional({ description: 'Move to INVESTIGATING / ESCALATED instead of RESOLVED' })
  @IsOptional() @IsIn(['INVESTIGATING', 'ESCALATED', 'RESOLVED'])
  status?: string;
}

export class ProposeSolutionDto {
  @ApiProperty({ example: 'SUPPLIER_RECONCILIATION' })
  @IsString() @MinLength(2) @MaxLength(80)
  code: string;

  @ApiProperty({ example: 'Reconcile with supplier before booking in' })
  @IsString() @MinLength(2) @MaxLength(200)
  name: string;

  @ApiProperty()
  @IsString() @MinLength(2) @MaxLength(4000)
  description: string;
}

export class ResolveSolutionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'IMPLEMENTED'] })
  @IsIn(['APPROVED', 'REJECTED', 'IMPLEMENTED'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  evidence?: Record<string, unknown>;
}

export class RecordOutcomeDto {
  @ApiPropertyOptional({ enum: ['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'ABANDONED', 'FAILED'] })
  @IsOptional() @IsIn(['COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'ABANDONED', 'FAILED'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(4000)
  lessonsLearned?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  evidence?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  artifacts?: Record<string, unknown>;
}

export class ProposeChangeDto {
  @ApiProperty({ example: 'Add a supplier-reconciliation step' })
  @IsString() @MinLength(2) @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString() @MinLength(2) @MaxLength(8000)
  description: string;

  @ApiProperty({ description: 'Structured description of the proposed changes' })
  @IsObject()
  proposedChanges: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  outcomeId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  incidentId?: string;
}

export class ReviewChangeDto {
  @ApiProperty({ enum: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED'] })
  @IsIn(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(4000)
  reviewNotes?: string;

  @ApiPropertyOptional({ description: 'Version the change was implemented in' })
  @IsOptional() @IsString()
  implementedInVersionId?: string;
}
