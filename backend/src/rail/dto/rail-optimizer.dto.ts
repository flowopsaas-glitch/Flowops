import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { RawString } from '../../common/decorators/raw-string.decorator';

/**
 * Schedule Optimizer (RAIL slot allocation decision support) — Phase 2 of the
 * event-driven rail architecture. The optimizer PROPOSES; humans APPLY through
 * the normal allocate/reject workflow.
 */

const CODE = /^[A-Z0-9-]{2,40}$/;

export class OptimizerCapacityDto {
  @RawString() @IsString() @Matches(CODE, { message: 'corridorCode must look like COR-ORE' })
  corridorCode!: string;

  @IsInt() @Min(0) @Max(10_000)
  trainsPerWeek!: number;
}

export class RunOptimizerDto {
  /**
   * Declared weekly capacity per corridor (e.g. from Annexure 33b). Corridors
   * absent from this list are never allocated — the optimizer never invents capacity.
   */
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OptimizerCapacityDto)
  capacity!: OptimizerCapacityDto[];
}

export class OptimizerDecisionDto {
  @RawString() @IsString() @MaxLength(60)
  applicationId!: string;

  @IsIn(['ALLOCATE', 'REJECT'])
  action!: 'ALLOCATE' | 'REJECT';

  @IsOptional() @IsDateString()
  validFrom?: string;

  @IsOptional() @IsDateString()
  validUntil?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(120)
  imReference?: string;

  /** Required for REJECT — becomes the application's rejection reason. */
  @RawString() @IsOptional() @IsString() @MaxLength(2000)
  reason?: string;
}

export class ApplyOptimizerDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OptimizerDecisionDto)
  decisions!: OptimizerDecisionDto[];
}
