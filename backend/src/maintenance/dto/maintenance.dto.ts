import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_WARRANTY_TERM_DAYS } from '../maintenance.rules';

export const ASSET_CLASSES = [
  'REACH_STACKER',
  'RTG',
  'RMG',
  // Terminal plant a container operator actually holds. Added after the first
  // real fleet was described: 60 straddle carriers and 40 haulers had nowhere
  // to go but OTHER, which would have merged them into one meaningless class.
  'STRADDLE_CARRIER',
  'FORKLIFT',
  'TRACTOR',
  'TRUCK',
  'HAULER',
  'TRAILER',
  'GENSET',
  'CRANE',
  'PUMP',
  'OTHER',
] as const;

export const ASSET_METER_TYPES = ['HOURS', 'KM'] as const;
export const ASSET_STATUSES = ['IN_SERVICE', 'DOWN', 'UNDER_REPAIR', 'RETIRED'] as const;
export const JOB_TYPES = ['BREAKDOWN', 'PLANNED', 'INSPECTION', 'RECALL'] as const;
export const JOB_STATUSES = ['REPORTED', 'IN_PROGRESS', 'COMPLETED', 'SIGNED_OFF', 'CANCELLED'] as const;
export const COST_KINDS = ['PART', 'LABOUR', 'OUTSIDE_SERVICE', 'TRAVEL', 'CONSUMABLE'] as const;

export type AssetClassValue = (typeof ASSET_CLASSES)[number];
export type AssetMeterTypeValue = (typeof ASSET_METER_TYPES)[number];
export type AssetStatusValue = (typeof ASSET_STATUSES)[number];
export type JobTypeValue = (typeof JOB_TYPES)[number];
export type CostKindValue = (typeof COST_KINDS)[number];

/**
 * Registering a unit.
 *
 * `assetCode` is required and immutable once set: it is the unit number that a
 * job card, a workshop invoice and a phone call all refer to. Renaming it later
 * is possible through the update endpoint only while the unit has no job cards —
 * after that it is the key to its own history.
 */
