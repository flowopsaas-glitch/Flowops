import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * SSO (OIDC) configuration.
 *
 * The service is the strictest in the codebase — it hand-validates every field,
 * rejects the legacy `authUrl` / `tokenUrl` / `userInfoUrl` endpoints outright,
 * requires a public HTTPS issuer discovered through trusted metadata, and
 * encrypts the client secret at rest. None of that is duplicated here.
 *
 * What this DTO adds is the part the service cannot do well: rejecting a
 * payload that is the wrong shape *before* it reaches the service's own
 * branches, so the response names the field instead of surfacing one of six
 * possible BadRequestExceptions. The one thing mirrored deliberately is
 * `defaultRole`, because a bad role is the most likely client mistake.
 */

/** Mirrors VALID_ROLES in sso.service.ts. */
export const SSO_DEFAULT_ROLES = [
  'MANAGER',
  'DISPATCH',
  'WAREHOUSE',
  'AGENT',
  'USER',
  'VIEWER',
] as const;

export class UpsertSsoConfigDto {
  @IsOptional() @IsBoolean() enabled?: boolean;

  /** OIDC issuer. Validated as public HTTPS by the service, not duplicated here. */
  @IsOptional() @IsString() @MaxLength(2048) issuer?: string;

  @IsOptional() @IsString() @MaxLength(512) clientId?: string;

  /**
   * Plaintext on the way in, AES encrypted at rest and never returned. Bounded
   * to the same 4096 the service enforces.
   */
  @IsOptional() @IsString() @MaxLength(4096) clientSecret?: string;

  /** Space-separated OIDC scopes. 'openid' is added by the service if missing. */
  @IsOptional() @IsString() @MaxLength(1000) scopes?: string;

  /** One public DNS domain, no wildcard. */
  @IsOptional() @IsString() @MaxLength(253) allowedDomain?: string;

  @IsOptional() @IsBoolean() autoProvision?: boolean;

  @IsOptional() @IsIn(SSO_DEFAULT_ROLES as unknown as string[]) defaultRole?: string;
}
