import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { RawString } from '../../common/decorators/raw-string.decorator';

/**
 * Body of POST /ai/repair-route.
 *
 * Two shapes reach this endpoint and both must keep working:
 *   - the documented one: { errorCode, logs, routeId }
 *   - the one the browser's axios interceptor actually sends on any 404/500
 *     (frontend/src/api/aiSupervisorApi.ts): { failedPath, error, timestamp }
 * Every field is therefore optional; the controller supplies the same defaults
 * it always did. Lengths are capped because the text is forwarded to an LLM.
 */
export class RepairRouteDto {
  @RawString() @IsOptional() @IsString() @MaxLength(100)
  errorCode?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(4000)
  logs?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(200)
  routeId?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(500)
  failedPath?: string;

  @RawString() @IsOptional() @IsString() @MaxLength(1000)
  error?: string;

  @IsOptional() @IsISO8601()
  timestamp?: string;
}
