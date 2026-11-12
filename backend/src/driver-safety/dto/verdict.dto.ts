import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The verdict on a reported incident.
 *
 * `reason` is required in spirit for a rejection but not enforced by the
 * decorator: a rejection with no stated reason is worse for the driver who
 * reported it than a rejection that is simply recorded. The controller asks for
 * it; making it mandatory would turn a missing reason into a 400 on the one
 * path where a dispatcher is most likely to be working fast.
 */
export class VerdictDto {
  @IsEnum(['VERIFIED', 'REJECTED'] as unknown as string[]) verdict: string;

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