export class CreateAssetDto {
  @ApiProperty({ example: 'RS-014', description: 'The operator’s own unit number.' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  assetCode!: string;

  @ApiPropertyOptional({ example: 'Reach stacker 14' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ enum: ASSET_CLASSES })
  @IsIn(ASSET_CLASSES as unknown as string[])
  assetClass!: AssetClassValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  make?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Contract holder whose work this unit serves.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  custodian?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  site?: string;

  @ApiPropertyOptional({ enum: ASSET_METER_TYPES, description: 'HOURS for plant, KM for road units.' })
  @IsOptional()
  @IsIn(ASSET_METER_TYPES as unknown as string[])
  meterType?: AssetMeterTypeValue;

  @ApiPropertyOptional({ description: 'Opening meter reading. Omit if the unit has never been read.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  meterReading?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  commissionedAt?: string;

  @ApiPropertyOptional({
    description:
      'Supplier carrying the machine warranty — Kalmar, Terex, whoever holds the contract. Named, because a failed claim needs an addressee.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  warrantySupplier?: string;

  @ApiPropertyOptional({
    description: 'When the supplier term began — delivery or commissioning, not the day it was typed in.',
  })
  @IsOptional()
  @IsISO8601()
  warrantyStartAt?: string;

  @ApiPropertyOptional({
    example: 913,
    description:
      'The term in days — 30 months is 913. Blank means "not recorded", which is a different fact from "no warranty".',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_WARRANTY_TERM_DAYS)
  warrantyTermDays?: number;

  @ApiPropertyOptional({
    example: 365,
    description:
      'How often the term must be serviced to stay alive, in days. The annual labour-only service on a 30-month term is 365.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1825)
  warrantyServiceIntervalDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

/**
 * Editing a unit.
 *
 * Deliberately excludes `id`, `companyId` and `createdAt`; `assetCode` is only
 * accepted through the service's own immutability check (it refuses once the
 * unit has job cards), because a rename that orphaned history would be
 * indistinguishable from a deletion.
 */
export class UpdateAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  assetCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ASSET_STATUSES })
  @IsOptional()
  @IsIn(ASSET_STATUSES as unknown as string[])
  status?: AssetStatusValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  custodian?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  site?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Supplier carrying the machine warranty.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  warrantySupplier?: string | null;

  @ApiPropertyOptional({ description: 'When the supplier term began. Null clears it.' })
  @IsOptional()
  @IsISO8601()
  warrantyStartAt?: string | null;

  @ApiPropertyOptional({ description: 'Term in days. Null clears it — and clearing is not the same as zero.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_WARRANTY_TERM_DAYS)
  warrantyTermDays?: number | null;

  @ApiPropertyOptional({ description: 'Service interval that keeps the term alive, in days. Null clears it.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1825)
  warrantyServiceIntervalDays?: number | null;
}

export class RecordMeterDto {
  @ApiProperty({ description: 'New reading. May not be lower than the last accepted one.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  reading!: number;

  @ApiPropertyOptional({ enum: ['MANUAL', 'IMPORT'], default: 'MANUAL' })
  @IsOptional()
  @IsIn(['MANUAL', 'IMPORT'])
  source?: 'MANUAL' | 'IMPORT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  recordedByName?: string;
}

/**
 * The commercial chain: quoted → authorised → worked → invoiced → paid.
 *
 * Every field is optional and every field is nullable, because a contractor
 * records the step he is standing in. Sending `null` withdraws a value that was
 * entered against the wrong card — which is a correction, and a different act
 * from leaving the field out. The service records both in the event trail.
 *
 * `quotationAmount` is the only amount. What the job actually cost is the sum
 * of its cost rows; storing a second total would let the two disagree and the
 * disagreement would surface in an argument, not in a report.
 */
export class UpdateCommercialDto {
  @ApiPropertyOptional({ example: 42500, description: 'What was quoted, in the job currency.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quotationAmount?: number | null;

  @ApiPropertyOptional({ description: 'When the quotation went to the customer.' })
  @IsOptional()
  @IsISO8601()
  quotationAt?: string | null;

  @ApiPropertyOptional({ example: 'PO-2026-118423', description: 'The order reference. Required with purchaseOrderAt.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  purchaseOrderNumber?: string | null;

  @ApiPropertyOptional({ description: 'When the authority actually arrived — the moment work was allowed to start.' })
  @IsOptional()
  @IsISO8601()
  purchaseOrderAt?: string | null;

  @ApiPropertyOptional({ description: 'When the invoice was issued. Cannot precede completion.' })
  @IsOptional()
  @IsISO8601()
  invoicedAt?: string | null;

  @ApiPropertyOptional({ description: 'When the invoice was settled.' })
  @IsOptional()
  @IsISO8601()
  paidAt?: string | null;
}

export class CreateFaultCodeDto {
  @ApiProperty({ example: 'HYD-LEAK', description: 'Short code; unique per company.' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @ApiProperty({ example: 'Hydraulic leak' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label!: string;

  @ApiPropertyOptional({ description: 'Where to look first — carried onto the job card.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  guidance?: string;
}

/**
 * Raising a job card.
 *
 * `faultDescription` is mandatory even when a fault code is supplied: the code
 * groups, the sentence explains. Requiring both is what lets the same card be
 * read by a report and by a technician.
 *
 * `idempotencyKey` exists because these are raised in a yard on a phone. A
 * double tap, a retry after a timeout and a duplicate from a flaky connection
 * must all produce one card.
 */
export class CreateJobDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  assetId!: string;

  @ApiProperty({ enum: JOB_TYPES })
  @IsIn(JOB_TYPES as unknown as string[])
  type!: JobTypeValue;

  @ApiProperty({ example: 'Hydraulic oil leaking at the boom cylinder' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  faultDescription!: string;

  @ApiPropertyOptional({ description: 'Fault code id. Required for comeback detection to work.' })
  @IsOptional()
  @IsString()
  faultCodeId?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp. Defaults to now.' })
  @IsOptional()
  @IsISO8601()
  reportedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reportedByName?: string;

  @ApiPropertyOptional({ description: 'Meter reading at the time the fault was reported.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  meterAtJob?: number;

  @ApiPropertyOptional({
    description:
      'Client-generated key. Repeating the same key returns the original card instead of creating a second one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description:
      'Force the lineage to a specific earlier job. Normally detected from the fault code; use this only when the detection is wrong.',
  })
  @IsOptional()
  @IsString()
  priorJobId?: string;
}

export class StartJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  startedByName?: string;
}

/**
 * Completing a job.
 *
 * Everything here is a fact about the repair: what was done, how long it took,
 * what the meter said, and what term (if any) this job carries. The warranty
 * clock is set from `completedAt`, which the service stamps — not from anything
 * the caller sends — so a term cannot be back-dated to cover an old failure.
 */
export class CompleteJobDto {
  @ApiProperty({ example: 'Replaced boom cylinder seal kit, bled and tested' })
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  workPerformed!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  completedAt?: string;

  @ApiPropertyOptional({ description: 'Labour hours charged on this job.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  labourHours?: number;

  @ApiPropertyOptional({ description: 'Meter reading when the unit went back to work.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  meterAtJob?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  invoiceRef?: string;

  @ApiPropertyOptional({
    type: Number,
    description:
      'Warranty this job carries, in days (1–3650). Omit when none — an omitted term reads as "not recorded", never as "no warranty". "Lifetime" is refused.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  warrantyTermDays?: number;
}

export class SignOffJobDto {
  @ApiProperty({ description: 'Who accepted the work — the custodian’s representative.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  signedOffBy!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  signedOffAt?: string;
}

export class CancelJobDto {
  @ApiProperty({ description: 'Why this card is being withdrawn. Kept on the record.' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class AddJobCostDto {
  @ApiProperty({ enum: COST_KINDS })
  @IsIn(COST_KINDS as unknown as string[])
  kind!: CostKindValue;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity?: number;

  @ApiProperty({ description: 'Cost per unit, in the job’s currency.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;
}

export class AddJobNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  note!: string;
}

export class ListAssetsQuery {
  @ApiPropertyOptional({ description: 'Matches unit number, name or serial.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: ASSET_STATUSES })
  @IsOptional()
  @IsIn(ASSET_STATUSES as unknown as string[])
  status?: AssetStatusValue;

  @ApiPropertyOptional({ enum: ASSET_CLASSES })
  @IsOptional()
  @IsIn(ASSET_CLASSES as unknown as string[])
  assetClass?: AssetClassValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  site?: string;

  @ApiPropertyOptional({ default: 200, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}

export class ListJobsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional({ enum: JOB_STATUSES })
  @IsOptional()
  @IsIn(JOB_STATUSES as unknown as string[])
  status?: (typeof JOB_STATUSES)[number];

  @ApiPropertyOptional({ enum: JOB_TYPES })
  @IsOptional()
  @IsIn(JOB_TYPES as unknown as string[])
  type?: JobTypeValue;

  @ApiPropertyOptional({ description: 'Only cards raised on or after this date.' })
  @IsOptional()
  @IsISO8601()
  since?: string;

  @ApiPropertyOptional({ description: 'Only repeat failures (linked to an earlier job).' })
  @IsOptional()
  @IsBoolean()
  // NOT `@Type(() => Boolean)`: `Boolean('false')` is `true`, so the query
  // string `?comebacksOnly=false` would silently filter the list down to
  // comebacks only. The transform accepts the two words and passes booleans
  // through untouched.
  @Transform(({ value }) => (typeof value === 'boolean' ? value : value === 'true'))
  comebacksOnly?: boolean;

  @ApiPropertyOptional({ default: 200, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}

export class AssetHistoryQuery {
  @ApiPropertyOptional({ default: 90, description: 'Window for availability and cost, in days.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  windowDays?: number;
}

export class MaintenanceSummaryQuery {
  @ApiPropertyOptional({ default: 30, description: 'Window the verdict describes, in days.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;
}
