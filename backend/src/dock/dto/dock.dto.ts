import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Dock scheduling DTOs.
 *
 * The interesting constraint is not in the validators — it is that an
 * appointment occupies a *window* on a physical dock, and two windows on the
 * same dock may not overlap. That is enforced in the service inside a
 * transaction, not here, because validation cannot see other rows.
 */

/** Direction of goods through the dock. */
export const DOCK_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'BOTH'] as const;
export type DockDirection = (typeof DOCK_DIRECTIONS)[number];

/** What a dock is willing to accept. */
export const SLOT_TYPES = ['INBOUND', 'OUTBOUND', 'BOTH'] as const;
export type SlotType = (typeof SLOT_TYPES)[number];

/*
 * Appointment lifecycle.
 *
 * Deliberately a machine rather than a free string, because the transitions
 * carry operational meaning: you cannot complete a vehicle that never arrived,
 * and a cancelled appointment must not be resurrected by a late scan.
 */
export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Legal moves. Anything absent from this map is rejected with a 409. */
export const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export class CreateDockSlotDto {
  @IsString()
  warehouseId: string;

  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsEnum(SLOT_TYPES as unknown as string[])
  type?: SlotType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDockSlotDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(SLOT_TYPES as unknown as string[])
  type?: SlotType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAppointmentDto {
  @IsString()
  dockSlotId: string;

  @IsEnum(DOCK_DIRECTIONS as unknown as string[])
  type: DockDirection;

  @IsDateString()
  scheduledStart: string;

  @IsDateString()
  scheduledEnd: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  carrierName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleReg?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class RescheduleAppointmentDto {
  @IsDateString()
  scheduledStart: string;

  @IsDateString()
  scheduledEnd: string;
}

export class TransitionAppointmentDto {
  @IsEnum(APPOINTMENT_STATUSES as unknown as string[])
  status: AppointmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

/** Query shape for listing appointments. All filters are optional and ANDed. */
export class ListAppointmentsQueryDto {
  @IsOptional()
  @IsString()
  dockSlotId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  /** Inclusive lower bound on scheduledStart, ISO 8601. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Exclusive upper bound on scheduledStart, ISO 8601. */
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  take?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;
}
