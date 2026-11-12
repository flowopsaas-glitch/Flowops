import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

/**
 * User bodies.
 *
 * `create` and `update` both build their Prisma writes field by field, so this
 * was not mass-assignable. The gaps were: `permissions` accepted as any JSON at
 * all (an object where an array belongs is a Prisma error, and a caller could
 * write an arbitrarily large blob), `password` with no length bound — it is
 * bcrypt-hashed at cost 12, so an unbounded string is a CPU-cost lever — and
 * `role` validated three layers down rather than at the edge.
 *
 * Role is constrained to the UserRole enum here as well as in the service. Two
 * checks are deliberate: the DTO turns a bad role into a 400 that names the
 * field, and the service keeps its own check so a future caller that skips the
 * pipe is still safe.
 */

export class CreateUserDto {
  @IsEmail() @MaxLength(200) email: string;

  @IsOptional() @IsString() @MaxLength(120) name?: string;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;

  @IsOptional() @IsEnum(UserRole) role?: UserRole;

  /**
   * An array of permission keys. Bounded by count and by key length so a caller
   * cannot store an unbounded blob on the user row.
   */
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true })
  permissions?: string[];

  /**
   * Optional — the service generates a random one when absent. Bounded on both
   * ends: bcrypt ignores everything past 72 bytes, so a longer password buys
   * nothing and costs hashing time on every login.
   */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) password?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;

  /**
   * The service re-validates this against the enum and re-checks that the
   * caller is allowed to grant it. Constrained here too so a bad role is a
   * 400 naming the field.
   */
  @IsOptional() @IsEnum(UserRole) role?: UserRole;

  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true })
  permissions?: string[];

  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) password?: string;
}
