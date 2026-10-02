import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { RawNumber, RawString } from '../../common/decorators/raw-string.decorator';

export class RecordWeighbridgeReadingDto {
  @RawString() @IsString() @MinLength(1) @MaxLength(60) consignmentId!: string;
  /** Must be a wagon registered on that consignment. */
  @RawString() @IsString() @MinLength(1) @MaxLength(60) wagonNumber!: string;
  /** Gross mass of the wagon on the weighbridge, in tonnes (a single wagon cannot exceed 1000 t). */
  @RawNumber() @IsNumber() @Min(0.001) @Max(1000) actualTonnes!: number;
  /** Defaults to the wagon's registered axle count. */
  @RawNumber() @IsOptional() @IsInt() @Min(1) @Max(12) axles?: number;
  /**
   * A limit to judge THIS reading against (e.g. the wagon's own rating). The corridor's VERIFIED maximum axle load is
   * authoritative: when both exist the STRICTER applies, so this can tighten the check but never relax it. When neither
   * exists the reading is recorded as UNVERIFIED — it never passes and never holds.
   */
  @RawNumber() @IsOptional() @IsNumber() @Min(0.1) @Max(60) maxAxleLoadTonnes?: number;
  @RawString() @IsOptional() @IsString() @MaxLength(120) weighbridge?: string;
  /** When it was weighed. Defaults to now; cannot be in the future. */
  @IsOptional() @IsDateString() weighedAt?: string;
  @RawString() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
