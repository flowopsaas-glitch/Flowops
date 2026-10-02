import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RawString } from '../../common/decorators/raw-string.decorator';

/**
 * One prior chat turn replayed by the browser. The server keeps no chat state,
 * so history is UNTRUSTED input: the service re-validates role and content and
 * drops anything that is not a plain user/assistant turn.
 *
 * `role` is deliberately a free string here (the UI also sends `system` notes);
 * rejecting those with a 400 would break the chat. The service filters instead.
 */
export class ClawChatHistoryItemDto {
  @IsString()
  @MaxLength(32)
  role!: string;

  @RawString()
  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class ClawChatLiveMetricsDto {
  @IsOptional()
  @IsNumber()
  risks?: number;

  @IsOptional()
  @IsNumber()
  activeDrivers?: number;
}

export class ClawChatTelemetryDto {
  @IsOptional()
  @IsNumber()
  contextTokens?: number;
}

export class ClawChatContextDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ClawChatLiveMetricsDto)
  liveMetrics?: ClawChatLiveMetricsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ClawChatHistoryItemDto)
  history?: ClawChatHistoryItemDto[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ClawChatTelemetryDto)
  telemetry?: ClawChatTelemetryDto;
}

/**
 * Body of POST /ai/claw-chat/query.
 *
 * `companyId` is intentionally NOT declared: the tenant always comes from the
 * JWT. The shipped UI still sends `companyId: 1`; with `whitelist: true` the
 * global ValidationPipe strips it, which is the behaviour we want.
 */
export class ClawChatQueryDto {
  @RawString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  command!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ClawChatContextDto)
  context?: ClawChatContextDto;
}
