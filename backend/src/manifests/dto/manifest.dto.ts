import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Payload types for the manifest module.
 *
 * These replace `@Body() body: any` on three endpoints. The reason is not
 * tidiness — it is that `ManifestsService.update` does this:
 *
 *     const { companyId: _ignored, ...rest } = dto ?? {};
 *     data: { ...rest, companyId }
 *
 * It strips `companyId` and spreads **everything else** straight into a Prisma
 * write. With an untyped body the global ValidationPipe has no metatype, so
 * `whitelist: true` has nothing to whitelist against and the raw JSON reaches
 * that spread. A caller could set `id` (re-pointing every ManifestWaybill and
 * TripCostEntry foreign key at a new primary key), `createdAt`, or any field
 * the model grows later.
 *
 * Two of these fields are now actively dangerous rather than merely available:
 *
 *   `code`   Migration 20261113090000 made (companyId, code) unique and the
 *            service generates codes as COUNT()+1 under an advisory lock. Let
 *            a caller set `code` and they can pick a value that already exists
 *            (turning a working create into a 409) or one that the generator
 *            will hand out later — recreating exactly the collision the
 *            constraint was added to prevent. It is therefore NOT a writable
 *            field here.
 *
 *   `branchId` / `driverId`  Kept, because they are the legitimate things to
 *            change on a manifest, and both are validated as strings rather
 *            than trusted as objects.
 */

export class CreateManifestDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'A manifest needs at least one waybill.' })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  waybillIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  driverId?: string;

  // NOTE: the service signature also accepts `destination`, but nothing in it
  // is ever read — `create()` builds its row from waybillIds, branchId and
  // driverId only. It is deliberately absent here: a field the API accepts and
  // silently ignores is worse than no field, because callers reasonably assume
  // it did something.
}

export class UpdateManifestDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  driverId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  pdfKey?: string;

  // Set by receiveManifest() when a linehaul lands at the destination depot.
  @IsOptional()
  @IsBoolean()
  dispatched?: boolean;

  @IsOptional()
  @IsDateString()
  dispatchedAt?: string;

  // `code`, `id`, `companyId`, `createdAt`, `updatedAt`, `waybills` and
  // `tripCostEntries` are all absent on purpose. The service spreads whatever
  // it is given into a Prisma write, so every field left out here is a field a
  // caller can no longer set. That is the point.
}

export class CreateLinehaulDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'A linehaul needs at least one waybill.' })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  waybillIds: string[];

  @IsString()
  @MaxLength(64)
  destinationBranchId: string;
}
